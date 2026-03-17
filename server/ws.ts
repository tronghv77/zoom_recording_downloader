import { WebSocketServer, WebSocket } from 'ws';
import type { AccountService } from '../src/services/AccountService';
import type { DownloadService } from '../src/services/DownloadService';
import type { SchedulerService } from '../src/services/SchedulerService';
import type { SettingsRepository } from '../src/database/repositories/SettingsRepository';

interface Services {
  accountService: AccountService;
  downloadService: DownloadService;
  schedulerService: SchedulerService;
  settingsRepo: SettingsRepository;
  [key: string]: any;
}

export interface ConnectedAgent {
  id: string;
  deviceName: string;
  downloadPath: string;
  ws: WebSocket;
  status: 'online' | 'busy';
  currentDownloads: number;
  connectedAt: string;
}

const AGENT_SECRET = process.env.AGENT_SECRET || 'zoom-dl-agent-2026';
const connectedAgents = new Map<string, ConnectedAgent>();

export function setupWebSocket(wss: WebSocketServer, services: Services): void {
  wss.on('connection', (ws) => {
    let agentId: string | null = null;
    let isAgent = false;

    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        handleMessage(ws, message);
      } catch {}
    });

    ws.on('close', () => {
      if (agentId && isAgent) {
        connectedAgents.delete(agentId);
        broadcastToWebClients(wss, { type: 'agent:list', data: getAgentList() });
      }
    });

    function handleMessage(ws: WebSocket, message: { type: string; data: any }) {
      switch (message.type) {
        // Agent registration with secret key
        case 'agent:register': {
          if (message.data.secret !== AGENT_SECRET) {
            ws.send(JSON.stringify({ type: 'agent:error', data: { message: 'Invalid secret key' } }));
            ws.close();
            return;
          }

          agentId = message.data.id || `agent-${Date.now()}`;
          isAgent = true;
          const id = agentId!;

          connectedAgents.set(id, {
            id,
            deviceName: message.data.deviceName || 'Unknown',
            downloadPath: message.data.downloadPath || './downloads',
            ws,
            status: 'online',
            currentDownloads: 0,
            connectedAt: new Date().toISOString(),
          });

          ws.send(JSON.stringify({ type: 'agent:registered', data: { agentId } }));

          // Notify all web clients about updated agent list
          broadcastToWebClients(wss, { type: 'agent:list', data: getAgentList() });
          break;
        }

        // Agent reports download progress
        case 'agent:progress': {
          // Forward to all web clients
          broadcastToWebClients(wss, { type: 'download:progress', data: message.data });

          // Update agent status
          if (agentId && connectedAgents.has(agentId)) {
            const agent = connectedAgents.get(agentId)!;
            if (message.data.status === 'completed' || message.data.status === 'failed') {
              agent.currentDownloads = Math.max(0, agent.currentDownloads - 1);
              agent.status = agent.currentDownloads > 0 ? 'busy' : 'online';
            }

            // Also update download task in DB
            if (message.data.status === 'completed') {
              services.downloadService.getQueue().then(() => {}); // trigger DB save
            }
          }
          break;
        }

        // Agent status update
        case 'agent:status': {
          if (agentId && connectedAgents.has(agentId)) {
            const agent = connectedAgents.get(agentId)!;
            agent.currentDownloads = message.data.currentDownloads || 0;
            agent.status = agent.currentDownloads > 0 ? 'busy' : 'online';
          }
          break;
        }
      }
    }
  });
}

// Send download command to a specific agent
export function sendDownloadToAgent(
  agentId: string,
  command: {
    taskId: string;
    downloadUrl: string;
    destinationPath: string;
    accessToken: string;
    fileSize: number;
  },
): boolean {
  const agent = connectedAgents.get(agentId);
  if (!agent || agent.ws.readyState !== WebSocket.OPEN) return false;

  agent.ws.send(JSON.stringify({ type: 'download:start', data: command }));
  agent.currentDownloads++;
  agent.status = 'busy';
  return true;
}

export function getAgentList(): Array<{
  id: string;
  deviceName: string;
  downloadPath: string;
  status: string;
  currentDownloads: number;
  connectedAt: string;
}> {
  return Array.from(connectedAgents.values()).map(({ id, deviceName, downloadPath, status, currentDownloads, connectedAt }) => ({
    id, deviceName, downloadPath, status, currentDownloads, connectedAt,
  }));
}

function broadcastToWebClients(wss: WebSocketServer, message: any): void {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // Send to all clients (both web and agents)
      client.send(data);
    }
  });
}
