import { Database as SqlJsDatabase } from 'sql.js';

export function up(db: SqlJsDatabase): void {
  // Local custom name for recordings (does NOT sync to Zoom Cloud,
  // and is NOT overwritten by re-sync because sync only INSERTs new sessions).
  db.run(`ALTER TABLE recordings ADD COLUMN custom_name TEXT;`);

  // Auto-rename rules: match by meeting_id + local start-time window → target name
  db.run(`
    CREATE TABLE IF NOT EXISTS rename_rules (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      start_from TEXT NOT NULL,
      start_to TEXT NOT NULL,
      target_name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_rename_rules_meeting ON rename_rules(meeting_id);');
}
