export interface DownloadTask {
  id: string;
  recordingFileId: string;
  recordingId: string;
  accountId: string;
  meetingTopic: string;
  fileType: string;
  fileSize: number;
  downloadUrl: string;
  destinationPath: string;
  meetingId?: string;
  agentId?: string;
  status: DownloadTaskStatus;
  progress: number; // 0-100
  bytesDownloaded: number;
  speed?: number; // bytes per second
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  uploadStatus?: 'pending' | 'uploading' | 'uploaded' | 'failed' | null;
  googleDriveFileId?: string;
  uploadedAt?: string;
}

export type DownloadTaskStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DownloadOptions {
  destinationDir: string;
  agentId?: string; // target device (Phase 3)
  maxConcurrent?: number;
  autoDeleteFromCloud?: boolean;
}

export interface DownloadProgress {
  taskId: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  status: DownloadTaskStatus;
}
