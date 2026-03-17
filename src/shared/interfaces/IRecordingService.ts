import { Recording, RecordingFilter, RecordingListResult } from '../types';

export interface SyncResult {
  accountName: string;
  newCount: number;
  totalFromApi: number;
  logs: string[];
}

export interface IRecordingService {
  list(filter: RecordingFilter): Promise<RecordingListResult>;
  getById(id: string): Promise<Recording | null>;
  sync(accountId: string, fromDate?: string, toDate?: string): Promise<SyncResult>;
  syncAll(fromDate?: string, toDate?: string): Promise<SyncResult[]>;
  deleteFromCloud(id: string): Promise<void>;
}
