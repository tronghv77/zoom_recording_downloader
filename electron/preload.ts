import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe API to the renderer process
// This is the bridge between UI and services — will be replaced by HTTP client in Phase 2

const api = {
  // Account
  account: {
    list: () => ipcRenderer.invoke('account:list'),
    getById: (id: string) => ipcRenderer.invoke('account:getById', id),
    create: (input: any) => ipcRenderer.invoke('account:create', input),
    update: (id: string, input: any) => ipcRenderer.invoke('account:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('account:delete', id),
    testConnection: (id: string) => ipcRenderer.invoke('account:testConnection', id),
  },

  // Recording
  recording: {
    list: (filter: any) => ipcRenderer.invoke('recording:list', filter),
    getById: (id: string) => ipcRenderer.invoke('recording:getById', id),
    sync: (accountId: string) => ipcRenderer.invoke('recording:sync', accountId),
    syncAll: () => ipcRenderer.invoke('recording:syncAll'),
    deleteFromCloud: (id: string) => ipcRenderer.invoke('recording:deleteFromCloud', id),
  },

  // Download
  download: {
    enqueue: (fileIds: string[], options: any) =>
      ipcRenderer.invoke('download:enqueue', fileIds, options),
    pause: (taskId: string) => ipcRenderer.invoke('download:pause', taskId),
    resume: (taskId: string) => ipcRenderer.invoke('download:resume', taskId),
    cancel: (taskId: string) => ipcRenderer.invoke('download:cancel', taskId),
    retry: (taskId: string) => ipcRenderer.invoke('download:retry', taskId),
    getQueue: () => ipcRenderer.invoke('download:getQueue'),
    onProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('download:progress', listener);
      return () => ipcRenderer.removeListener('download:progress', listener);
    },
  },

  // System
  system: {
    selectDirectory: () => ipcRenderer.invoke('system:selectDirectory'),
    getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
  },
};

contextBridge.exposeInMainWorld('api', api);

// Type declaration for renderer
export type ElectronApi = typeof api;
