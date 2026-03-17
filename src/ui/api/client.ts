// API client — abstracts communication with backend
// Phase 1: Uses Electron IPC via window.api (preload)
// Phase 2: Will switch to HTTP/WebSocket client

import type { ElectronApi } from '../../../electron/preload';

declare global {
  interface Window {
    api: ElectronApi;
  }
}

// Re-export the API for use in UI components
// When migrating to Phase 2, only this file needs to change
export const api = window.api;
