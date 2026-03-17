import { Database as SqlJsDatabase } from 'sql.js';
import { saveDatabase } from '../connection';

export interface AppSettings {
  defaultDownloadDir: string;
  maxConcurrentDownloads: number;
  folderTemplate: string; // e.g. "{account}/{year}-{month}/{topic}"
  autoStartDownload: boolean;
  minimizeToTray: boolean;
  theme: string; // 'dark' | 'light'
}

const DEFAULTS: AppSettings = {
  defaultDownloadDir: '',
  maxConcurrentDownloads: 3,
  folderTemplate: '{account}/{year}-{month}/{topic}',
  autoStartDownload: true,
  minimizeToTray: false,
  theme: 'dark',
};

export class SettingsRepository {
  constructor(private db: SqlJsDatabase) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  get(key: keyof AppSettings): string {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([key]);
    if (!stmt.step()) { stmt.free(); return String(DEFAULTS[key]); }
    const row = stmt.getAsObject();
    stmt.free();
    return row.value as string;
  }

  set(key: keyof AppSettings, value: string): void {
    const exists = this.get(key);
    if (exists !== undefined) {
      this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
    saveDatabase();
  }

  getAll(): AppSettings {
    return {
      defaultDownloadDir: this.get('defaultDownloadDir') || DEFAULTS.defaultDownloadDir,
      maxConcurrentDownloads: Number(this.get('maxConcurrentDownloads')) || DEFAULTS.maxConcurrentDownloads,
      folderTemplate: this.get('folderTemplate') || DEFAULTS.folderTemplate,
      autoStartDownload: this.get('autoStartDownload') !== 'false',
      minimizeToTray: this.get('minimizeToTray') === 'true',
      theme: this.get('theme') || DEFAULTS.theme,
    };
  }

  saveAll(settings: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(settings)) {
      this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    saveDatabase();
  }
}
