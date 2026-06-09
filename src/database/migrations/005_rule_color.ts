import { Database as SqlJsDatabase } from 'sql.js';

export function up(db: SqlJsDatabase): void {
  // Optional color assigned by an auto-rename rule (hex string, e.g. "#6366f1").
  db.run(`ALTER TABLE rename_rules ADD COLUMN color TEXT;`);

  // Local-only color for a recording, set by a matching rule. Like custom_name,
  // it survives re-sync and is never pushed to Zoom Cloud.
  db.run(`ALTER TABLE recordings ADD COLUMN custom_color TEXT;`);
}
