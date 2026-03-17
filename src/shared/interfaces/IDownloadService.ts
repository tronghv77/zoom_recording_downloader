import { DownloadTask, DownloadOptions, DownloadProgress } from '../types';

export interface IDownloadService {
  enqueue(recordingFileIds: string[], options: DownloadOptions): Promise<DownloadTask[]>;
  start(taskId: string): Promise<void>;
  pause(taskId: string): Promise<void>;
  resume(taskId: string): Promise<void>;
  cancel(taskId: string): Promise<void>;
  retry(taskId: string): Promise<void>;
  getQueue(): Promise<DownloadTask[]>;
  getProgress(taskId: string): Promise<DownloadProgress | null>;
  onProgress(callback: (progress: DownloadProgress) => void): () => void; // returns unsubscribe fn
}
