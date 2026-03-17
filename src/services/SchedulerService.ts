import { RecordingService } from './RecordingService';
import { DownloadService } from './DownloadService';
import { AccountService } from './AccountService';
import { SettingsRepository } from '../database/repositories/SettingsRepository';
import { RecordingRepository } from '../database/repositories/RecordingRepository';

export interface SchedulerConfig {
  enabled: boolean;
  intervalMinutes: number; // sync interval
  autoDownload: boolean; // auto-download after sync
  lastRunAt?: string;
}

type SchedulerCallback = (message: string) => void;

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private listeners: SchedulerCallback[] = [];

  constructor(
    private recordingService: RecordingService,
    private downloadService: DownloadService,
    private accountService: AccountService,
    private settingsRepo: SettingsRepository,
    private recordingRepo: RecordingRepository,
  ) {}

  start(config: SchedulerConfig): void {
    this.stop();
    if (!config.enabled || config.intervalMinutes <= 0) return;

    const intervalMs = config.intervalMinutes * 60 * 1000;
    this.emit(`Scheduler started (every ${config.intervalMinutes} min)`);

    this.timer = setInterval(() => {
      this.runOnce(config);
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.emit('Scheduler stopped');
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  isBusy(): boolean {
    return this.running;
  }

  async runOnce(config?: SchedulerConfig): Promise<string[]> {
    if (this.running) return ['Scheduler is already running'];

    this.running = true;
    const logs: string[] = [];

    try {
      this.emit('Scheduler: syncing...');
      logs.push(`Sync started at ${new Date().toLocaleTimeString()}`);

      const results = await this.recordingService.syncAll();
      const totalNew = results.reduce((s, r) => s + r.newCount, 0);
      logs.push(`Synced: ${totalNew} new recording(s) from ${results.length} account(s)`);
      this.emit(`Scheduler: synced ${totalNew} new recording(s)`);

      // Auto-download if enabled
      const cfg = config || this.getConfig();
      if (cfg.autoDownload && totalNew > 0) {
        const settings = this.settingsRepo.getAll();
        if (settings.defaultDownloadDir) {
          // Get all recordings that have "available" status files
          const allRecordings = await this.recordingService.list({ pageSize: 100 });
          let downloadCount = 0;

          for (const rec of allRecordings.recordings) {
            const availableFiles = rec.recordingFiles.filter((f) => f.status === 'available');
            if (availableFiles.length > 0) {
              const fileIds = availableFiles.map((f) => f.id);
              await this.downloadService.enqueue(fileIds, {
                destinationDir: settings.defaultDownloadDir,
              }, settings.folderTemplate);
              downloadCount += fileIds.length;
            }
          }

          logs.push(`Auto-download: queued ${downloadCount} file(s)`);
          this.emit(`Scheduler: queued ${downloadCount} file(s) for download`);
        } else {
          logs.push('Auto-download skipped: no default download directory set');
        }
      }

      // Save last run time
      this.settingsRepo.set('defaultDownloadDir', this.settingsRepo.get('defaultDownloadDir')); // trigger save
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logs.push(`Error: ${msg}`);
      this.emit(`Scheduler error: ${msg}`);
    } finally {
      this.running = false;
    }

    return logs;
  }

  getConfig(): SchedulerConfig {
    return {
      enabled: this.settingsRepo.get('schedulerEnabled' as any) === 'true',
      intervalMinutes: Number(this.settingsRepo.get('schedulerInterval' as any)) || 60,
      autoDownload: this.settingsRepo.get('schedulerAutoDownload' as any) === 'true',
    };
  }

  saveConfig(config: SchedulerConfig): void {
    this.settingsRepo.saveAll({
      schedulerEnabled: config.enabled,
      schedulerInterval: config.intervalMinutes,
      schedulerAutoDownload: config.autoDownload,
    } as any);

    if (config.enabled) {
      this.start(config);
    } else {
      this.stop();
    }
  }

  onMessage(callback: SchedulerCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private emit(message: string): void {
    for (const cb of this.listeners) cb(message);
  }
}
