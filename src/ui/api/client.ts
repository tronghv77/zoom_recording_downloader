// API client — auto-detects Electron (IPC) vs Web (HTTP) mode
// Phase 1: Electron IPC via window.api (preload)
// Phase 2: HTTP/WebSocket via httpApi

import type { ElectronApi } from '../../../electron/preload';
import { httpApi } from './http-client';

declare global {
  interface Window {
    api?: ElectronApi;
  }
}

// If window.api exists → running in Electron → use IPC
// Otherwise → running in browser → use HTTP
export const api: ElectronApi = window.api || (httpApi as any);

export const isElectron = !!window.api;
export const isWeb = !window.api;
