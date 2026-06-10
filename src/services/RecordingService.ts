import { IRecordingService, SyncResult } from '../shared/interfaces';
import { Recording, RecordingFilter, RecordingListResult, RenameRule } from '../shared/types';
import { RecordingRepository } from '../database/repositories/RecordingRepository';
import { RenameRuleRepository, normalizeMeetingId } from '../database/repositories/RenameRuleRepository';
import { AccountService } from './AccountService';

export class RecordingService implements IRecordingService {
  constructor(
    private recordingRepo: RecordingRepository,
    private accountService: AccountService,
    private renameRuleRepo?: RenameRuleRepository,
  ) {}

  async list(filter: RecordingFilter): Promise<RecordingListResult> {
    return this.recordingRepo.findByFilter(filter);
  }

  async getById(id: string): Promise<Recording | null> {
    return this.recordingRepo.findById(id);
  }

  async sync(accountId: string, fromDate?: string, toDate?: string): Promise<SyncResult> {
    const account = await this.accountService.getById(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);

    const client = this.accountService.createApiClient(account);

    const to = toDate || new Date().toISOString().split('T')[0];
    const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const logs: string[] = [];
    logs.push(`Syncing "${account.name}" (${from} → ${to})`);

    let newCount = 0;
    let totalFromApi = 0;
    let nextPageToken: string | undefined;

    do {
      const data = await client.listRecordings(from, to, 30, nextPageToken);
      const meetings = data.meetings || [];
      totalFromApi += meetings.length;

      for (const meeting of meetings) {
        const uuid = String(meeting.uuid || meeting.id);
        // Check base UUID and session UUIDs (for multi-session recordings)
        const exists = this.recordingRepo.findByUuid(uuid)
          || this.recordingRepo.findByUuid(`${uuid}__session_1`);
        if (!exists) {
          this.recordingRepo.createFromZoomData(accountId, meeting);
          newCount++;
          logs.push(`+ "${meeting.topic}"`);
        }
      }

      nextPageToken = data.next_page_token || undefined;
    } while (nextPageToken);

    logs.push(`Done: ${newCount} new / ${totalFromApi} total from API`);

    // Auto-apply rename rules to newly synced recordings
    if (newCount > 0) {
      const renamed = this.applyRenameRules();
      if (renamed > 0) logs.push(`Auto-renamed ${renamed} recording(s) by rules`);
    }

    return { accountName: account.name, newCount, totalFromApi, logs };
  }

