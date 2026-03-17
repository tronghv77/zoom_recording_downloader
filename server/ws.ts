import { WebSocketServer, WebSocket } from 'ws';
import type { DownloadService } from '../src/services/DownloadService';
import type { SchedulerService } from '../src/services/SchedulerService';

interface Services {
  downloadService: DownloadService;
  schedulerService: SchedulerService;
  [key: string]: any;
}

interface AgentInfo {
  id: string;
  deviceName: string;
  ws: WebSocket;
  connectedAt: string;
}

const connectedAgents = new Map<string, AgentInfo>();

export function setupWebSocket(wss: WebSocketServer, _services: Services): void {
  wss.on('connection', (ws) => {
    let agentId: string | null = null;

    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        handleMessage(ws, message);
      } catch {}
    });

    ws.on('close', () => {
      if (agentId) {
        connectedAgents.delete(agentId);
        broadcast(wss, { type: 'agent:disconnected', data: { agentId } });
      }
    });

    function handleMessage(ws: WebSocket, message: { type: string; data: any }) {
      switch (message.type) {
        case 'agent:register': {
          agentId = message.data.id || `agent-${Date.now()}`;
          connectedAgents.set(agentId!, {
            id: agentId!,
            deviceName: message.data.deviceName || 'Unknown',
            ws,
            connectedAt: new Date().toISOString(),
          });
          ws.send(JSON.stringify({ type: 'agent:registered', data: { agentId } }));
          broadcast(wss, { type: 'agent:connected', data: { agentId, deviceName: message.data.deviceName } });
          break;
        }

        case 'agent:progress': {
          // Forward agent's download progress to all web clients
          broadcast(wss, { type: 'download:progress', data: message.data });
          break;
        }
      }
    }
  });
}

export function getConnectedAgents(): Array<{ id: string; deviceName: string; connectedAt: string }> {
  return Array.from(connectedAgents.values()).map(({ id, deviceName, connectedAt }) => ({
    id, deviceName, connectedAt,
  }));
}

export function sendToAgent(agentId: string, message: any): boolean {
  const agent = connectedAgents.get(agentId);
  if (!agent || agent.ws.readyState !== WebSocket.OPEN) return false;
  agent.ws.send(JSON.stringify(message));
  return true;
}

function broadcast(wss: WebSocketServer, message: any): void {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
