import React, { useEffect, useState } from 'react';
import { api, isWeb } from '../api/client';
import { useTranslation } from '../i18n';
import type { ZoomAccount, DownloadTask } from '../../shared/types';

export function DashboardPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<ZoomAccount[]>([]);
  const [downloadQueue, setDownloadQueue] = useState<DownloadTask[]>([]);
  const [recordingCount, setRecordingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [accs, queue, recordings, schStatus] = await Promise.all([
          api.account.list(),
          api.download.getQueue(),
          api.recording.list({ pageSize: 1 }),
          api.scheduler.status().catch(() => null),
        ]);
        setAccounts(accs);
        setDownloadQueue(queue);
        setRecordingCount(recordings.totalCount);
        setSchedulerStatus(schStatus);
      } catch {}
      setLoading(false);
    }
    load();

    const unsubs: Array<() => void> = [];
    unsubs.push(api.download.onProgress(() => {
      api.download.getQueue().then(setDownloadQueue);
    }));

    // Load agents in web mode
    if (isWeb && (api as any).agents) {
      (api as any).agents.list().then(setAgents).catch(() => {});
      unsubs.push((api as any).agents.onAgentUpdate((list: any[]) => setAgents(list)));
    }

    return () => { unsubs.forEach((u) => u()); };
  }, []);

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const activeDownloads = downloadQueue.filter((t) => t.status === 'downloading');
  const completedDownloads = downloadQueue.filter((t) => t.status === 'completed');
  const failedDownloads = downloadQueue.filter((t) => t.status === 'failed');
  const totalDownloadedBytes = completedDownloads.reduce((s, t) => s + t.fileSize, 0);

  if (loading) return <div className="page"><div className="empty-state">{t('common.loading')}</div></div>;

  return (
    <div className="page">
      <h2>{t('dashboard.title')}</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{accounts.length}</div>
          <div className="stat-label">{t('dashboard.zoomAccounts')}</div>
          <div className="stat-sub">{activeAccounts.length} {t('dashboard.active')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{recordingCount}</div>
          <div className="stat-label">{t('dashboard.recordings')}</div>
          <div className="stat-sub">{t('dashboard.syncedFromCloud')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{activeDownloads.length}</div>
          <div className="stat-label">{t('dashboard.activeDownloads')}</div>
          <div className="stat-sub">{downloadQueue.filter((t) => t.status === 'queued').length} {t('dashboard.queued')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedDownloads.length}</div>
          <div className="stat-label">{t('dashboard.completed')}</div>
          <div className="stat-sub">{formatSize(totalDownloadedBytes)} {t('dashboard.total')}</div>
        </div>
      </div>

      {failedDownloads.length > 0 && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {failedDownloads.length} {t('dashboard.failedDownloads')}
        </div>
      )}

      {schedulerStatus && (
        <div className="stat-card" style={{ marginBottom: 16 }}>
          <div className="section-header">
            <span className="stat-label" style={{ marginTop: 0 }}>{t('dashboard.scheduler')}</span>
            <span className={`status-badge ${schedulerStatus.isRunning ? 'status-active' : 'status-queued'}`}>
              {schedulerStatus.isRunning ? t('dashboard.running') : t('dashboard.stopped')}
            </span>
          </div>
          <div className="stat-sub" style={{ marginTop: 8 }}>
            {schedulerStatus.isRunning ? t('dashboard.schedulerRunning') : t('dashboard.schedulerStopped')}
          </div>
        </div>
      )}

      {isWeb && (
        <div className="settings-section" style={{ marginBottom: 16 }}>
          <div className="section-header">
            <h3>{t('dashboard.connectedDevices')}</h3>
            <span className="stat-sub">{agents.length} {t('dashboard.agents')}</span>
          </div>
          {agents.length === 0 ? (
            <div className="empty-state" style={{ padding: '12px 0' }}>
              {t('dashboard.noAgents')}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('dashboard.device')}</th>
                  <th>{t('dashboard.status')}</th>
                  <th>{t('dashboard.downloads')}</th>
                  <th>{t('dashboard.connected')}</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a: any) => (
                  <tr key={a.id}>
                    <td><strong>{a.deviceName}</strong></td>
                    <td>
                      <span className={`status-badge status-${a.status === 'online' ? 'active' : a.status === 'busy' ? 'downloading' : 'failed'}`}>
                        {a.status === 'online' ? `🟢 ${t('dashboard.online')}` : a.status === 'busy' ? `🟡 ${t('dashboard.busy')}` : `⚫ ${t('dashboard.offline')}`}
                      </span>
                    </td>
                    <td>{a.currentDownloads || 0} {t('dashboard.active')}</td>
                    <td>{a.connectedAt ? new Date(a.connectedAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {accounts.length === 0 && (
        <div className="empty-state">
          {t('dashboard.noAccounts')}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="settings-section">
          <h3>{t('dashboard.accountsOverview')}</h3>
          <table>
            <thead>
              <tr>
                <th>{t('dashboard.account')}</th>
                <th>{t('dashboard.email')}</th>
                <th>{t('dashboard.status')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id}>
                  <td>{acc.name}</td>
                  <td className="text-mono">{acc.email}</td>
                  <td><span className={`status-badge status-${acc.status}`}>{acc.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
