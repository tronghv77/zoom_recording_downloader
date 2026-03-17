export interface ScheduleRule {
  id: string;
  accountId: string;
  cronExpression: string; // e.g., "0 2 * * *" (daily at 2 AM)
  enabled: boolean;
  autoDownload: boolean;
  downloadOptions?: {
    destinationDir: string;
    agentId?: string;
    autoDeleteFromCloud?: boolean;
  };
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface ISchedulerService {
  list(): Promise<ScheduleRule[]>;
  create(rule: Omit<ScheduleRule, 'id' | 'lastRunAt' | 'nextRunAt'>): Promise<ScheduleRule>;
  update(id: string, rule: Partial<ScheduleRule>): Promise<ScheduleRule>;
  delete(id: string): Promise<void>;
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  runNow(id: string): Promise<void>;
}
