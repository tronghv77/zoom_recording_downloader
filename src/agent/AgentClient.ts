import WebSocket from 'ws';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

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

interface ActiveDownloadInfo {
  name: string;
  progress: number;
  speed: number;
}

export class AgentClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeDownloads = new Map<string, AbortController>();
  private downloadInfo = new Map<string, ActiveDownloadInfo>();
  private agentId: string | null = null;
  private _config: AgentConfig;

  constructor(config: AgentConfig) {
    this._config = config;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionStatus(): string {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      default: return 'disconnected';
    }
  }

  get activeDownloadCount(): number {
    return this.activeDownloads.size;
  }

  get activeDownloadList(): ActiveDownloadInfo[] {
    return Array.from(this.downloadInfo.values());
  }

  get config(): AgentConfig {
    return this._config;
  }

  connect(): void {
    console.log(`[Agent] Connecting to ${this._config.serverUrl}...`);
    this.ws = new WebSocket(this._config.serverUrl);

    this.ws.on('open', () => {
      console.log(`[Agent] Connected. Registering as "${this._config.deviceName}"...`);
      this.send('agent:register', {
        id: `agent-${this._config.deviceName.replace(/\s+/g, '-').toLowerCase()}`,
        deviceName: this._config.deviceName,
        downloadPath: this._config.downloadPath,
        secret: this._config.secret,
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
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    for (const [, controller] of this.activeDownloads) {
      controller.abort();
    }
  }

  reconnect(newConfig: AgentConfig): void {
    console.log('[Agent] Reconnecting with new config...');
    this.disconnect();
    this._config = newConfig;
    setTimeout(() => this.connect(), 500);
  }

  private handleMessage(message: { type: string; data: any }): void {
    switch (message.type) {
      case 'agent:registered':
        this.agentId = message.data.agentId;
        console.log(`[Agent] Registered! ID: ${this.agentId}`);
        console.log(`[Agent] Download path: ${this._config.downloadPath}`);
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
          this.downloadInfo.delete(message.data.taskId);
          console.log(`[Agent] Cancelled: ${message.data.taskId}`);
        }
        break;
      }
    }
  }

  private async executeDownload(cmd: DownloadCommand): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(cmd.taskId, controller);
    this.downloadInfo.set(cmd.taskId, {
      name: cmd.destinationPath,
      progress: 0,
      speed: 0,
    });

    try {
      const destPath = path.join(this._config.downloadPath, cmd.destinationPath);
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

          // Update local info for UI
          this.downloadInfo.set(cmd.taskId, {
            name: cmd.destinationPath,
            progress,
            speed,
          });

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
      this.downloadInfo.delete(cmd.taskId);
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
import { loadConfig, promptSetup, getConfigFilePath, DEFAULT_SERVER, DEFAULT_SECRET, SavedConfig } from './AgentConfig';
import { checkForUpdate } from './UpdateChecker';
import { startAgentServer } from './AgentServer';
import { startTray, stopTray } from './AgentTray';

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

  const NO_GUI = hasFlag('--no-gui');

  async function main(): Promise<void> {
    console.log(`╔══════════════════════════════════════════════╗`);
    console.log(`║     Zoom Recording Download Agent v${AGENT_VERSION}`.padEnd(49) + '║');
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log('');

    // Check for updates (non-blocking)
    checkForUpdate(AGENT_VERSION);

    let config: AgentConfig;

    // --setup flag in no-gui mode: force readline wizard
    if (hasFlag('--setup') && NO_GUI) {
      const existing = loadConfig();
      await promptSetup(existing || undefined);
      return;
    }

    // Check if CLI args provided (explicit override)
    const hasCliArgs = getArg('--server') || getArg('--name') || getArg('--path');

    if (hasCliArgs) {
      config = {
        serverUrl: getArg('--server') || DEFAULT_SERVER,
        deviceName: getArg('--name') || os.hostname(),
        downloadPath: getArg('--path') || path.resolve('./downloads'),
        secret: getArg('--secret') || DEFAULT_SECRET,
      };
    } else {
      const saved = loadConfig();
      if (saved) {
        config = { ...saved };
        console.log(`  Config:  ${getConfigFilePath()}`);
      } else if (NO_GUI) {
        console.log('  Lần đầu sử dụng — vui lòng cấu hình:');
        const newConfig = await promptSetup();
        config = { ...newConfig };
      } else {
        // GUI mode, first run — use defaults, user will configure via browser
        config = {
          serverUrl: DEFAULT_SERVER,
          deviceName: os.hostname(),
          downloadPath: path.resolve('./downloads'),
          secret: DEFAULT_SECRET,
        };
      }
    }

    console.log(`  Server:  ${config.serverUrl}`);
    console.log(`  Device:  ${config.deviceName}`);
    console.log(`  Path:    ${config.downloadPath}`);
    console.log('');

    // Ensure download path exists
    fs.mkdirSync(config.downloadPath, { recursive: true });

    // Create agent and connect
    const agent = new AgentClient(config);
    agent.connect();

    // Start GUI if not --no-gui
    if (!NO_GUI) {
      const uiPort = 17710;

      // Start local HTTP settings server
      startAgentServer({
        getStatus: () => ({
          version: AGENT_VERSION,
          connectionStatus: agent.connectionStatus,
          deviceName: agent.config.deviceName,
          downloads: agent.activeDownloadList,
        }),
        getConfig: () => loadConfig(),
        onConfigSaved: (newConfig: SavedConfig) => {
          fs.mkdirSync(newConfig.downloadPath, { recursive: true });
          agent.reconnect({ ...newConfig });
        },
        getServerWebUrl: () => {
          // Convert wss://host/ws → https://host
          const wsUrl = agent.config.serverUrl;
          return wsUrl
            .replace(/^wss:/, 'https:')
            .replace(/^ws:/, 'http:')
            .replace(/\/ws\/?$/, '');
        },
        getVersion: () => AGENT_VERSION,
      }, uiPort);

      // Start system tray
      startTray({
        onOpenSettings: () => {
          exec(`start "" "http://127.0.0.1:${uiPort}"`);
        },
        onOpenWeb: () => {
          const webUrl = agent.config.serverUrl
            .replace(/^wss:/, 'https:')
            .replace(/^ws:/, 'http:')
            .replace(/\/ws\/?$/, '');
          exec(`start "" "${webUrl}"`);
        },
        onQuit: () => {
          console.log('\n[Agent] Shutting down...');
          stopTray();
          agent.disconnect();
          process.exit(0);
        },
      });

      // Open browser on first run (no saved config) or --setup
      const isFirstRun = !loadConfig() || hasFlag('--setup');
      if (isFirstRun) {
        setTimeout(() => {
          exec(`start "" "http://127.0.0.1:${uiPort}"`);
        }, 1000);
      }

      console.log(`  Tip: Mở trình duyệt -> http://127.0.0.1:${uiPort}`);
      console.log('  Tip: Click phải icon tray để mở cài đặt');
    } else {
      console.log('  Tip: Chạy với --setup để thay đổi cấu hình');
    }
    console.log('');

    process.on('SIGINT', () => {
      console.log('\n[Agent] Shutting down...');
      stopTray();
      agent.disconnect();
      process.exit(0);
    });
  }

  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
