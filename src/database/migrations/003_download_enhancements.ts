import { Database as SqlJsDatabase } from 'sql.js';

export function up(db: SqlJsDatabase): void {
  // Add meeting_id to download_tasks for grouping
  db.run(`ALTER TABLE download_tasks ADD COLUMN meeting_id TEXT;`);

  // Backfill from recordings table
  db.run(`
    UPDATE download_tasks
    SET meeting_id = (
      SELECT meeting_id FROM recordings WHERE recordings.id = download_tasks.recording_id
    )
    WHERE meeting_id IS NULL;
  `);

  // Add Google Drive upload tracking columns
  db.run(`ALTER TABLE download_tasks ADD COLUMN upload_status TEXT DEFAULT NULL;`);
  db.run(`ALTER TABLE download_tasks ADD COLUMN google_drive_file_id TEXT DEFAULT NULL;`);
  db.run(`ALTER TABLE download_tasks ADD COLUMN uploaded_at TEXT DEFAULT NULL;`);
}
