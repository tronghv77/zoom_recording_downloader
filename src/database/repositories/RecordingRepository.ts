import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  Recording,
  RecordingFile,
  RecordingFilter,
  RecordingListResult,
  RecordingStatus,
} from '../../shared/types';

export class RecordingRepository {
  constructor(private db: Database.Database) {}

  findById(id: string): Recording | null {
    const row = this.db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as any;
    if (!row) return null;

    const files = this.findFilesByRecordingId(id);
    return this.mapRow(row, files);
  }

  findByMeetingId(meetingId: string): Recording | null {
    const row = this.db.prepare('SELECT * FROM recordings WHERE meeting_id = ?').get(meetingId) as any;
    if (!row) return null;

    const files = this.findFilesByRecordingId(row.id);
    return this.mapRow(row, files);
  }

  findByFilter(filter: RecordingFilter): RecordingListResult {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.accountId) {
      conditions.push('r.account_id = ?');
      params.push(filter.accountId);
    }
    if (filter.from) {
      conditions.push('r.start_time >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push('r.start_time <= ?');
      params.push(filter.to);
    }
    if (filter.search) {
      conditions.push('r.meeting_topic LIKE ?');
      params.push(`%${filter.search}%`);
    }
    if (filter.status) {
      conditions.push('r.status = ?');
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filter.page || 1;
    const pageSize = filter.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM recordings r ${where}`)
      .get(...params) as any;

    const rows = this.db
      .prepare(
        `SELECT r.* FROM recordings r ${where} ORDER BY r.start_time DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as any[];

    const recordings = rows.map((row) => {
      const files = this.findFilesByRecordingId(row.id);
      return this.mapRow(row, files);
    });

    return {
      recordings,
      totalCount: countRow.count,
      page,
      pageSize,
    };
  }

  createFromZoomData(accountId: string, meetingData: any): Recording {
    const recordingId = randomUUID();

    this.db
      .prepare(
        `INSERT INTO recordings (id, account_id, meeting_id, meeting_topic, host_email, start_time, duration, total_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        recordingId,
        accountId,
        String(meetingData.id),
        meetingData.topic || 'Untitled',
        meetingData.host_email || '',
        meetingData.start_time || new Date().toISOString(),
        meetingData.duration || 0,
        meetingData.total_size || 0,
      );

    // Insert recording files
    for (const file of meetingData.recording_files || []) {
      this.db
        .prepare(
          `INSERT INTO recording_files (id, recording_id, file_type, file_extension, file_size, download_url, play_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          recordingId,
          file.recording_type || 'unknown',
          file.file_extension || 'mp4',
          file.file_size || 0,
          file.download_url || '',
          file.play_url || null,
        );
    }

    return this.findById(recordingId)!;
  }

  updateStatus(id: string, status: RecordingStatus): void {
    this.db.prepare('UPDATE recordings SET status = ? WHERE id = ?').run(status, id);
  }

  private findFilesByRecordingId(recordingId: string): RecordingFile[] {
    const rows = this.db
      .prepare('SELECT * FROM recording_files WHERE recording_id = ?')
      .all(recordingId) as any[];

    return rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      fileType: row.file_type,
      fileExtension: row.file_extension,
      fileSize: row.file_size,
      downloadUrl: row.download_url,
      playUrl: row.play_url || undefined,
      status: row.status,
    }));
  }

  private mapRow(row: any, files: RecordingFile[]): Recording {
    return {
      id: row.id,
      accountId: row.account_id,
      meetingId: row.meeting_id,
      meetingTopic: row.meeting_topic,
      hostEmail: row.host_email,
      startTime: row.start_time,
      duration: row.duration,
      totalSize: row.total_size,
      recordingFiles: files,
      status: row.status,
    };
  }
}