  async syncAll(fromDate?: string, toDate?: string): Promise<SyncResult[]> {
    const accounts = await this.accountService.list();
    const results: SyncResult[] = [];

    for (const account of accounts) {
      if (account.status === 'active') {
        try {
          const result = await this.sync(account.id, fromDate, toDate);
          results.push(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          results.push({ accountName: account.name, newCount: 0, totalFromApi: 0, logs: [`Error: ${msg}`] });
        }
      }
    }

    return results;
  }

  // Local-only rename. Stores a custom_name that survives re-sync and is never
  // pushed to Zoom Cloud. updateCloud kept for API compatibility (ignored).
  async rename(id: string, newTopic: string, _updateCloud?: boolean): Promise<void> {
    const recording = await this.getById(id);
    if (!recording) throw new Error(`Recording not found: ${id}`);
    // Manual rename — mark it protected so rule re-application won't clear it.
    this.recordingRepo.updateCustomName(id, newTopic, true);
  }

  // Clear the local custom name → revert to the original Zoom topic.
  async clearCustomName(id: string): Promise<void> {
    this.recordingRepo.updateCustomName(id, null, false);
  }

  // === Auto-rename rules ===

  async listRules(): Promise<RenameRule[]> {
    if (!this.renameRuleRepo) return [];
    return this.renameRuleRepo.findAll();
  }

  async createRule(input: Omit<RenameRule, 'id' | 'createdAt'>): Promise<RenameRule> {
    if (!this.renameRuleRepo) throw new Error('Rename rules not available');
    return this.renameRuleRepo.create(input);
  }

  async updateRule(id: string, input: Partial<Omit<RenameRule, 'id' | 'createdAt'>>): Promise<RenameRule> {
    if (!this.renameRuleRepo) throw new Error('Rename rules not available');
    return this.renameRuleRepo.update(id, input);
  }

  async deleteRule(id: string): Promise<void> {
    if (!this.renameRuleRepo) throw new Error('Rename rules not available');
    this.renameRuleRepo.delete(id);
  }

  // Apply all enabled rules to every recording. Returns number of recordings changed.
  applyRenameRules(): number {
    if (!this.renameRuleRepo) return 0;
    const rules = this.renameRuleRepo.findAll().filter((r) => r.enabled);
    // Note: do NOT early-return on 0 rules — we still need to clear stale
    // rule-applied names (e.g. after deleting the last rule).

    const recordings = this.recordingRepo.findAllBasic();
    let changed = 0;
    for (const rec of recordings) {
      const rule = matchRule(rules, rec.meetingId, rec.startTime);

      if (rule) {
        // Matches a rule → apply its name + color (overrides a previous rule name).
        let touched = false;
        if (rule.targetName && rule.targetName !== rec.customName) {
          this.recordingRepo.updateCustomName(rec.id, rule.targetName, false);
          touched = true;
        }
        const newColor = rule.color || null;
        if (newColor !== rec.customColor) {
          this.recordingRepo.updateCustomColor(rec.id, newColor);
          touched = true;
        }
        if (touched) changed++;
      } else if (!rec.nameIsManual && (rec.customName || rec.customColor)) {
        // No rule matches AND the name wasn't typed by the user → it's a stale
        // rule name from a rule that changed/was deleted. Revert to the original.
        this.recordingRepo.updateCustomName(rec.id, null, false);
        this.recordingRepo.updateCustomColor(rec.id, null);
        changed++;
      }
    }
    return changed;
  }

  // === Multi-delete ===

  // Remove recordings from the LOCAL list only (does not touch Zoom Cloud).
  async deleteLocalMany(ids: string[]): Promise<number> {
    return this.recordingRepo.deleteMany(ids);
  }

  // Move multiple recordings to Zoom Trash (cloud). Returns per-id results.
  async deleteCloudMany(ids: string[], permanent = false): Promise<{ ok: string[]; failed: { id: string; error: string }[] }> {
    const ok: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteFromCloud(id, permanent);
        ok.push(id);
      } catch (err: unknown) {
        failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
    return { ok, failed };
  }

  async clearAll(accountId?: string): Promise<number> {
    return this.recordingRepo.clearAll(accountId);
  }

  async deleteFromCloud(id: string, permanent = false): Promise<void> {
    const recording = await this.getById(id);
    if (!recording) throw new Error(`Recording not found: ${id}`);

    const account = await this.accountService.getById(recording.accountId);
    if (!account) throw new Error(`Account not found: ${recording.accountId}`);

    const client = this.accountService.createApiClient(account);

    // Try UUID first (more specific), fallback to meetingId
    try {
      await client.deleteRecording(recording.uuid, permanent);
    } catch {
      await client.deleteRecording(recording.meetingId, permanent);
    }

    this.recordingRepo.updateStatus(id, 'deleted');
  }
}

// Find the target name from the first matching rule (rules are pre-sorted by priority).
// Matches when meeting IDs are equal (ignoring spaces) and the recording's LOCAL
// start time (HH:MM) falls within [startFrom, startTo] inclusive.
function matchRule(rules: RenameRule[], meetingId: string, startTime: string): RenameRule | null {
  const recId = normalizeMeetingId(meetingId);
  const d = new Date(startTime);
  if (isNaN(d.getTime())) return null;
  const recMinutes = d.getHours() * 60 + d.getMinutes();
  const recDate = localDateStr(d); // 'YYYY-MM-DD' in machine-local time

  for (const rule of rules) {
    if (normalizeMeetingId(rule.meetingId) !== recId) continue;
    const from = hhmmToMinutes(rule.startFrom);
    const to = hhmmToMinutes(rule.startTo);
    if (from === null || to === null) continue;
    if (recMinutes < from || recMinutes > to) continue;
    // Optional date-range bounds (the period the class runs)
    if (rule.dateFrom && recDate < rule.dateFrom) continue;
    if (rule.dateTo && recDate > rule.dateTo) continue;
    return rule;
  }
  return null;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
