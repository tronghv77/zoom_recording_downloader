// Phase 3: Download Agent types — defined now to plan for Hybrid

export interface AgentInfo {
  id: string;
  deviceName: string;
  defaultDownloadPath: string;
  diskFreeSpace: number; // bytes
  diskTotalSpace: number; // bytes
  status: AgentStatus;
  currentDownloads: number;
  maxConcurrentDownloads: number;
  lastSeenAt: string;
  registeredAt: string;
}

export type AgentStatus = 'online' | 'offline' | 'busy';

export interface AgentRegistration {
  deviceName: string;
  defaultDownloadPath: string;
  maxConcurrentDownloads?: number;
}
