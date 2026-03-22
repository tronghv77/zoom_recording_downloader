import React, { useEffect, useState } from 'react';
import { api, isElectron } from '../api/client';
import { useTranslation } from '../i18n';
import type { Language } from '../i18n';

interface AppSettings {
  defaultDownloadDir: string;
  maxConcurrentDownloads: number;
  folderTemplate: string;
  autoStartDownload: boolean;
  minimizeToTray: boolean;
  theme: string;
}

const FOLDER_TEMPLATES = [
  { value: '{account}/{year}-{month}/{topic}', label: 'Account / Year-Month / Topic' },
  { value: '{account}/{year}-{month}/{date} {time} - {topic}', label: 'Account / Year-Month / Date Time - Topic' },
  { value: '{account}/{topic}/{date} {time}', label: 'Account / Topic / Date Time' },
  { value: '{year}-{month}/{topic}', label: 'Year-Month / Topic' },
  { value: '{topic}', label: 'Topic only' },
  { value: '{topic} ({date} {time})', label: 'Topic (Date Time)' },
];

export function SettingsPage() {
  const { t, lang, setLang } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduler, setScheduler] = useState<any>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [schedulerLogs, setSchedulerLogs] = useState<string[]>([]);

  useEffect(() => {
    loadSettings();
    loadScheduler();

    const unsub = api.scheduler.onMessage((msg: string) => {
      setSchedulerLogs((prev) => [...prev.slice(-19), msg]);
    });
    return () => { unsub(); };
  }, []);

  async function loadScheduler() {
    try {
      const [config, status] = await Promise.all([
        api.scheduler.getConfig(),
        api.scheduler.status(),
      ]);
      setScheduler(config);
      setSchedulerStatus(status);
    } catch {}
  }

  async function handleSaveScheduler() {
    if (!scheduler) return;
    try {
      await api.scheduler.saveConfig(scheduler);
      loadScheduler();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRunNow() {
    try {
      setRunningNow(true);
      const logs = await api.scheduler.runNow();
      setSchedulerLogs(logs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunningNow(false);
      loadScheduler();
    }
  }

  async function loadSettings() {
    try {
      const data = await api.settings.getAll();
      setSettings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      setSaved(false);
      const updated = await api.settings.save(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectDir() {
    const dir = await api.system.selectDirectory();
    if (dir && settings) {
      setSettings({ ...settings, defaultDownloadDir: dir });
    }
  }

  if (loading || !settings) return <div className="page"><div className="empty-state">Loading settings...</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('settings.title')}</h2>
        <div className="header-actions">
          {saved && <span className="save-success">{t('settings.saved')}</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="settings-section">
        <h3>Download</h3>

        <div className="form-group">
          <label>Default Download Directory</label>
          <div className="input-with-button">
            <input
              value={settings.defaultDownloadDir}
              onChange={(e) => setSettings({ ...settings, defaultDownloadDir: e.target.value })}
              placeholder="No default directory set — will ask each time"
            />
            <button className="btn" onClick={handleSelectDir}>Browse</button>
          </div>
          <small>
            {isElectron
              ? 'Leave empty to choose directory each time you download'
              : 'Enter absolute path on server (e.g. D:\\ZoomRecordings)'}
          </small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Max Concurrent Downloads</label>
            <select
              value={settings.maxConcurrentDownloads}
              onChange={(e) => setSettings({ ...settings, maxConcurrentDownloads: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Auto-start Downloads</label>
            <select
              value={settings.autoStartDownload ? 'true' : 'false'}
              onChange={(e) => setSettings({ ...settings, autoStartDownload: e.target.value === 'true' })}
            >
              <option value="true">Yes — start downloading immediately</option>
              <option value="false">No — add to queue only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>File Organization</h3>

        <div className="form-group">
          <label>Folder Structure Template</label>
          <select
            value={settings.folderTemplate}
            onChange={(e) => setSettings({ ...settings, folderTemplate: e.target.value })}
          >
            {FOLDER_TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <small>
            Preview: <code className="template-preview">{previewTemplate(settings.folderTemplate)}</code>
          </small>
        </div>

        <div className="template-vars">
          <h4>Available variables:</h4>
          <div className="var-list">
            <span className="var-tag">{'{account}'}</span> Account name
            <span className="var-tag">{'{topic}'}</span> Meeting topic
            <span className="var-tag">{'{year}'}</span> Year (2026)
            <span className="var-tag">{'{month}'}</span> Month (03)
            <span className="var-tag">{'{date}'}</span> Full date (2026-03-17)
            <span className="var-tag">{'{time}'}</span> Time (14-30)
          </div>
        </div>
      </div>

      {scheduler && (
        <div className="settings-section">
          <div className="section-header">
            <h3>Scheduler</h3>
            {schedulerStatus && (
              <span className={`status-badge ${schedulerStatus.isRunning ? 'status-active' : 'status-queued'}`}>
                {schedulerStatus.isRunning ? 'Running' : 'Stopped'}
              </span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Auto Sync</label>
              <select
                value={scheduler.enabled ? 'true' : 'false'}
                onChange={(e) => setScheduler({ ...scheduler, enabled: e.target.value === 'true' })}
              >
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </div>
            <div className="form-group">
              <label>Sync Interval</label>
              <select
                value={scheduler.intervalMinutes}
                onChange={(e) => setScheduler({ ...scheduler, intervalMinutes: Number(e.target.value) })}
              >
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every 1 hour</option>
                <option value={120}>Every 2 hours</option>
                <option value={360}>Every 6 hours</option>
                <option value={720}>Every 12 hours</option>
                <option value={1440}>Every 24 hours</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Auto Download after Sync</label>
            <select
              value={scheduler.autoDownload ? 'true' : 'false'}
              onChange={(e) => setScheduler({ ...scheduler, autoDownload: e.target.value === 'true' })}
            >
              <option value="false">No — sync only</option>
              <option value="true">Yes — sync & download new recordings</option>
            </select>
            <small>Requires default download directory to be set</small>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSaveScheduler}>
              Save Scheduler
            </button>
            <button className="btn" onClick={handleRunNow} disabled={runningNow}>
              {runningNow ? 'Running...' : 'Run Now'}
            </button>
          </div>

          {schedulerLogs.length > 0 && (
            <div className="sync-logs" style={{ marginTop: 12 }}>
              {schedulerLogs.map((log, i) => (
                <div key={i} className="sync-log-line">{log}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="settings-section">
        <h3>{t('settings.title')}</h3>

        <div className="form-row">
          <div className="form-group">
            <label>{t('settings.theme')}</label>
            <select
              value={settings.theme || 'dark'}
              onChange={(e) => {
                const theme = e.target.value;
                setSettings({ ...settings, theme });
                document.documentElement.setAttribute('data-theme', theme);
              }}
            >
              <option value="dark">{t('settings.dark')}</option>
              <option value="light">{t('settings.light')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('settings.language')}</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>{t('settings.minimizeToTray')}</label>
          <select
            value={settings.minimizeToTray ? 'true' : 'false'}
            onChange={(e) => setSettings({ ...settings, minimizeToTray: e.target.value === 'true' })}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function previewTemplate(template: string): string {
  return template
    .replace('{account}', 'FEMI')
    .replace('{topic}', 'Workshop AI')
    .replace('{year}', '2026')
    .replace('{month}', '03')
    .replace('{date}', '2026-03-17')
    .replace('{time}', '14-30');
}
