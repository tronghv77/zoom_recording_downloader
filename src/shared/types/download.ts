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
  agentId?: string; // which agent/device handles the download (Phase 3)
  status: DownloadTaskStatus;
  progress: number; // 0-100
  bytesDownloaded: number;
  speed?: number; // bytes per second
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
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
