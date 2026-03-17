// Download Agent — runs on target devices
// Connects to central server via WebSocket, receives download commands

import WebSocket from 'ws';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface AgentConfig {
  serverUrl: string; // ws://server:3000/ws
  deviceName: string;
  downloadPath: string;
  maxConcurrent?: number;
}

interface DownloadCommand {
  taskId: string;
  downloadUrl: string;
  destinationPath: string;
  accessToken: string;
  fileSize: number;
}

export class AgentClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeDownloads = new Map<string, AbortController>();

  constructor(private config: AgentConfig) {}

  connect(): void {
    console.log(`[Agent] Connecting to ${this.config.serverUrl}...`);
    this.ws = new WebSocket(this.config.serverUrl);

    this.ws.on('open', () => {
      console.log(`[Agent] Connected as "${this.config.deviceName}"`);
      this.send('agent:register', {
        deviceName: this.config.deviceName,
        downloadPath: this.config.downloadPath,
      });
    });

    this.ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        this.handleMessage(message);
      } catch {}
    });

    this.ws.on('close', () => {
      console.log('[Agent] Disconnected, reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      console.error('[Agent] WebSocket error:', err.message);
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    // Cancel all active downloads
    for (const [, controller] of this.activeDownloads) {
      controller.abort();
    }
  }

  private handleMessage(message: { type: string; data: any }): void {
    switch (message.type) {
      case 'agent:registered':
        console.log(`[Agent] Registered with ID: ${message.data.agentId}`);
        break;
      case 'download:start':
        this.executeDownload(message.data);
        break;
      case 'download:cancel': {
        const controller = this.activeDownloads.get(message.data.taskId);
        if (controller) {
          controller.abort();
          this.activeDownloads.delete(message.data.taskId);
        }
        break;
      }
    }
  }

  private async executeDownload(cmd: DownloadCommand): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(cmd.taskId, controller);

    try {
      const destPath = path.join(this.config.downloadPath, cmd.destinationPath);
      const dir = path.dirname(destPath);
      fs.mkdirSync(dir, { recursive: true });

      console.log(`[Agent] Downloading: ${cmd.destinationPath}`);

      const separator = cmd.downloadUrl.includes('?') ? '&' : '?';
      const url = `${cmd.downloadUrl}${separator}access_token=${cmd.accessToken}`;

      const response = await axios.get(url, {
        responseType: 'stream',
        signal: controller.signal,
        maxRedirects: 5,
      });

      const writer = fs.createWriteStream(destPath);
      const totalBytes = Number(response.headers['content-length']) || cmd.fileSize;
      let bytesDownloaded = 0;
      let lastEmit = Date.now();

      response.data.on('data', (chunk: Buffer) => {
        bytesDownloaded += chunk.length;
        const now = Date.now();

        if (now - lastEmit >= 500) {
          lastEmit = now;
          const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
          this.send('agent:progress', {
            taskId: cmd.taskId,
            progress,
            bytesDownloaded,
            totalBytes,
            status: 'downloading',
          });
        }
      });

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.pipe(writer);
      });

      this.send('agent:progress', {
        taskId: cmd.taskId,
        progress: 100,
        bytesDownloaded: totalBytes,
        totalBytes,
        status: 'completed',
      });

      console.log(`[Agent] Completed: ${cmd.destinationPath}`);
    } catch (error: unknown) {
      if (!axios.isCancel(error)) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Agent] Failed: ${msg}`);
        this.send('agent:progress', {
          taskId: cmd.taskId,
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: cmd.fileSize,
          status: 'failed',
          error: msg,
        });
      }
    } finally {
      this.activeDownloads.delete(cmd.taskId);
    }
  }

  private send(type: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const serverUrl = args[0] || 'ws://localhost:3000/ws';
  const deviceName = args[1] || `Agent-${require('os').hostname()}`;
  const downloadPath = args[2] || './downloads';

  console.log(`[Agent] Server: ${serverUrl}`);
  console.log(`[Agent] Device: ${deviceName}`);
  console.log(`[Agent] Download path: ${downloadPath}`);

  const agent = new AgentClient({ serverUrl, deviceName, downloadPath });
  agent.connect();

  process.on('SIGINT', () => {
    console.log('[Agent] Shutting down...');
    agent.disconnect();
    process.exit(0);
  });
}
