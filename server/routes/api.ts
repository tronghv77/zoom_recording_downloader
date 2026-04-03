import { Router } from 'express';
import type { AccountService } from '../../src/services/AccountService';
import type { RecordingService } from '../../src/services/RecordingService';
import type { DownloadService } from '../../src/services/DownloadService';
import type { SchedulerService } from '../../src/services/SchedulerService';
import type { SettingsRepository } from '../../src/database/repositories/SettingsRepository';
import type { DownloadRepository } from '../../src/database/repositories/DownloadRepository';
import type { GoogleDriveService } from '../../src/services/GoogleDriveService';
import { getAgentList, sendDownloadToAgent } from '../ws';

interface Services {
  accountService: AccountService;
  recordingService: RecordingService;
  downloadService: DownloadService;
  schedulerService: SchedulerService;
  settingsRepo: SettingsRepository;
  downloadRepo: DownloadRepository;
  googleDriveService?: GoogleDriveService;
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

  router.get('/downloads/summary', wrap(async (_req, res) => {
    const data = services.downloadRepo.getDownloadSummary();
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

  router.delete('/downloads/clear', wrap(async (req, res) => {
    const { status } = req.body || {};
    const data = services.downloadService.clearAll(status);
    res.json({ success: true, data });
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

  // === Agents ===
  router.get('/agents', wrap(async (_req, res) => {
    const data = getAgentList();
    res.json({ success: true, data });
  }));

  router.post('/agents/:agentId/download', wrap(async (req, res) => {
    const { agentId } = req.params;
    const { recordingFileId } = req.body;

    // Get file info and generate access token
    const file = await getFileForAgentDownload(services, recordingFileId);
    if (!file) {
      res.status(404).json({ success: false, error: 'Recording file not found' });
      return;
    }

    const settings = services.settingsRepo.getAll();
    const sent = sendDownloadToAgent(agentId, {
      taskId: `agent-${Date.now()}`,
      downloadUrl: file.downloadUrl,
      destinationPath: file.destinationPath,
      accessToken: file.accessToken,
      fileSize: file.fileSize,
    });

    if (!sent) {
      res.status(400).json({ success: false, error: 'Agent not connected or busy' });
      return;
    }

    res.json({ success: true, data: { message: `Download sent to agent ${agentId}` } });
  }));

  // Download all selected files to a specific agent
  router.post('/agents/:agentId/download-batch', wrap(async (req, res) => {
    const { agentId } = req.params;
    const { recordingFileIds } = req.body;
    const settings = services.settingsRepo.getAll();

    let sentCount = 0;
    for (const fileId of recordingFileIds) {
      const file = await getFileForAgentDownload(services, fileId);
      if (file) {
        // Create download task in DB to track on Downloads page
        const task = services.downloadRepo.createTask(fileId, {
          destinationDir: `[Agent] ${agentId}`,
          agentId,
        }, settings.folderTemplate);

        const sent = sendDownloadToAgent(agentId, {
          taskId: task.id,
          downloadUrl: file.downloadUrl,
          destinationPath: file.destinationPath,
          accessToken: file.accessToken,
          fileSize: file.fileSize,
        });
        if (sent) {
          services.downloadRepo.updateStatus(task.id, 'downloading');
          sentCount++;
        }
      }
    }

    res.json({ success: true, data: { sent: sentCount, total: recordingFileIds.length } });
  }));

  // === Google Drive ===
  if (services.googleDriveService) {
    const gdrive = services.googleDriveService;

    router.get('/google/status', wrap(async (_req, res) => {
      res.json({ success: true, data: gdrive.getStatus() });
    }));

    router.get('/google/settings', wrap(async (_req, res) => {
      res.json({ success: true, data: gdrive.getSettings() });
    }));

    router.put('/google/settings', wrap(async (req, res) => {
      gdrive.saveSettings(req.body);
      res.json({ success: true, data: null });
    }));

    router.get('/google/auth-url', wrap(async (req, res) => {
      const proto = req.get('x-forwarded-proto') || req.protocol;
      const redirectUri = req.query.redirect_uri as string ||
        `${proto}://${req.get('host')}/api/google/callback`;
      const url = gdrive.getAuthUrl(redirectUri);
      res.json({ success: true, data: { url } });
    }));

    router.get('/google/callback', async (req: any, res: any) => {
      try {
        const code = req.query.code as string;
        const proto = req.get('x-forwarded-proto') || req.protocol;
        const redirectUri = `${proto}://${req.get('host')}/api/google/callback`;
        await gdrive.handleCallback(code, redirectUri);
        // Redirect back to settings page
        res.redirect('/#/settings?google=connected');
      } catch (err: any) {
        res.redirect(`/#/settings?google=error&message=${encodeURIComponent(err.message)}`);
      }
    });

    router.post('/google/disconnect', wrap(async (_req, res) => {
      gdrive.disconnect();
      res.json({ success: true, data: null });
    }));

    router.post('/google/upload/:taskId', wrap(async (req, res) => {
      const result = await gdrive.uploadFile(req.params.taskId);
      res.json({ success: true, data: result });
    }));

    router.post('/google/upload-all', wrap(async (_req, res) => {
      const result = await gdrive.uploadAll();
      res.json({ success: true, data: result });
    }));
  }

  return router;
}

// Helper: get file info + access token for agent download
async function getFileForAgentDownload(services: Services, recordingFileId: string) {
  try {
    // Find the recording file
    const queue = await services.downloadService.getQueue();
    // We need to get file info from recording
    const recordings = await services.recordingService.list({ pageSize: 1000 });

    for (const rec of recordings.recordings) {
      const file = rec.recordingFiles.find((f: any) => f.id === recordingFileId);
      if (file) {
        // Get access token for this account
        const account = await services.accountService.getById(rec.accountId);
        if (!account) continue;

        const client = services.accountService.createApiClient(account);
        const token = await client.refreshToken();

        const settings = services.settingsRepo.getAll();
        const template = settings.folderTemplate || '{topic}';

        // Convert UTC to Vietnam timezone (UTC+7)
        const TZ_OFFSET = 7;
        const utcTime = new Date(rec.startTime);
        const localTime = new Date(utcTime.getTime() + TZ_OFFSET * 60 * 60 * 1000);
        const vnYear = String(localTime.getUTCFullYear());
        const vnMonth = String(localTime.getUTCMonth() + 1).padStart(2, '0');
        const vnDay = String(localTime.getUTCDate()).padStart(2, '0');
        const vnDate = `${vnYear}-${vnMonth}-${vnDay}`;
        const vnTime = `${String(localTime.getUTCHours()).padStart(2, '0')}-${String(localTime.getUTCMinutes()).padStart(2, '0')}`;

        const safeTopic = rec.meetingTopic.replace(/[<>:"/\\|?*]/g, '_').trim();
        const safeAccount = account.name.replace(/[<>:"/\\|?*]/g, '_').trim();

        const folderPath = template
          .replace('{account}', safeAccount)
          .replace('{topic}', safeTopic)
          .replace('{year}', vnYear)
          .replace('{month}', vnMonth)
          .replace('{date}', vnDate)
          .replace('{time}', vnTime);

        const datePrefix = `${vnDay}_${vnMonth}_${vnYear}`;
        const destPath = `${folderPath}/${datePrefix} ${file.fileType}.${file.fileExtension}`;

        return {
          downloadUrl: file.downloadUrl,
          destinationPath: destPath,
          accessToken: token,
          fileSize: file.fileSize,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
