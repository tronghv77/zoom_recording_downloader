import { Router } from 'express';
import type { AccountService } from '../../src/services/AccountService';
import type { RecordingService } from '../../src/services/RecordingService';
import type { DownloadService } from '../../src/services/DownloadService';
import type { SchedulerService } from '../../src/services/SchedulerService';
import type { SettingsRepository } from '../../src/database/repositories/SettingsRepository';

interface Services {
  accountService: AccountService;
  recordingService: RecordingService;
  downloadService: DownloadService;
  schedulerService: SchedulerService;
  settingsRepo: SettingsRepository;
}

// Wrap async handler to catch errors
function wrap(fn: (req: any, res: any) => Promise<any>) {
  return (req: any, res: any) => {
    fn(req, res).catch((err: any) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    });
  };
}

export function createApiRouter(services: Services): Router {
  const router = Router();

  // === Accounts ===
  router.get('/accounts', wrap(async (_req, res) => {
    const data = await services.accountService.list();
    res.json({ success: true, data });
  }));

  router.get('/accounts/:id', wrap(async (req, res) => {
    const data = await services.accountService.getById(req.params.id);
    res.json({ success: true, data });
  }));

  router.post('/accounts', wrap(async (req, res) => {
    const data = await services.accountService.create(req.body);
    res.json({ success: true, data });
  }));

  router.put('/accounts/:id', wrap(async (req, res) => {
    const data = await services.accountService.update(req.params.id, req.body);
    res.json({ success: true, data });
  }));

  router.delete('/accounts/:id', wrap(async (req, res) => {
    await services.accountService.delete(req.params.id);
    res.json({ success: true, data: null });
  }));

  router.post('/accounts/:id/test', wrap(async (req, res) => {
    const data = await services.accountService.testConnection(req.params.id);
    res.json({ success: true, data });
  }));

  // === Recordings ===
  router.get('/recordings', wrap(async (req, res) => {
    const data = await services.recordingService.list(req.query as any);
    res.json({ success: true, data });
  }));

  router.get('/recordings/:id', wrap(async (req, res) => {
    const data = await services.recordingService.getById(req.params.id);
    res.json({ success: true, data });
  }));

  router.post('/recordings/sync/:accountId', wrap(async (req, res) => {
    const { fromDate, toDate } = req.body;
    const data = await services.recordingService.sync(req.params.accountId, fromDate, toDate);
    res.json({ success: true, data });
  }));

  router.post('/recordings/sync-all', wrap(async (req, res) => {
    const { fromDate, toDate } = req.body;
    const data = await services.recordingService.syncAll(fromDate, toDate);
    res.json({ success: true, data });
  }));

  router.post('/recordings/:id/rename', wrap(async (req, res) => {
    const { newTopic } = req.body;
    await services.recordingService.rename(req.params.id, newTopic, false);
    res.json({ success: true, data: null });
  }));

  router.delete('/recordings/:id/cloud', wrap(async (req, res) => {
    await services.recordingService.deleteFromCloud(req.params.id);
    res.json({ success: true, data: null });
  }));

  router.delete('/recordings/clear', wrap(async (req, res) => {
    const { accountId } = req.body;
    const data = await services.recordingService.clearAll(accountId);
    res.json({ success: true, data });
  }));

  // === Downloads ===
  router.get('/downloads', wrap(async (_req, res) => {
    const data = await services.downloadService.getQueue();
    res.json({ success: true, data });
  }));

  router.post('/downloads/enqueue', wrap(async (req, res) => {
    const { fileIds, options } = req.body;
    const settings = services.settingsRepo.getAll();
    const data = await services.downloadService.enqueue(fileIds, options, settings.folderTemplate);
    res.json({ success: true, data });
  }));

  router.post('/downloads/:id/pause', wrap(async (req, res) => {
    await services.downloadService.pause(req.params.id);
    res.json({ success: true, data: null });
  }));

  router.post('/downloads/:id/resume', wrap(async (req, res) => {
    await services.downloadService.resume(req.params.id);
    res.json({ success: true, data: null });
  }));

  router.post('/downloads/:id/cancel', wrap(async (req, res) => {
    await services.downloadService.cancel(req.params.id);
    res.json({ success: true, data: null });
  }));

  router.post('/downloads/:id/retry', wrap(async (req, res) => {
    await services.downloadService.retry(req.params.id);
    res.json({ success: true, data: null });
  }));

  // === Settings ===
  router.get('/settings', wrap(async (_req, res) => {
    const data = services.settingsRepo.getAll();
    res.json({ success: true, data });
  }));

  router.put('/settings', wrap(async (req, res) => {
    services.settingsRepo.saveAll(req.body);
    const data = services.settingsRepo.getAll();
    res.json({ success: true, data });
  }));

  // === Scheduler ===
  router.get('/scheduler/config', wrap(async (_req, res) => {
    const data = services.schedulerService.getConfig();
    res.json({ success: true, data });
  }));

  router.put('/scheduler/config', wrap(async (req, res) => {
    services.schedulerService.saveConfig(req.body);
    const data = services.schedulerService.getConfig();
    res.json({ success: true, data });
  }));

  router.post('/scheduler/run', wrap(async (_req, res) => {
    const data = await services.schedulerService.runOnce();
    res.json({ success: true, data });
  }));

  router.get('/scheduler/status', wrap(async (_req, res) => {
    res.json({
      success: true,
      data: {
        isRunning: services.schedulerService.isRunning(),
        isBusy: services.schedulerService.isBusy(),
      },
    });
  }));

  return router;
}
