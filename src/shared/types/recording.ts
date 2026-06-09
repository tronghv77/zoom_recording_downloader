export interface Recording {
  id: string;
  accountId: string;
  meetingId: string;
  uuid: string;
  meetingTopic: string;
  customName?: string; // local-only display name; not synced to Zoom Cloud
  customColor?: string; // local-only accent color (hex), set by a rename rule
  hostEmail: string;
  startTime: string;
  duration: number; // minutes
  totalSize: number; // bytes
  recordingFiles: RecordingFile[];
  status: RecordingStatus;
}

// Auto-rename rule: when a recording's meetingId matches and its local start
// time falls within [startFrom, startTo] (HH:MM), set customName = targetName.
export interface RenameRule {
  id: string;
  meetingId: string;
  startFrom: string; // 'HH:MM'
  startTo: string; // 'HH:MM'
  targetName: string;
  color?: string; // optional accent color (hex) applied to matching recordings
  priority: number;
  enabled: boolean;
  createdAt?: string;
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
