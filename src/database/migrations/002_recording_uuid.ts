import { Database as SqlJsDatabase } from 'sql.js';

export function up(db: SqlJsDatabase): void {
  // Add uuid column for unique identification (Zoom recurring meetings share meeting_id)
  db.run(`ALTER TABLE recordings ADD COLUMN uuid TEXT;`);

  // Populate uuid from meeting_id for existing records
  db.run(`UPDATE recordings SET uuid = meeting_id WHERE uuid IS NULL;`);

  // Recreate table without UNIQUE on meeting_id, add UNIQUE on uuid instead
  db.run(`
    CREATE TABLE IF NOT EXISTS recordings_new (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      uuid TEXT NOT NULL,
      meeting_topic TEXT NOT NULL,
      host_email TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      total_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    INSERT INTO recordings_new (id, account_id, meeting_id, uuid, meeting_topic, host_email, start_time, duration, total_size, status, created_at)
    SELECT id, account_id, meeting_id, COALESCE(uuid, meeting_id), meeting_topic, host_email, start_time, duration, total_size, status, created_at
    FROM recordings;
  `);

  db.run(`DROP TABLE recordings;`);
  db.run(`ALTER TABLE recordings_new RENAME TO recordings;`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_uuid ON recordings(uuid);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_recordings_account ON recordings(account_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON recordings(start_time);`);
}
