// HTTP API client — used when running as Web App (Phase 2)
// Mirrors the same interface as IPC client (electron preload)

const BASE_URL = window.location.origin;
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  // Redirect to login if unauthorized
  if (res.status === 401) {
    window.location.reload();
    throw new Error('Session expired');
  }

  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Request failed');
  return result.data as T;
}

// WebSocket singleton
let ws: WebSocket | null = null;
const wsListeners = new Map<string, Set<(data: any) => void>>();

function ensureWebSocket(): WebSocket {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  ws = new WebSocket(WS_URL);

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      const listeners = wsListeners.get(message.type);
      if (listeners) {
        listeners.forEach((cb) => cb(message.data));
      }
    } catch {}
  };

  ws.onclose = () => {
    // Auto-reconnect after 3 seconds
    setTimeout(() => { ws = null; ensureWebSocket(); }, 3000);
  };

  return ws;
}

function onWsEvent(type: string, callback: (data: any) => void): () => void {
  ensureWebSocket();
  if (!wsListeners.has(type)) wsListeners.set(type, new Set());
  wsListeners.get(type)!.add(callback);
  return () => { wsListeners.get(type)?.delete(callback); };
}

// API matching the same interface as preload's window.api
export const httpApi = {
  account: {
    list: () => request<any[]>('GET', '/accounts'),
    getById: (id: string) => request<any>('GET', `/accounts/${id}`),
    create: (input: any) => request<any>('POST', '/accounts', input),
    update: (id: string, input: any) => request<any>('PUT', `/accounts/${id}`, input),
    delete: (id: string) => request<void>('DELETE', `/accounts/${id}`),
    testConnection: (id: string) => request<boolean>('POST', `/accounts/${id}/test`),
  },

  recording: {
    list: (filter: any) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filter)) {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      }
      return request<any>('GET', `/recordings?${params.toString()}`);
    },
    getById: (id: string) => request<any>('GET', `/recordings/${id}`),
    sync: (accountId: string, fromDate?: string, toDate?: string) =>
      request<any>('POST', `/recordings/sync/${accountId}`, { fromDate, toDate }),
    syncAll: (fromDate?: string, toDate?: string) =>
      request<any[]>('POST', '/recordings/sync-all', { fromDate, toDate }),
    deleteFromCloud: (id: string) =>
      request<void>('DELETE', `/recordings/${id}/cloud`),
    rename: (id: string, newTopic: string, _updateCloud: boolean) =>
      request<void>('POST', `/recordings/${id}/rename`, { newTopic }),
    clear: (accountId?: string) =>
      request<number>('DELETE', '/recordings/clear', { accountId }),
  },

  download: {
    enqueue: (fileIds: string[], options: any) =>
      request<any[]>('POST', '/downloads/enqueue', { fileIds, options }),
    pause: (taskId: string) => request<void>('POST', `/downloads/${taskId}/pause`),
    resume: (taskId: string) => request<void>('POST', `/downloads/${taskId}/resume`),
    cancel: (taskId: string) => request<void>('POST', `/downloads/${taskId}/cancel`),
    retry: (taskId: string) => request<void>('POST', `/downloads/${taskId}/retry`),
    getQueue: () => request<any[]>('GET', '/downloads'),
    getSummary: () => request<Record<string, any>>('GET', '/downloads/summary'),
    clear: (status?: string) => request<number>('DELETE', '/downloads/clear', { status }),
    onProgress: (callback: (progress: any) => void) => {
      return onWsEvent('download:progress', callback);
    },
  },

  agents: {
    list: () => request<any[]>('GET', '/agents'),
    downloadToAgent: (agentId: string, recordingFileIds: string[]) =>
      request<any>('POST', `/agents/${agentId}/download-batch`, { recordingFileIds }),
    onAgentUpdate: (callback: (agents: any[]) => void) => {
      return onWsEvent('agent:list', callback);
    },
  },

  scheduler: {
    getConfig: () => request<any>('GET', '/scheduler/config'),
    saveConfig: (config: any) => request<any>('PUT', '/scheduler/config', config),
    runNow: () => request<string[]>('POST', '/scheduler/run'),
    status: () => request<any>('GET', '/scheduler/status'),
    onMessage: (callback: (message: string) => void) => {
      return onWsEvent('scheduler:message', callback);
    },
  },

  settings: {
    getAll: () => request<any>('GET', '/settings'),
    save: (settings: any) => request<any>('PUT', '/settings', settings),
  },

  google: {
    getStatus: () => request<any>('GET', '/google/status'),
    getSettings: () => request<any>('GET', '/google/settings'),
    saveSettings: (settings: any) => request<any>('PUT', '/google/settings', settings),
    getAuthUrl: (redirectUri?: string) => request<any>('GET', `/google/auth-url${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`),
    disconnect: () => request<void>('POST', '/google/disconnect'),
    upload: (taskId: string) => request<any>('POST', `/google/upload/${taskId}`),
    uploadAll: () => request<any>('POST', '/google/upload-all'),
  },

  system: {
    selectDirectory: async () => {
      const dir = prompt(
        'Enter download directory path on server:\n\n' +
        'Example: D:\\ZoomRecordings or /home/user/zoom',
      );
      return dir?.trim() || null;
    },
    getAppVersion: async () => '0.1.0',
  },
};
