export interface Recording {
  id: string;
  accountId: string;
  meetingId: string;
  meetingTopic: string;
  hostEmail: string;
  startTime: string;
  duration: number; // minutes
  totalSize: number; // bytes
  recordingFiles: RecordingFile[];
  status: RecordingStatus;
}

export interface RecordingFile {
  id: string;
  recordingId: string;
  fileType: RecordingFileType;
  fileExtension: string;
  fileSize: number; // bytes
  downloadUrl: string;
  playUrl?: string;
  status: RecordingFileStatus;
}

export type RecordingFileType =
  | 'shared_screen_with_speaker_view'
  | 'shared_screen_with_gallery_view'
  | 'shared_screen'
  | 'speaker_view'
  | 'gallery_view'
  | 'audio_only'
  | 'audio_transcript'
  | 'chat_file'
  | 'timeline';

export type RecordingStatus = 'available' | 'downloading' | 'downloaded' | 'deleted';
export type RecordingFileStatus = 'available' | 'downloading' | 'downloaded' | 'error';

export interface RecordingFilter {
  accountId?: string;
  from?: string; // ISO date
  to?: string; // ISO date
  search?: string; // search in meeting topic
  status?: RecordingStatus;
  page?: number;
  pageSize?: number;
}

export interface RecordingListResult {
  recordings: Recording[];
  totalCount: number;
  page: number;
  pageSize: number;
}
