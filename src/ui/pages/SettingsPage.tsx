import React, { useEffect, useState } from 'react';
import { api, isElectron, isWeb } from '../api/client';
import { useTranslation } from '../i18n';
import type { Language, TranslationKey } from '../i18n';

interface AppSettings {
  defaultDownloadDir: string;
  maxConcurrentDownloads: number;
  folderTemplate: string;
  autoStartDownload: boolean;
  minimizeToTray: boolean;
  theme: string;
}

const FOLDER_TEMPLATES: { value: string; labelKey: TranslationKey }[] = [
  { value: '{account}/{year}-{month}/{topic}', labelKey: 'settings.tplAccYmTopic' },
  { value: '{account}/{year}-{month}/{date} {time} - {topic}', labelKey: 'settings.tplAccYmDtTopic' },
  { value: '{account}/{topic}/{date} {time}', labelKey: 'settings.tplAccTopicDt' },
  { value: '{account}/{topic}/{date} {time} - {topic}', labelKey: 'settings.tplAccTopicDtTopic' },
  { value: '{account}/{topic}', labelKey: 'settings.tplAccTopic' },
  { value: '{year}-{month}/{topic}', labelKey: 'settings.tplYmTopic' },
  { value: '{topic}', labelKey: 'settings.tplTopic' },
  { value: '{topic} ({date} {time})', labelKey: 'settings.tplTopicDt' },
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
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; latestVersion: string; currentVersion: string; downloadUrl: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [gdrive, setGdrive] = useState<{ authenticated: boolean; autoUpload: boolean; folderId: string; clientId: string; clientSecret: string } | null>(null);
  const [gdriveClientId, setGdriveClientId] = useState('');
  const [gdriveClientSecret, setGdriveClientSecret] = useState('');
  const [gdriveFolderId, setGdriveFolderId] = useState('');
  const [gdriveAutoUpload, setGdriveAutoUpload] = useState(false);
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    loadSettings();
    loadScheduler();
    checkForUpdate();
    loadGoogleDrive();

    const unsubs: Array<() => void> = [];
    unsubs.push(api.scheduler.onMessage((msg: string) => {
      setSchedulerLogs((prev) => [...prev.slice(-19), msg]);
    }));

    // Listen for Google Drive connected event (Desktop)
    const googleApi = (api as any).google;
    if (googleApi?.onConnected) {
      unsubs.push(googleApi.onConnected(() => { loadGoogleDrive(); }));
    }

    // Check URL params for Google Drive connection (Web)
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('google') === 'connected') {
      loadGoogleDrive();
    }

    return () => { unsubs.forEach((u) => u()); };
  }, []);

  async function checkForUpdate() {
    try {
      setCheckingUpdate(true);
      const res = await fetch('https://api.github.com/repos/tronghv77/zoom_recording_downloader/releases/latest', {
        headers: { 'User-Agent': 'ZoomDL' },
      });
      const data = await res.json();
      const latestVersion = (data.tag_name || '').replace(/^v/, '');
      const currentVersion = '1.3.1';
      const exeAsset = data.assets?.find((a: any) => a.name.includes('Setup'));
      const downloadUrl = exeAsset?.browser_download_url || data.html_url || '';

      const parse = (v: string) => v.split('.').map(Number);
      const [lM, lm = 0, lp = 0] = parse(latestVersion);
      const [cM, cm = 0, cp = 0] = parse(currentVersion);
      const hasUpdate = lM > cM || (lM === cM && lm > cm) || (lM === cM && lm === cm && lp > cp);

      setUpdateInfo({ hasUpdate, latestVersion, currentVersion, downloadUrl });
    } catch {
      setUpdateInfo(null);
    } finally {
      setCheckingUpdate(false);
    }
  }

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

  async function loadGoogleDrive() {
    try {
      const googleApi = (api as any).google;
      if (!googleApi) return;
      const [status, settings] = await Promise.all([
        googleApi.getStatus(),
        googleApi.getSettings(),
      ]);
      setGdrive({ ...status, ...settings });
      setGdriveClientId(settings.clientId || '');
      setGdriveClientSecret(settings.clientSecret || '');
      setGdriveFolderId(settings.folderId || '');
      setGdriveAutoUpload(settings.autoUpload || false);
    } catch {}
  }

  async function handleGdriveConnect() {
    const googleApi = (api as any).google;
    if (!googleApi) return;
    try {
      setGdriveConnecting(true);
      // Save credentials first
      await googleApi.saveSettings({ clientId: gdriveClientId, clientSecret: gdriveClientSecret, folderId: gdriveFolderId, autoUpload: gdriveAutoUpload, enabled: true });
      // Get auth URL and redirect
      const result = await googleApi.getAuthUrl();
      // Desktop: open in default browser; Web: open new tab
      if (isElectron && (api as any).system?.openExternal) {
        await (api as any).system.openExternal(result.url);
      } else {
        window.open(result.url, '_blank');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect Google Drive');
    } finally {
      setGdriveConnecting(false);
    }
  }

  async function handleGdriveDisconnect() {
    const googleApi = (api as any).google;
    if (!googleApi) return;
    try {
      await googleApi.disconnect();
      loadGoogleDrive();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleGdriveSave() {
    const googleApi = (api as any).google;
    if (!googleApi) return;
    try {
      await googleApi.saveSettings({ clientId: gdriveClientId, clientSecret: gdriveClientSecret, folderId: gdriveFolderId, autoUpload: gdriveAutoUpload });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      loadGoogleDrive();
    } catch (err: any) {
      setError(err.message);
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

  if (loading || !settings) return <div className="page"><div className="empty-state">{t('settings.loading')}</div></div>;

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
        <h3>{t('settings.sectionDownload')}</h3>

        <div className="form-group">
          <label>{t('settings.downloadDir')}</label>
          <div className="input-with-button">
            <input
              value={settings.defaultDownloadDir}
              onChange={(e) => setSettings({ ...settings, defaultDownloadDir: e.target.value })}
              placeholder={t('settings.downloadDirPlaceholder')}
            />
            <button className="btn" onClick={handleSelectDir}>{t('settings.browse')}</button>
          </div>
          <small>
            {isElectron ? t('settings.downloadDirHint') : t('settings.downloadDirHintServer')}
          </small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('settings.maxConcurrent')}</label>
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
            <label>{t('settings.autoStart')}</label>
            <select
              value={settings.autoStartDownload ? 'true' : 'false'}
              onChange={(e) => setSettings({ ...settings, autoStartDownload: e.target.value === 'true' })}
            >
              <option value="true">{t('settings.autoStartYes')}</option>
              <option value="false">{t('settings.autoStartNo')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t('settings.sectionFileOrg')}</h3>

        <div className="form-group">
          <label>{t('settings.folderTemplate')}</label>
          <select
            value={settings.folderTemplate}
            onChange={(e) => setSettings({ ...settings, folderTemplate: e.target.value })}
          >
            {FOLDER_TEMPLATES.map((tpl) => (
              <option key={tpl.value} value={tpl.value}>{t(tpl.labelKey)}</option>
            ))}
          </select>
          <small>
            {t('settings.preview')}: <code className="template-preview">{previewTemplate(settings.folderTemplate)}</code>
          </small>
        </div>

        <div className="template-vars">
          <h4>{t('settings.availableVars')}</h4>
          <div className="var-list">
            <span className="var-tag">{'{account}'}</span> {t('settings.varAccount')}
            <span className="var-tag">{'{topic}'}</span> {t('settings.varTopic')}
            <span className="var-tag">{'{year}'}</span> {t('settings.varYear')}
            <span className="var-tag">{'{month}'}</span> {t('settings.varMonth')}
            <span className="var-tag">{'{date}'}</span> {t('settings.varDate')}
            <span className="var-tag">{'{time}'}</span> {t('settings.varTime')}
          </div>
        </div>
      </div>

      {scheduler && (
        <div className="settings-section">
          <div className="section-header">
            <h3>{t('settings.sectionScheduler')}</h3>
            {schedulerStatus && (
              <span className={`status-badge ${schedulerStatus.isRunning ? 'status-active' : 'status-queued'}`}>
                {schedulerStatus.isRunning ? t('settings.running') : t('settings.stopped')}
              </span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('settings.autoSync')}</label>
              <select
                value={scheduler.enabled ? 'true' : 'false'}
                onChange={(e) => setScheduler({ ...scheduler, enabled: e.target.value === 'true' })}
              >
                <option value="false">{t('settings.disabled')}</option>
                <option value="true">{t('settings.enabledOpt')}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('settings.syncInterval')}</label>
              <select
                value={scheduler.intervalMinutes}
                onChange={(e) => setScheduler({ ...scheduler, intervalMinutes: Number(e.target.value) })}
              >
                <option value={15}>{t('settings.every15')}</option>
                <option value={30}>{t('settings.every30')}</option>
                <option value={60}>{t('settings.every1h')}</option>
                <option value={120}>{t('settings.every2h')}</option>
                <option value={360}>{t('settings.every6h')}</option>
                <option value={720}>{t('settings.every12h')}</option>
                <option value={1440}>{t('settings.every24h')}</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>{t('settings.autoDownloadAfter')}</label>
            <select
              value={scheduler.autoDownload ? 'true' : 'false'}
              onChange={(e) => setScheduler({ ...scheduler, autoDownload: e.target.value === 'true' })}
            >
              <option value="false">{t('settings.autoDlNo')}</option>
              <option value="true">{t('settings.autoDlYes')}</option>
            </select>
            <small>{t('settings.autoDlHint')}</small>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSaveScheduler}>
              {t('settings.saveScheduler')}
            </button>
            <button className="btn" onClick={handleRunNow} disabled={runningNow}>
              {runningNow ? t('settings.runningNow') : t('settings.runNow')}
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
        <h3>{t('settings.sectionAppearance')}</h3>

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
            <option value="false">{t('settings.no')}</option>
            <option value="true">{t('settings.yes')}</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
          <div className="section-header">
            <h3>Google Drive</h3>
            {gdrive?.authenticated ? (
              <span className="status-badge status-completed">✅ {t('settings.gdConnected')}</span>
            ) : (
              <span className="status-badge status-queued">{t('settings.gdNotConnected')}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('settings.gdClientId')}</label>
              <input value={gdriveClientId} onChange={(e) => setGdriveClientId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" />
            </div>
            <div className="form-group">
              <label>{t('settings.gdClientSecret')}</label>
              <input type="password" value={gdriveClientSecret} onChange={(e) => setGdriveClientSecret(e.target.value)} placeholder="GOCSPX-xxxxxxxx" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('settings.gdFolderId')}</label>
              <input value={gdriveFolderId} onChange={(e) => setGdriveFolderId(e.target.value)} placeholder={t('settings.gdFolderIdHint')} />
              <small>{t('settings.gdFolderIdDesc')}</small>
            </div>
            <div className="form-group">
              <label>{t('settings.gdAutoUpload')}</label>
              <select value={gdriveAutoUpload ? 'true' : 'false'} onChange={(e) => setGdriveAutoUpload(e.target.value === 'true')}>
                <option value="false">{t('settings.gdAutoOff')}</option>
                <option value="true">{t('settings.gdAutoOn')}</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleGdriveSave}>{t('settings.save')}</button>
            {!gdrive?.authenticated ? (
              <button className="btn btn-primary" onClick={handleGdriveConnect} disabled={gdriveConnecting || !gdriveClientId || !gdriveClientSecret}>
                {gdriveConnecting ? '...' : t('settings.gdConnect')}
              </button>
            ) : (
              <button className="btn btn-danger" onClick={handleGdriveDisconnect}>{t('settings.gdDisconnect')}</button>
            )}
          </div>
        </div>

      <div className="settings-section">
        <div className="section-header">
          <h3>{t('settings.update')}</h3>
          <button className="btn btn-sm" onClick={checkForUpdate} disabled={checkingUpdate}>
            {checkingUpdate ? t('settings.checking') : t('settings.checkUpdate')}
          </button>
        </div>

        {updateInfo && (
          <div className={`update-status ${updateInfo.hasUpdate ? 'update-available' : 'update-current'}`}>
            <div className="update-version-row">
              <span>{t('settings.currentVersion')}: <strong>v{updateInfo.currentVersion}</strong></span>
              <span>{t('settings.latestVersion')}: <strong>v{updateInfo.latestVersion}</strong></span>
            </div>
            {updateInfo.hasUpdate ? (
              <div className="update-action">
                <span className="update-badge update-new">✨ {t('settings.updateAvailable')}: v{updateInfo.latestVersion}</span>
                {updateInfo.downloadUrl && (
                  <a href={updateInfo.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
                    {t('settings.downloadUpdate')}
                  </a>
                )}
              </div>
            ) : (
              <div className="update-action">
                <span className="update-badge update-ok">✅ {t('settings.upToDate')}</span>
              </div>
            )}
          </div>
        )}

        {!updateInfo && !checkingUpdate && (
          <div className="stat-sub">{t('settings.updateError')}</div>
        )}
      </div>

      <div className="settings-section about-section">
        <h3>{t('about.title')}</h3>

        <div className="about-app">
          <div className="about-app-name">Zoom Recording Downloader</div>
          <div className="about-app-version">v1.3.1</div>
          <p className="about-app-desc">{t('about.description')}</p>
        </div>

        <div className="about-developer">
          <h4>{t('about.developer')}</h4>
          <div className="about-info-grid">
            <div className="about-info-item">
              <span className="about-label">{t('about.author')}</span>
              <span className="about-value">Hồ Văn Trọng</span>
            </div>
            <div className="about-info-item">
              <span className="about-label">{t('about.email')}</span>
              <a href="mailto:tronghv77@gmail.com" className="about-value about-link">tronghv77@gmail.com</a>
            </div>
            <div className="about-info-item">
              <span className="about-label">{t('about.phone')}</span>
              <a href="tel:0936099625" className="about-value about-link">0936 099 625</a>
            </div>
          </div>
        </div>

        <div className="about-links">
          <h4>{t('about.source')}</h4>
          <a href="https://github.com/tronghv77/zoom_recording_downloader" target="_blank" rel="noopener noreferrer" className="about-github-link">
            GitHub — tronghv77/zoom_recording_downloader
          </a>
        </div>

        <div className="about-share">
          <h4>{t('about.share')}</h4>
          <p className="about-share-desc">{t('about.shareDesc')}</p>
          <div className="about-share-actions">
            <button className="btn btn-primary" onClick={handleShareCopy}>
              {shareCopied ? `✅ ${t('about.copied')}` : `📋 ${t('about.copyLink')}`}
            </button>
            <button className="btn" onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(RELEASE_URL)}`)}>
              📘 {t('about.shareFb')}
            </button>
            <button className="btn" onClick={() => openShare(RELEASE_URL)}>
              ⬇️ {t('about.downloadLatest')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function openShare(url: string) {
    if (isElectron && (api as any).system?.openExternal) {
      (api as any).system.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  async function handleShareCopy() {
    const text = `Zoom Recording Downloader — quản lý & tải bản ghi Zoom Cloud cho nhiều tài khoản, nhiều thiết bị. Tải về: ${RELEASE_URL}`;
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch {
      openShare(RELEASE_URL);
    }
  }
}

const RELEASE_URL = 'https://github.com/tronghv77/zoom_recording_downloader/releases/latest';

function previewTemplate(template: string): string {
  return template
    .replace(/\{account\}/g, 'FEMI')
    .replace(/\{topic\}/g, 'Workshop AI')
    .replace(/\{year\}/g, '2026')
    .replace(/\{month\}/g, '03')
    .replace(/\{date\}/g, '2026-03-17')
    .replace(/\{time\}/g, '14-30');
}
