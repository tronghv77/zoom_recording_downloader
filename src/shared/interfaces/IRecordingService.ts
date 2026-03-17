import { Recording, RecordingFilter, RecordingListResult } from '../types';

export interface IRecordingService {
  list(filter: RecordingFilter): Promise<RecordingListResult>;
  getById(id: string): Promise<Recording | null>;
  sync(accountId: string): Promise<number>; // returns count of new recordings found
  syncAll(): Promise<number>;
  deleteFromCloud(id: string): Promise<void>;
}
