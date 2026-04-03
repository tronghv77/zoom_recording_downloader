import { contextBridge, ipcRenderer } from 'electron';

// Helper: invoke IPC and unwrap {success, data, error} envelope
async function invoke<T>(channel: string, ...args: any[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result && typeof result === 'object' && 'success' in result) {
    if (!result.success) throw new Error(result.error || 'Unknown error');
    return result.data as T;
  }
  return result as T; // For system handlers that don't use safeHandle
}

const api = {
  // Account
  account: {
    list: () => invoke<any[]>('account:list'),
    getById: (id: string) => invoke<any>('account:getById', id),
    create: (input: any) => invoke<any>('account:create', input),
    update: (id: string, input: any) => invoke<any>('account:update', id, input),
    delete: (id: string) => invoke<void>('account:delete', id),
    testConnection: (id: string) => invoke<boolean>('account:testConnection', id),
  },

  // Recording
  recording: {
    list: (filter: any) => invoke<any>('recording:list', filter),
    getById: (id: string) => invoke<any>('recording:getById', id),
    sync: (accountId: string, fromDate?: string, toDate?: string) =>
      invoke<any>('recording:sync', accountId, fromDate, toDate),
    syncAll: (fromDate?: string, toDate?: string) =>
      invoke<any[]>('recording:syncAll', fromDate, toDate),
    deleteFromCloud: (id: string, permanent?: boolean) =>
      invoke<void>('recording:deleteFromCloud', id, permanent),
    rename: (id: string, newTopic: string, updateCloud: boolean) =>
      invoke<void>('recording:rename', id, newTopic, updateCloud),
    clear: (accountId?: string) => invoke<number>('recording:clear', accountId),
  },

  // Download
  download: {
    enqueue: (fileIds: string[], options: any) =>
      invoke<any[]>('download:enqueue', fileIds, options),
    pause: (taskId: string) => invoke<void>('download:pause', taskId),
    resume: (taskId: string) => invoke<void>('download:resume', taskId),
    cancel: (taskId: string) => invoke<void>('download:cancel', taskId),
    retry: (taskId: string) => invoke<void>('download:retry', taskId),
    getQueue: () => invoke<any[]>('download:getQueue'),
    getSummary: () => invoke<Record<string, any>>('download:getSummary'),
    clear: (status?: string) => invoke<number>('download:clear', status),
    onProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('download:progress', listener);
      return () => ipcRenderer.removeListener('download:progress', listener);
    },
  },

  // Scheduler
  scheduler: {
    getConfig: () => invoke<any>('scheduler:getConfig'),
    saveConfig: (config: any) => invoke<any>('scheduler:saveConfig', config),
    runNow: () => invoke<string[]>('scheduler:runNow'),
    status: () => invoke<any>('scheduler:status'),
    onMessage: (callback: (message: string) => void) => {
      const listener = (_event: any, message: string) => callback(message);
      ipcRenderer.on('scheduler:message', listener);
      return () => ipcRenderer.removeListener('scheduler:message', listener);
    },
  },

  // Settings
  settings: {
    getAll: () => invoke<any>('settings:getAll'),
    save: (settings: any) => invoke<any>('settings:save', settings),
  },

  // System
  system: {
    selectDirectory: () => ipcRenderer.invoke('system:selectDirectory'),
    getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
    openFolder: (path: string) => ipcRenderer.invoke('system:openFolder', path),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;
