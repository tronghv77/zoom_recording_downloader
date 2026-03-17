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
import { createApiRouter } from './routes/api';
import { setupWebSocket } from './ws';

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

  const services = { accountService, recordingService, downloadService, schedulerService, settingsRepo };

  // Create Express app
  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api', createApiRouter(services));

  // Serve static web UI (built by vite)
  // __dirname = dist/server/server/, so go up 3 levels to project root
  const webUiPath = path.join(__dirname, '../../../dist/renderer');
  app.use(express.static(webUiPath));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(webUiPath, 'index.html'));
  });

  // Create HTTP server + WebSocket
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  setupWebSocket(wss, services);

  // Forward download progress via WebSocket
  downloadService.onProgress((progress) => {
    const message = JSON.stringify({ type: 'download:progress', data: progress });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
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

  server.listen(PORT, () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] WebSocket at ws://localhost:${PORT}/ws`);
    console.log(`[Server] API at http://localhost:${PORT}/api`);
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
