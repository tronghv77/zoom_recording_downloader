import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

export async function initDatabase(customPath?: string): Promise<SqlJsDatabase> {
  if (db) return db;

  dbPath = customPath || getDefaultDbPath();
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  // Load existing database file if it exists
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL-like behavior and foreign keys
  db.run('PRAGMA foreign_keys = ON;');

  return db;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

function getDefaultDbPath(): string {
  const appData = process.env.APPDATA || process.env.HOME || '.';
  return path.join(appData, 'ZoomRecordingDownloader', 'data.db');
}
