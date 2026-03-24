import { IRecordingService, SyncResult } from '../shared/interfaces';
import { Recording, RecordingFilter, RecordingListResult } from '../shared/types';
import { RecordingRepository } from '../database/repositories/RecordingRepository';
import { AccountService } from './AccountService';

export class RecordingService implements IRecordingService {
  constructor(
    private recordingRepo: RecordingRepository,
    private accountService: AccountService,
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

  async rename(id: string, newTopic: string, updateCloud: boolean): Promise<void> {
    const recording = await this.getById(id);
    if (!recording) throw new Error(`Recording not found: ${id}`);

    // Update local DB
    this.recordingRepo.updateTopic(id, newTopic);

    // Optionally update on Zoom Cloud
    if (updateCloud) {
      const account = await this.accountService.getById(recording.accountId);
      if (!account) throw new Error(`Account not found: ${recording.accountId}`);

      const client = this.accountService.createApiClient(account);
      await client.updateMeetingTopic(recording.meetingId, newTopic);
    }
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
