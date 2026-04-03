import { ipcMain, dialog, app, BrowserWindow, shell } from 'electron';
import { getDatabase } from '../../src/database/connection';
import { AccountRepository } from '../../src/database/repositories/AccountRepository';
import { RecordingRepository } from '../../src/database/repositories/RecordingRepository';
import { DownloadRepository } from '../../src/database/repositories/DownloadRepository';
import { SettingsRepository } from '../../src/database/repositories/SettingsRepository';
import { AccountService } from '../../src/services/AccountService';
import { RecordingService } from '../../src/services/RecordingService';
import { DownloadService } from '../../src/services/DownloadService';
import { SchedulerService } from '../../src/services/SchedulerService';

let accountService: AccountService;
let recordingService: RecordingService;
let downloadService: DownloadService;
let settingsRepo: SettingsRepository;
let schedulerService: SchedulerService;

function getServices() {
  if (!accountService) {
    const db = getDatabase();
    const accountRepo = new AccountRepository(db);
    const recordingRepo = new RecordingRepository(db);
    const downloadRepo = new DownloadRepository(db);
    settingsRepo = new SettingsRepository(db);

    accountService = new AccountService(accountRepo);
    recordingService = new RecordingService(recordingRepo, accountService);
    downloadService = new DownloadService(downloadRepo, recordingRepo, accountService);
    schedulerService = new SchedulerService(recordingService, downloadService, accountService, settingsRepo, recordingRepo);

    // Auto-start scheduler if enabled
    const schedulerConfig = schedulerService.getConfig();
    if (schedulerConfig.enabled) {
      schedulerService.start(schedulerConfig);
    }
  }
  return { accountService, recordingService, downloadService, settingsRepo, schedulerService };
}

// Wrap handler to catch errors and return them as serializable objects
function safeHandle(channel: string, handler: (...args: any[]) => Promise<any>): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const result = await handler(...args);
      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[IPC ${channel}] Error:`, message);
      return { success: false, error: message };
    }
  });
}

export function registerIpcHandlers(): void {
  const services = getServices();

  // === Account handlers ===
  safeHandle('account:list', () => services.accountService.list());
  safeHandle('account:getById', (id: string) => services.accountService.getById(id));
  safeHandle('account:create', (input) => services.accountService.create(input));
  safeHandle('account:update', (id: string, input) => services.accountService.update(id, input));
  safeHandle('account:delete', (id: string) => services.accountService.delete(id));
  safeHandle('account:testConnection', (id: string) => services.accountService.testConnection(id));

  // === Recording handlers ===
  safeHandle('recording:list', (filter) => services.recordingService.list(filter));
  safeHandle('recording:getById', (id: string) => services.recordingService.getById(id));
  safeHandle('recording:sync', (accountId: string, fromDate?: string, toDate?: string) =>
    services.recordingService.sync(accountId, fromDate, toDate),
  );
  safeHandle('recording:syncAll', (fromDate?: string, toDate?: string) =>
    services.recordingService.syncAll(fromDate, toDate),
  );
  safeHandle('recording:deleteFromCloud', (id: string, permanent?: boolean) =>
    services.recordingService.deleteFromCloud(id, permanent),
  );
  safeHandle('recording:rename', (id: string, newTopic: string, updateCloud: boolean) =>
    services.recordingService.rename(id, newTopic, updateCloud),
  );
  safeHandle('recording:clear', (accountId?: string) => services.recordingService.clearAll(accountId));

  // === Download handlers ===
  safeHandle('download:enqueue', (fileIds: string[], options) => {
    const settings = services.settingsRepo.getAll();
    return services.downloadService.enqueue(fileIds, options, settings.folderTemplate);
  });
  safeHandle('download:pause', (taskId: string) => services.downloadService.pause(taskId));
  safeHandle('download:resume', (taskId: string) => services.downloadService.resume(taskId));
  safeHandle('download:cancel', (taskId: string) => services.downloadService.cancel(taskId));
  safeHandle('download:retry', (taskId: string) => services.downloadService.retry(taskId));
  safeHandle('download:getQueue', () => services.downloadService.getQueue());
  safeHandle('download:getSummary', async () => services.downloadService.getSummary());
  safeHandle('download:clear', async (status?: string) => services.downloadService.clearAll(status));

  // Forward download progress to renderer
  services.downloadService.onProgress((progress) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('download:progress', progress);
    }
  });

  // === Settings handlers ===
  safeHandle('settings:getAll', async () => services.settingsRepo.getAll());
  safeHandle('settings:save', async (settings) => {
    services.settingsRepo.saveAll(settings);
    return services.settingsRepo.getAll();
  });

  // === Scheduler handlers ===
  safeHandle('scheduler:getConfig', async () => services.schedulerService.getConfig());
  safeHandle('scheduler:saveConfig', async (config) => {
    services.schedulerService.saveConfig(config);
    return services.schedulerService.getConfig();
  });
  safeHandle('scheduler:runNow', async () => services.schedulerService.runOnce());
  safeHandle('scheduler:status', async () => ({
    isRunning: services.schedulerService.isRunning(),
    isBusy: services.schedulerService.isBusy(),
  }));

  // Forward scheduler messages to renderer
  services.schedulerService.onMessage((message) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('scheduler:message', message);
    }
  });

  // === System handlers ===
  ipcMain.handle('system:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('system:getAppVersion', () => app.getVersion());

  ipcMain.handle('system:openFolder', async (_event: any, folderPath: string) => {
    try {
      await shell.openPath(folderPath);
      return true;
    } catch {
      return false;
    }
  });
}
