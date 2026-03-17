import Database from 'better-sqlite3';
import { up as migration001 } from './001_initial';

const migrations = [
  { version: 1, name: '001_initial', up: migration001 },
];

export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = db
    .prepare('SELECT version FROM _migrations ORDER BY version')
    .all() as { version: number }[];
  const appliedVersions = new Set(applied.map((m) => m.version));

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name,
        );
      })();
      console.log(`Migration applied: ${migration.name}`);
    }
  }
}
