import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { initDatabase, closeDatabase } from '../src/database/connection';
import { runMigrations } from '../src/database/migrations';
import { AccountRepository } from '../src/database/repositories/AccountRepository';
import { RecordingRepository } from '../src/database/repositories/RecordingRepository';
import { DownloadRepository } from '../src/database/repositories/DownloadRepository';
import { SettingsRepository } from '../src/database/repositories/SettingsRepository';
import { AccountService } from '../src/services/AccountService';
import { RecordingService } from '../src/services/RecordingService';
import { DownloadService } from '../src/services/DownloadService';
import { SchedulerService } from '../src/services/SchedulerService';
import { GoogleDriveService } from '../src/services/GoogleDriveService';
import { createApiRouter } from './routes/api';
import { setupWebSocket } from './ws';
import { sessionMiddleware, requireAuth, createAuthRouter } from './auth';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function main() {
  // Initialize database
  const db = await initDatabase();
  runMigrations(db);

  // Create repositories
  const accountRepo = new AccountRepository(db);
  const recordingRepo = new RecordingRepository(db);
  const downloadRepo = new DownloadRepository(db);
  const settingsRepo = new SettingsRepository(db);

  // Create services
  const accountService = new AccountService(accountRepo);
  const recordingService = new RecordingService(recordingRepo, accountService);
  const downloadService = new DownloadService(downloadRepo, recordingRepo, accountService);
  const schedulerService = new SchedulerService(
    recordingService, downloadService, accountService, settingsRepo, recordingRepo,
  );

  // Auto-start scheduler
  const schedulerConfig = schedulerService.getConfig();
  if (schedulerConfig.enabled) {
    schedulerService.start(schedulerConfig);
  }

  // Google Drive service
  const googleDriveService = new GoogleDriveService(settingsRepo, downloadRepo);

  const services = { accountService, recordingService, downloadService, schedulerService, settingsRepo, downloadRepo, googleDriveService };

  // Create Express app
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(sessionMiddleware);

  // Auth routes (login/logout/status) — no auth required
  app.use('/api/auth', createAuthRouter());

  // Protect all other API routes
  app.use(requireAuth);

  // API routes
  app.use('/api', createApiRouter(services));

  // Serve static web UI (built by vite)
  // Try multiple paths for compatibility (local dev vs Railway)
  const possiblePaths = [
    path.join(__dirname, '../../../dist/renderer'),  // local: dist/server/server/ → project root
    path.join(__dirname, '../../dist/renderer'),      // Railway may flatten
    path.join(process.cwd(), 'dist/renderer'),        // from CWD
  ];
  const fs = require('fs');
  const webUiPath = possiblePaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[2];
  console.log(`[Server] Serving UI from: ${webUiPath}`);
  app.use(express.static(webUiPath));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(webUiPath, 'index.html'));
  });

  // Create HTTP server + WebSocket
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  setupWebSocket(wss, services);

  // Forward download progress via WebSocket + auto-upload
  downloadService.onProgress((progress) => {
    const message = JSON.stringify({ type: 'download:progress', data: progress });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });

    // Auto-upload to Google Drive when completed
    if (progress.status === 'completed') {
      googleDriveService.onDownloadCompleted(progress.taskId).catch(() => {});
    }
  });

  // Forward scheduler messages via WebSocket
  schedulerService.onMessage((msg) => {
    const message = JSON.stringify({ type: 'scheduler:message', data: msg });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  const HOST = '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log(`[Server] Running at http://${HOST}:${PORT}`);
    console.log(`[Server] WebSocket at ws://${HOST}:${PORT}/ws`);
    console.log(`[Server] API at http://${HOST}:${PORT}/api`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[Server] Shutting down...');
    schedulerService.stop();
    closeDatabase();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
