import { Database as SqlJsDatabase } from 'sql.js';

export function up(db: SqlJsDatabase): void {
  // Optional date range (local 'YYYY-MM-DD') limiting a rule to the period the
  // class runs. Empty = no bound on that side.
  db.run(`ALTER TABLE rename_rules ADD COLUMN date_from TEXT;`);
  db.run(`ALTER TABLE rename_rules ADD COLUMN date_to TEXT;`);
}
