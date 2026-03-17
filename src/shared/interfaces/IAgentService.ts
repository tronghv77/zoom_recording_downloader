import { AgentInfo, AgentRegistration } from '../types';

// Phase 3: Agent management interface
export interface IAgentService {
  list(): Promise<AgentInfo[]>;
  getOnlineAgents(): Promise<AgentInfo[]>;
  register(registration: AgentRegistration): Promise<AgentInfo>;
  unregister(agentId: string): Promise<void>;
  getById(agentId: string): Promise<AgentInfo | null>;
}
