import WebSocket from 'ws';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface AgentConfig {
  serverUrl: string;
  deviceName: string;
  downloadPath: string;
  secret: string;
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
  private agentId: string | null = null;

  constructor(private config: AgentConfig) {}

  connect(): void {
    console.log(`[Agent] Connecting to ${this.config.serverUrl}...`);
    this.ws = new WebSocket(this.config.serverUrl);

    this.ws.on('open', () => {
      console.log(`[Agent] Connected. Registering as "${this.config.deviceName}"...`);
      this.send('agent:register', {
        id: `agent-${this.config.deviceName.replace(/\s+/g, '-').toLowerCase()}`,
        deviceName: this.config.deviceName,
        downloadPath: this.config.downloadPath,
        secret: this.config.secret,
      });
    });

    this.ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        this.handleMessage(message);
      } catch {}
    });

    this.ws.on('close', () => {
      console.log('[Agent] Disconnected. Reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      console.error('[Agent] Error:', err.message);
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    for (const [, controller] of this.activeDownloads) {
      controller.abort();
    }
  }

  private handleMessage(message: { type: string; data: any }): void {
    switch (message.type) {
      case 'agent:registered':
        this.agentId = message.data.agentId;
        console.log(`[Agent] Registered! ID: ${this.agentId}`);
        console.log(`[Agent] Download path: ${this.config.downloadPath}`);
        console.log(`[Agent] Waiting for download commands...`);
        break;

      case 'agent:error':
        console.error(`[Agent] Server error: ${message.data.message}`);
        break;

      case 'download:start':
        console.log(`[Agent] Received download command: ${message.data.destinationPath}`);
        this.executeDownload(message.data);
        break;

      case 'download:cancel': {
        const controller = this.activeDownloads.get(message.data.taskId);
        if (controller) {
          controller.abort();
          this.activeDownloads.delete(message.data.taskId);
          console.log(`[Agent] Cancelled: ${message.data.taskId}`);
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

      console.log(`[Agent] Downloading → ${destPath}`);

      const separator = cmd.downloadUrl.includes('?') ? '&' : '?';
      const url = `${cmd.downloadUrl}${separator}access_token=${cmd.accessToken}`;

      const response = await axios.get(url, {
        responseType: 'stream',
        signal: controller.signal,
        maxRedirects: 5,
        timeout: 30000,
      });

      const writer = fs.createWriteStream(destPath);
      const totalBytes = Number(response.headers['content-length']) || cmd.fileSize;
      let bytesDownloaded = 0;
      let lastEmit = Date.now();
      let lastSpeedTime = Date.now();
      let lastSpeedBytes = 0;
      let speed = 0;

      response.data.on('data', (chunk: Buffer) => {
        bytesDownloaded += chunk.length;
        const now = Date.now();

        // Speed calc
        const speedElapsed = (now - lastSpeedTime) / 1000;
        if (speedElapsed >= 1) {
          speed = (bytesDownloaded - lastSpeedBytes) / speedElapsed;
          lastSpeedTime = now;
          lastSpeedBytes = bytesDownloaded;
        }

        // Progress report (throttled)
        if (now - lastEmit >= 500) {
          lastEmit = now;
          const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
          this.send('agent:progress', {
            taskId: cmd.taskId,
            progress,
            bytesDownloaded,
            totalBytes,
            speed,
            status: 'downloading',
          });
        }
      });

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
        response.data.pipe(writer);
      });

      this.send('agent:progress', {
        taskId: cmd.taskId,
        progress: 100,
        bytesDownloaded: totalBytes,
        totalBytes,
        speed: 0,
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
          speed: 0,
          status: 'failed',
          error: msg,
        });
      }
    } finally {
      this.activeDownloads.delete(cmd.taskId);
      this.send('agent:status', { currentDownloads: this.activeDownloads.size });
    }
  }

  private send(type: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }
}

// === CLI Entry Point ===
import { loadConfig, saveConfig, promptSetup, getConfigFilePath, DEFAULT_SERVER, DEFAULT_SECRET } from './AgentConfig';
import { checkForUpdate } from './UpdateChecker';

const AGENT_VERSION = process.env.AGENT_VERSION || '0.0.0';

if (require.main === module) {
  const args = process.argv.slice(2);

  function getArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
  }

  function hasFlag(flag: string): boolean {
    return args.includes(flag);
  }

  async function main(): Promise<void> {
    console.log(`╔══════════════════════════════════════════════╗`);
    console.log(`║     Zoom Recording Download Agent v${AGENT_VERSION}`.padEnd(49) + '║');
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log('');

    // Check for updates (non-blocking)
    checkForUpdate(AGENT_VERSION);

    let config: AgentConfig;

    // --setup flag: force reconfigure
    if (hasFlag('--setup')) {
      const existing = loadConfig();
      const saved = await promptSetup(existing || undefined);
      config = { ...saved };
      return; // Exit after setup, user will relaunch
    }

    // Check if CLI args provided (explicit override)
    const hasCliArgs = getArg('--server') || getArg('--name') || getArg('--path');

    if (hasCliArgs) {
      // Use CLI args directly (backward compatible)
      config = {
        serverUrl: getArg('--server') || DEFAULT_SERVER,
        deviceName: getArg('--name') || os.hostname(),
        downloadPath: getArg('--path') || path.resolve('./downloads'),
        secret: getArg('--secret') || DEFAULT_SECRET,
      };
    } else {
      // Try loading saved config
      const saved = loadConfig();
      if (saved) {
        config = { ...saved };
        console.log(`  Config:  ${getConfigFilePath()}`);
      } else {
        // First run — show setup wizard
        console.log('  Lan dau su dung — vui long cau hinh:');
        const newConfig = await promptSetup();
        config = { ...newConfig };
      }
    }

    console.log(`  Server:  ${config.serverUrl}`);
    console.log(`  Device:  ${config.deviceName}`);
    console.log(`  Path:    ${config.downloadPath}`);
    console.log('');
    console.log('  Tip: Chay voi --setup de thay doi cau hinh');
    console.log('');

    // Ensure download path exists
    fs.mkdirSync(config.downloadPath, { recursive: true });

    const agent = new AgentClient(config);
    agent.connect();

    process.on('SIGINT', () => {
      console.log('\n[Agent] Shutting down...');
      agent.disconnect();
      process.exit(0);
    });
  }

  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
