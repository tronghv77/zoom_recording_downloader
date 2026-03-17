import { Database as SqlJsDatabase } from 'sql.js';

export function up(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      account_id TEXT NOT NULL,
      access_token TEXT,
      token_expires_at INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL UNIQUE,
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
    CREATE TABLE IF NOT EXISTS recording_files (
      id TEXT PRIMARY KEY,
      recording_id TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_extension TEXT NOT NULL DEFAULT 'mp4',
      file_size INTEGER NOT NULL DEFAULT 0,
      download_url TEXT NOT NULL,
      play_url TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS download_tasks (
      id TEXT PRIMARY KEY,
      recording_file_id TEXT NOT NULL,
      recording_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      meeting_topic TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      download_url TEXT NOT NULL,
      destination_path TEXT NOT NULL,
      agent_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      bytes_downloaded INTEGER NOT NULL DEFAULT 0,
      speed REAL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (recording_file_id) REFERENCES recording_files(id),
      FOREIGN KEY (recording_id) REFERENCES recordings(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_rules (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_download INTEGER NOT NULL DEFAULT 0,
      download_destination TEXT,
      download_agent_id TEXT,
      auto_delete_from_cloud INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      next_run_at TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_recordings_account ON recordings(account_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON recordings(start_time);');
  db.run('CREATE INDEX IF NOT EXISTS idx_recording_files_recording ON recording_files(recording_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_download_tasks_status ON download_tasks(status);');
}
