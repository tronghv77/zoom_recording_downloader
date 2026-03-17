// Phase 3: Download Agent — runs on target devices
// Connects to central server via WebSocket, receives download commands

import type { AgentInfo, AgentRegistration, DownloadTask, DownloadProgress } from '../shared/types';

type AgentEventHandler = {
  onDownloadCommand: (task: DownloadTask) => void;
  onCancelCommand: (taskId: string) => void;
};

export class AgentClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Partial<AgentEventHandler> = {};

  constructor(
    private serverUrl: string,
    private registration: AgentRegistration,
  ) {}

  // Connect to server and register this agent
  connect(): void {
    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      console.log('Agent connected to server');
      this.send('agent:register', this.registration);
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onclose = () => {
      console.log('Agent disconnected, reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }

  // Report download progress back to server
  reportProgress(progress: DownloadProgress): void {
    this.send('agent:progress', progress);
  }

  // Report agent status (disk space, active downloads)
  reportStatus(info: Partial<AgentInfo>): void {
    this.send('agent:status', info);
  }

  on<K extends keyof AgentEventHandler>(event: K, handler: AgentEventHandler[K]): void {
    this.handlers[event] = handler;
  }

  private handleMessage(message: { type: string; payload: any }): void {
    switch (message.type) {
      case 'download:start':
        this.handlers.onDownloadCommand?.(message.payload);
        break;
      case 'download:cancel':
        this.handlers.onCancelCommand?.(message.payload.taskId);
        break;
    }
  }

  private send(type: string, payload: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}
