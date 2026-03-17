import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { DownloadTask, DownloadTaskStatus, DownloadOptions } from '../../shared/types';

export class DownloadRepository {
  constructor(private db: Database.Database) {}

  findAll(): DownloadTask[] {
    const rows = this.db
      .prepare('SELECT * FROM download_tasks ORDER BY created_at DESC')
      .all() as any[];
    return rows.map(this.mapRow);
  }

  findById(id: string): DownloadTask | null {
    const row = this.db.prepare('SELECT * FROM download_tasks WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  findByStatus(status: DownloadTaskStatus): DownloadTask[] {
    const rows = this.db
      .prepare('SELECT * FROM download_tasks WHERE status = ? ORDER BY created_at ASC')
      .all(status) as any[];
    return rows.map(this.mapRow);
  }

  createTask(recordingFileId: string, options: DownloadOptions): DownloadTask {
    const id = randomUUID();

    // Get recording file info
    const file = this.db
      .prepare(
        `SELECT rf.*, r.account_id, r.meeting_topic, r.id as rec_id
         FROM recording_files rf
         JOIN recordings r ON rf.recording_id = r.id
         WHERE rf.id = ?`,
      )
      .get(recordingFileId) as any;

    if (!file) throw new Error(`Recording file not found: ${recordingFileId}`);

    const destinationPath = `${options.destinationDir}/${file.meeting_topic}/${file.file_type}.${file.file_extension}`;

    this.db
      .prepare(
        `INSERT INTO download_tasks
         (id, recording_file_id, recording_id, account_id, meeting_topic, file_type, file_size, download_url, destination_path, agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      );

    return this.findById(id)!;
  }

  updateStatus(id: string, status: DownloadTaskStatus): void {
    const updates: Record<string, string> = {
      downloading: "status = ?, started_at = datetime('now')",
      completed: "status = ?, completed_at = datetime('now')",
    };
    const sql = updates[status] || 'status = ?';
    this.db.prepare(`UPDATE download_tasks SET ${sql} WHERE id = ?`).run(status, id);
  }

  updateProgress(id: string, progress: number, bytesDownloaded: number, speed: number): void {
    this.db
      .prepare('UPDATE download_tasks SET progress = ?, bytes_downloaded = ?, speed = ? WHERE id = ?')
      .run(progress, bytesDownloaded, speed, id);
  }

  updateError(id: string, error: string): void {
    this.db
      .prepare("UPDATE download_tasks SET status = 'failed', error = ? WHERE id = ?")
      .run(error, id);
  }

  resetProgress(id: string): void {
    this.db
      .prepare('UPDATE download_tasks SET progress = 0, bytes_downloaded = 0, speed = NULL, error = NULL WHERE id = ?')
      .run(id);
  }

  private mapRow(row: any): DownloadTask {
    return {
      id: row.id,
      recordingFileId: row.recording_file_id,
      recordingId: row.recording_id,
      accountId: row.account_id,
      meetingTopic: row.meeting_topic,
      fileType: row.file_type,
      fileSize: row.file_size,
      downloadUrl: row.download_url,
      destinationPath: row.destination_path,
      agentId: row.agent_id || undefined,
      status: row.status,
      progress: row.progress,
      bytesDownloaded: row.bytes_downloaded,
      speed: row.speed || undefined,
      error: row.error || undefined,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
    };
  }
}
