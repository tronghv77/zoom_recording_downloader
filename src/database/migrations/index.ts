import { Database as SqlJsDatabase } from 'sql.js';
import { up as migration001 } from './001_initial';
import { up as migration002 } from './002_recording_uuid';
import { up as migration003 } from './003_download_enhancements';
import { up as migration004 } from './004_rename_features';
import { up as migration005 } from './005_rule_color';
import { up as migration006 } from './006_rule_date_range';

const migrations = [
  { version: 1, name: '001_initial', up: migration001 },
  { version: 2, name: '002_recording_uuid', up: migration002 },
  { version: 3, name: '003_download_enhancements', up: migration003 },
  { version: 4, name: '004_rename_features', up: migration004 },
  { version: 5, name: '005_rule_color', up: migration005 },
  { version: 6, name: '006_rule_date_range', up: migration006 },
];

export function runMigrations(db: SqlJsDatabase): void {
  // Create migrations tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const result = db.exec('SELECT version FROM _migrations ORDER BY version');
  const appliedVersions = new Set(
    result.length > 0 ? result[0].values.map((row) => row[0] as number) : [],
  );

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      migration.up(db);
      db.run('INSERT INTO _migrations (version, name) VALUES (?, ?)', [
        migration.version,
        migration.name,
      ]);
      console.log(`Migration applied: ${migration.name}`);
    }
  }
}
