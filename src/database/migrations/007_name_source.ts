import { Database as SqlJsDatabase } from 'sql.js';

export function up(db: SqlJsDatabase): void {
  // Distinguish a manually-typed name (✎ Đổi Tên) from a rule-applied name.
  // Rule-applied names (name_is_manual = 0) can be safely cleared/updated when
  // rules change; manual names (= 1) are protected and never auto-cleared.
  db.run(`ALTER TABLE recordings ADD COLUMN name_is_manual INTEGER NOT NULL DEFAULT 0;`);
}
