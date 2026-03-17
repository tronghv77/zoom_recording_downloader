import { IRecordingService } from '../shared/interfaces';
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

  async sync(accountId: string): Promise<number> {
    const account = await this.accountService.getById(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);

    const client = this.accountService.createApiClient(account);

    // Fetch recordings from last 30 days by default
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let newCount = 0;
    let nextPageToken: string | undefined;

    do {
      const data = await client.listRecordings(from, to, 30, nextPageToken);

      for (const meeting of data.meetings || []) {
        const exists = await this.recordingRepo.findByMeetingId(meeting.id);
        if (!exists) {
          this.recordingRepo.createFromZoomData(accountId, meeting);
          newCount++;
        }
      }

      nextPageToken = data.next_page_token;
    } while (nextPageToken);

    return newCount;
  }

  async syncAll(): Promise<number> {
    const accounts = await this.accountService.list();
    let totalNew = 0;

    for (const account of accounts) {
      if (account.status === 'active') {
        const count = await this.sync(account.id);
        totalNew += count;
      }
    }

    return totalNew;
  }

  async deleteFromCloud(id: string): Promise<void> {
    const recording = await this.getById(id);
    if (!recording) throw new Error(`Recording not found: ${id}`);

    const account = await this.accountService.getById(recording.accountId);
    if (!account) throw new Error(`Account not found: ${recording.accountId}`);

    const client = this.accountService.createApiClient(account);
    await client.deleteRecording(recording.meetingId);

    this.recordingRepo.updateStatus(id, 'deleted');
  }
}
