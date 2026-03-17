import { Database as SqlJsDatabase } from 'sql.js';
import { randomUUID } from 'crypto';
import { DownloadTask, DownloadTaskStatus, DownloadOptions } from '../../shared/types';
import { saveDatabase } from '../connection';

export class DownloadRepository {
  constructor(private db: SqlJsDatabase) {}

  findAll(): DownloadTask[] {
    const result = this.db.exec('SELECT * FROM download_tasks ORDER BY created_at DESC');
    if (result.length === 0) return [];
    return result[0].values.map((values) => this.mapRow(result[0].columns, values));
  }

  findById(id: string): DownloadTask | null {
    const stmt = this.db.prepare('SELECT * FROM download_tasks WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapObject(row);
  }

  findByStatus(status: DownloadTaskStatus): DownloadTask[] {
    const result = this.db.exec(
      'SELECT * FROM download_tasks WHERE status = ? ORDER BY created_at ASC',
      [status],
    );
    if (result.length === 0) return [];
    return result[0].values.map((values) => this.mapRow(result[0].columns, values));
  }

  createTask(recordingFileId: string, options: DownloadOptions, folderTemplate?: string): DownloadTask {
    const id = randomUUID();

    // Get recording file info with account name and start_time
    const stmt = this.db.prepare(
      `SELECT rf.*, r.account_id, r.meeting_topic, r.start_time, r.id as rec_id, a.name as account_name
       FROM recording_files rf
       JOIN recordings r ON rf.recording_id = r.id
       LEFT JOIN accounts a ON r.account_id = a.id
       WHERE rf.id = ?`,
    );
    stmt.bind([recordingFileId]);
    if (!stmt.step()) { stmt.free(); throw new Error(`Recording file not found: ${recordingFileId}`); }
    const file = stmt.getAsObject();
    stmt.free();

    const safeType = sanitizeFileName(String(file.file_type || 'video'));
    const ext = String(file.file_extension || 'mp4');

    // Build folder path from template
    const template = folderTemplate || '{topic}';
    const startTime = new Date(String(file.start_time || new Date().toISOString()));
    const timeStr = `${String(startTime.getHours()).padStart(2, '0')}-${String(startTime.getMinutes()).padStart(2, '0')}`;
    const folderPath = template
      .replace('{account}', sanitizeFileName(String(file.account_name || 'Unknown')))
      .replace('{topic}', sanitizeFileName(String(file.meeting_topic || 'Untitled')))
      .replace('{year}', String(startTime.getFullYear()))
      .replace('{month}', String(startTime.getMonth() + 1).padStart(2, '0'))
      .replace('{date}', startTime.toISOString().split('T')[0])
      .replace('{time}', timeStr);

    const destinationPath = `${options.destinationDir}/${folderPath}/${safeType}.${ext}`;

    this.db.run(
      `INSERT INTO download_tasks
       (id, recording_file_id, recording_id, account_id, meeting_topic, file_type, file_size, download_url, destination_path, agent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        recordingFileId,
        file.rec_id,
        file.account_id,
        file.meeting_topic,
        file.file_type,
        file.file_size,
        file.download_url,
        destinationPath,
        options.agentId || null,
      ],
    );
    saveDatabase();
    return this.findById(id)!;
  }

  updateStatus(id: string, status: DownloadTaskStatus): void {
    if (status === 'downloading') {
      this.db.run("UPDATE download_tasks SET status = ?, started_at = datetime('now') WHERE id = ?", [status, id]);
    } else if (status === 'completed') {
      this.db.run("UPDATE download_tasks SET status = ?, completed_at = datetime('now') WHERE id = ?", [status, id]);
    } else {
      this.db.run('UPDATE download_tasks SET status = ? WHERE id = ?', [status, id]);
    }
    saveDatabase();
  }

  updateProgress(id: string, progress: number, bytesDownloaded: number, speed: number): void {
    this.db.run(
      'UPDATE download_tasks SET progress = ?, bytes_downloaded = ?, speed = ? WHERE id = ?',
      [progress, bytesDownloaded, speed, id],
    );
    // Don't save to disk on every progress update (performance)
  }

  updateError(id: string, error: string): void {
    this.db.run("UPDATE download_tasks SET status = 'failed', error = ? WHERE id = ?", [error, id]);
    saveDatabase();
  }

  resetProgress(id: string): void {
    this.db.run(
      'UPDATE download_tasks SET progress = 0, bytes_downloaded = 0, speed = NULL, error = NULL WHERE id = ?',
      [id],
    );
    saveDatabase();
  }

  private mapObject(row: Record<string, any>): DownloadTask {
    return {
      id: row.id as string,
      recordingFileId: row.recording_file_id as string,
      recordingId: row.recording_id as string,
      accountId: row.account_id as string,
      meetingTopic: row.meeting_topic as string,
      fileType: row.file_type as string,
      fileSize: row.file_size as number,
      downloadUrl: row.download_url as string,
      destinationPath: row.destination_path as string,
      agentId: (row.agent_id as string) || undefined,
      status: row.status as DownloadTaskStatus,
      progress: row.progress as number,
      bytesDownloaded: row.bytes_downloaded as number,
      speed: (row.speed as number) || undefined,
      error: (row.error as string) || undefined,
      createdAt: row.created_at as string,
      startedAt: (row.started_at as string) || undefined,
      completedAt: (row.completed_at as string) || undefined,
    };
  }

  private mapRow(columns: string[], values: any[]): DownloadTask {
    const row: Record<string, any> = {};
    columns.forEach((col, i) => { row[col] = values[i]; });
    return this.mapObject(row);
  }
}

function sanitizeFileName(name: string): string {
  // Remove characters not allowed in Windows/Mac file names, keep Unicode (Vietnamese)
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}
