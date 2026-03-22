import * as http from 'http';
import { exec } from 'child_process';
import { getSettingsHTML } from './AgentUI';
import { loadConfig, saveConfig, SavedConfig } from './AgentConfig';
import { getUpdateInfo } from './UpdateChecker';

interface AgentServerDeps {
  getStatus: () => {
    version: string;
    connectionStatus: string;
    deviceName: string;
    downloads: { name: string; progress: number; speed: number }[];
  };
  getConfig: () => SavedConfig | null;
  onConfigSaved: (config: SavedConfig) => void;
  getServerWebUrl: () => string;
  getVersion: () => string;
}

export function startAgentServer(deps: AgentServerDeps, port = 17710): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS + JSON helpers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '/';

    try {
      // Serve UI
      if (url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getSettingsHTML());
        return;
      }

      // Status endpoint
      if (url === '/api/status' && req.method === 'GET') {
        const status = deps.getStatus();
        sendJson(res, status);
        return;
      }

      // Get config
      if (url === '/api/config' && req.method === 'GET') {
        const config = deps.getConfig() || loadConfig() || {};
        sendJson(res, config);
        return;
      }

      // Save config
      if (url === '/api/config' && req.method === 'POST') {
        const body = await readBody(req);
        const config = JSON.parse(body) as SavedConfig;

        if (!config.deviceName || !config.downloadPath || !config.serverUrl) {
          sendJson(res, { ok: false, error: 'Vui long dien day du thong tin' }, 400);
          return;
        }

        saveConfig(config);
        deps.onConfigSaved(config);
        sendJson(res, { ok: true });
        return;
      }

      // Open web browser
      if (url === '/api/open-web' && req.method === 'POST') {
        const webUrl = deps.getServerWebUrl();
        exec(`start "" "${webUrl}"`);
        sendJson(res, { ok: true });
        return;
      }

      // Check update
      if (url === '/api/check-update' && req.method === 'GET') {
        const info = await getUpdateInfo(deps.getVersion());
        sendJson(res, info);
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      sendJson(res, { error: msg }, 500);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[Agent UI] http://127.0.0.1:${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Agent UI] Port ${port} in use, trying ${port + 1}...`);
      server.listen(port + 1, '127.0.0.1');
    }
  });

  return server;
}

function sendJson(res: http.ServerResponse, data: any, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
