import { Database as SqlJsDatabase } from 'sql.js';
import { randomUUID } from 'crypto';
import {
  Recording,
  RecordingFile,
  RecordingFilter,
  RecordingListResult,
  RecordingStatus,
} from '../../shared/types';
import { saveDatabase } from '../connection';

export class RecordingRepository {
  constructor(private db: SqlJsDatabase) {}

  findById(id: string): Recording | null {
    const stmt = this.db.prepare('SELECT * FROM recordings WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    const files = this.findFilesByRecordingId(id);
    return this.mapObject(row, files);
  }

  findByMeetingId(meetingId: string): Recording | null {
    const stmt = this.db.prepare('SELECT * FROM recordings WHERE meeting_id = ? OR uuid = ?');
    stmt.bind([meetingId, meetingId]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    const files = this.findFilesByRecordingId(row.id as string);
    return this.mapObject(row, files);
  }

  findByUuid(uuid: string): Recording | null {
    const stmt = this.db.prepare('SELECT * FROM recordings WHERE uuid = ?');
    stmt.bind([uuid]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    const files = this.findFilesByRecordingId(row.id as string);
    return this.mapObject(row, files);
  }

  findByFilter(filter: RecordingFilter): RecordingListResult {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.accountId) {
      conditions.push('account_id = ?');
      params.push(filter.accountId);
    }
    if (filter.from) {
      conditions.push('start_time >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push('start_time <= ?');
      params.push(filter.to);
    }
    if (filter.search) {
      conditions.push('meeting_topic LIKE ?');
      params.push(`%${filter.search}%`);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    } else {
      // By default, hide deleted recordings
      conditions.push("status != 'deleted'");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filter.page || 1;
    const pageSize = filter.pageSize || 20;
    const offset = (page - 1) * pageSize;

    // Count total
    const countResult = this.db.exec(`SELECT COUNT(*) as count FROM recordings ${where}`, params);
    const totalCount = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    // Fetch page
    const dataResult = this.db.exec(
      `SELECT * FROM recordings ${where} ORDER BY start_time DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    let recordings: Recording[] = [];
    if (dataResult.length > 0) {
      recordings = dataResult[0].values.map((values) => {
        const row: Record<string, any> = {};
        dataResult[0].columns.forEach((col, i) => { row[col] = values[i]; });
        const files = this.findFilesByRecordingId(row.id as string);
        return this.mapObject(row, files);
      });
    }

    return { recordings, totalCount, page, pageSize };
  }

  createFromZoomData(accountId: string, meetingData: any): Recording {
    const recordingId = randomUUID();
    const uuid = String(meetingData.uuid || meetingData.id);

    this.db.run(
      `INSERT INTO recordings (id, account_id, meeting_id, uuid, meeting_topic, host_email, start_time, duration, total_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recordingId,
        accountId,
        String(meetingData.id),
        uuid,
        meetingData.topic || 'Untitled',
        meetingData.host_email || '',
        meetingData.start_time || new Date().toISOString(),
        meetingData.duration || 0,
        meetingData.total_size || 0,
      ],
    );

    for (const file of meetingData.recording_files || []) {
      this.db.run(
        `INSERT INTO recording_files (id, recording_id, file_type, file_extension, file_size, download_url, play_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          recordingId,
          file.recording_type || 'unknown',
          file.file_extension || 'mp4',
          file.file_size || 0,
          file.download_url || '',
          file.play_url || null,
        ],
      );
    }

    saveDatabase();
    return this.findById(recordingId)!;
  }

  updateStatus(id: string, status: RecordingStatus): void {
    this.db.run('UPDATE recordings SET status = ? WHERE id = ?', [status, id]);
    saveDatabase();
  }

  updateTopic(id: string, topic: string): void {
    this.db.run('UPDATE recordings SET meeting_topic = ? WHERE id = ?', [topic, id]);
    saveDatabase();
  }

  clearAll(accountId?: string): number {
    let count = 0;
    if (accountId) {
      const result = this.db.exec('SELECT COUNT(*) FROM recordings WHERE account_id = ?', [accountId]);
      count = result.length > 0 ? (result[0].values[0][0] as number) : 0;
      this.db.run('DELETE FROM recording_files WHERE recording_id IN (SELECT id FROM recordings WHERE account_id = ?)', [accountId]);
      this.db.run('DELETE FROM recordings WHERE account_id = ?', [accountId]);
    } else {
      const result = this.db.exec('SELECT COUNT(*) FROM recordings');
      count = result.length > 0 ? (result[0].values[0][0] as number) : 0;
      this.db.run('DELETE FROM recording_files');
      this.db.run('DELETE FROM recordings');
    }
    saveDatabase();
    return count;
  }

  private findFilesByRecordingId(recordingId: string): RecordingFile[] {
    const result = this.db.exec(
      'SELECT * FROM recording_files WHERE recording_id = ?',
      [recordingId],
    );
    if (result.length === 0) return [];

    return result[0].values.map((values) => {
      const row: Record<string, any> = {};
      result[0].columns.forEach((col, i) => { row[col] = values[i]; });
      return {
        id: row.id as string,
        recordingId: row.recording_id as string,
        fileType: row.file_type as string,
        fileExtension: row.file_extension as string,
        fileSize: row.file_size as number,
        downloadUrl: row.download_url as string,
        playUrl: (row.play_url as string) || undefined,
        status: row.status as string,
      } as RecordingFile;
    });
  }

  private mapObject(row: Record<string, any>, files: RecordingFile[]): Recording {
    return {
      id: row.id as string,
      accountId: row.account_id as string,
      meetingId: row.meeting_id as string,
      uuid: (row.uuid as string) || (row.meeting_id as string),
      meetingTopic: row.meeting_topic as string,
      hostEmail: row.host_email as string,
      startTime: row.start_time as string,
      duration: row.duration as number,
      totalSize: row.total_size as number,
      recordingFiles: files,
      status: row.status as string,
    } as Recording;
  }
}
