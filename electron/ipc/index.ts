import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import { getDatabase } from '../../src/database/connection';
import { AccountRepository } from '../../src/database/repositories/AccountRepository';
import { RecordingRepository } from '../../src/database/repositories/RecordingRepository';
import { DownloadRepository } from '../../src/database/repositories/DownloadRepository';
import { AccountService } from '../../src/services/AccountService';
import { RecordingService } from '../../src/services/RecordingService';
import { DownloadService } from '../../src/services/DownloadService';

let accountService: AccountService;
let recordingService: RecordingService;
let downloadService: DownloadService;

function getServices() {
  if (!accountService) {
    const db = getDatabase();
    const accountRepo = new AccountRepository(db);
    const recordingRepo = new RecordingRepository(db);
    const downloadRepo = new DownloadRepository(db);

    accountService = new AccountService(accountRepo);
    recordingService = new RecordingService(recordingRepo, accountService);
    downloadService = new DownloadService(downloadRepo, recordingRepo, accountService);
  }
  return { accountService, recordingService, downloadService };
}

export function registerIpcHandlers(): void {
  const services = getServices();

  // === Account handlers ===
  ipcMain.handle('account:list', () => services.accountService.list());
  ipcMain.handle('account:getById', (_, id: string) => services.accountService.getById(id));
  ipcMain.handle('account:create', (_, input) => services.accountService.create(input));
  ipcMain.handle('account:update', (_, id: string, input) => services.accountService.update(id, input));
  ipcMain.handle('account:delete', (_, id: string) => services.accountService.delete(id));
  ipcMain.handle('account:testConnection', (_, id: string) => services.accountService.testConnection(id));

  // === Recording handlers ===
  ipcMain.handle('recording:list', (_, filter) => services.recordingService.list(filter));
  ipcMain.handle('recording:getById', (_, id: string) => services.recordingService.getById(id));
  ipcMain.handle('recording:sync', (_, accountId: string) => services.recordingService.sync(accountId));
  ipcMain.handle('recording:syncAll', () => services.recordingService.syncAll());
  ipcMain.handle('recording:deleteFromCloud', (_, id: string) => services.recordingService.deleteFromCloud(id));

  // === Download handlers ===
  ipcMain.handle('download:enqueue', (_, fileIds: string[], options) =>
    services.downloadService.enqueue(fileIds, options),
  );
  ipcMain.handle('download:pause', (_, taskId: string) => services.downloadService.pause(taskId));
  ipcMain.handle('download:resume', (_, taskId: string) => services.downloadService.resume(taskId));
  ipcMain.handle('download:cancel', (_, taskId: string) => services.downloadService.cancel(taskId));
  ipcMain.handle('download:retry', (_, taskId: string) => services.downloadService.retry(taskId));
  ipcMain.handle('download:getQueue', () => services.downloadService.getQueue());

  // Forward download progress to renderer
  services.downloadService.onProgress((progress) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('download:progress', progress);
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
}
