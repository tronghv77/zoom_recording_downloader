import React, { useEffect, useState, useRef } from 'react';
import { api, isWeb } from '../api/client';
import { useTranslation } from '../i18n';
import type { Recording, RecordingFile, ZoomAccount, DownloadTask, RenameRule } from '../../shared/types';

// Effective display name: local custom name overrides the original Zoom topic.
function effectiveName(rec: { customName?: string; meetingTopic: string }): string {
  return (rec.customName && rec.customName.trim()) ? rec.customName : rec.meetingTopic;
}

export function RecordingsPage() {
  const { t } = useTranslation();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [accounts, setAccounts] = useState<ZoomAccount[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncAccountId, setSyncAccountId] = useState('');
  const [downloadPickerId, setDownloadPickerId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [scheduler, setScheduler] = useState<any>(null);
  const [schedulerBusy, setSchedulerBusy] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('server');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedRecordings, setSelectedRecordings] = useState<Set<string>>(new Set());
  const [downloadSummary, setDownloadSummary] = useState<Record<string, any>>({});

  // Merged Downloads state
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  // On-disk verification: recordingId → { total, completed, present }
  const [verifyMap, setVerifyMap] = useState<Record<string, { total: number; completed: number; present: number }>>({});
  const [verifying, setVerifying] = useState(false);

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<Recording | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // Delete-scope dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Rules modal
  const [rulesOpen, setRulesOpen] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);

  const [filter, setFilter] = useState({
    accountId: '',
    search: '',
    from: getDefaultFromDate(),
    to: getTodayDate(),
  });

  useEffect(() => {
    api.account.list().then(setAccounts).catch(() => {});
    loadRecordings();
    loadScheduler();
    loadDownloadTasks();

    const unsubs: Array<() => void> = [];
    unsubs.push(api.scheduler.onMessage(() => { loadScheduler(); }));

    // Live download progress → update inline task state
    unsubs.push(api.download.onProgress((progress: any) => {
      setDownloadTasks((prev) =>
        prev.map((task) =>
          task.id === progress.taskId
            ? { ...task, progress: progress.progress, bytesDownloaded: progress.bytesDownloaded, speed: progress.speed, status: progress.status }
            : task,
        ),
      );
      if (progress.status !== 'downloading') {
        setTimeout(() => { loadDownloadTasks(); refreshDownloadSummary(); }, 300);
      }
    }));

    // Google Drive status
    const googleApi = (api as any).google;
    if (googleApi?.getStatus) {
      googleApi.getStatus().then((s: any) => setGdriveConnected(s.authenticated)).catch(() => {});
    }

    refreshDownloadSummary();

    // Load agents in web mode
    if (isWeb && (api as any).agents) {
      (api as any).agents.list().then(setAgents).catch(() => {});
      unsubs.push((api as any).agents.onAgentUpdate((list: any[]) => setAgents(list)));
    }

    return () => { unsubs.forEach((u) => u()); };
  }, []);

  async function loadDownloadTasks() {
    try {
      const queue = await api.download.getQueue();
      setDownloadTasks(queue);
    } catch {}
  }

  async function loadScheduler() {
    try {
      const [config, status] = await Promise.all([
        api.scheduler.getConfig(),
        api.scheduler.status(),
      ]);
      setScheduler({ ...config, ...status });
    } catch {}
  }

  async function toggleAutoSync() {
    if (!scheduler) return;
    await api.scheduler.saveConfig({ ...scheduler, enabled: !scheduler.enabled });
    loadScheduler();
  }

  async function toggleAutoDownload() {
    if (!scheduler) return;
    await api.scheduler.saveConfig({ ...scheduler, autoDownload: !scheduler.autoDownload });
    loadScheduler();
  }

  async function changeInterval(minutes: number) {
    if (!scheduler) return;
    await api.scheduler.saveConfig({ ...scheduler, intervalMinutes: minutes });
    loadScheduler();
  }

  async function handleRunSchedulerNow() {
    try {
      setSchedulerBusy(true);
      const logs = await api.scheduler.runNow();
      setSyncLogs(logs);
      setSyncResult('Scheduler completed');
      loadRecordings(1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSchedulerBusy(false);
      loadScheduler();
    }
  }

  // Fetch ALL recordings for the current filter, then group + paginate by group
  // on the client. Grouping per-page would split one class across pages.
  async function loadRecordings(_p = 1, filterOverride?: Partial<typeof filter>) {
    const f = { ...filter, ...filterOverride };
    try {
      setLoading(true);
      setError(null);
      const result = await api.recording.list({
        accountId: f.accountId || undefined,
        search: f.search || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
        page: 1,
        pageSize: 5000,
      });
      setRecordings(result.recordings);
      setTotalCount(result.totalCount);
      setPage(1);
    } catch (err: any) {
      setError(err.message || 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncAll() {
    try {
      setSyncing(true);
      setError(null);
      setSyncResult(null);
      setSyncLogs([]);
      const results = await api.recording.syncAll(filter.from, filter.to);
      const totalNew = results.reduce((sum: number, r: any) => sum + r.newCount, 0);
      const allLogs = results.flatMap((r: any) => r.logs);
      setSyncResult(`Synced ${totalNew} new recording(s) from ${results.length} account(s)`);
      setSyncLogs(allLogs);
      loadRecordings(1);
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncAccount(accountId: string) {
    try {
      setSyncing(true);
      setError(null);
      setSyncResult(null);
      setSyncLogs([]);
      const result = await api.recording.sync(accountId, filter.from, filter.to);
      setSyncResult(`Synced ${result.newCount} new recording(s) from "${result.accountName}" (API returned ${result.totalFromApi})`);
      setSyncLogs(result.logs);
      setFilter((prev) => ({ ...prev, accountId }));
      loadRecordings(1, { accountId });
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function getDownloadDir(): Promise<string | null> {
    const settings = await api.settings.getAll();
    if (settings.defaultDownloadDir) return settings.defaultDownloadDir;
    return await api.system.selectDirectory();
  }

  function openDownloadPicker(recording: Recording) {
    setDownloadPickerId(recording.id);
    setSelectedFileIds(new Set(recording.recordingFiles.map((f) => f.id)));
    setExpandedId(recording.id);
  }

  function toggleFileSelection(fileId: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function selectAllFiles(recording: Recording) {
    setSelectedFileIds(new Set(recording.recordingFiles.map((f) => f.id)));
  }

  function selectNoneFiles() {
    setSelectedFileIds(new Set());
  }

  async function handleDownloadSelected(recording: Recording) {
    const fileIds = recording.recordingFiles.filter((f) => selectedFileIds.has(f.id)).map((f) => f.id);
    if (fileIds.length === 0) return;
    try {
      if (selectedAgent !== 'server' && isWeb && (api as any).agents) {
        const result = await (api as any).agents.downloadToAgent(selectedAgent, fileIds);
        const agentName = agents.find((a) => a.id === selectedAgent)?.deviceName || selectedAgent;
        setSyncResult(`Sent ${result.sent} file(s) to "${agentName}"`);
      } else {
        const dir = await getDownloadDir();
        if (!dir) return;
        await api.download.enqueue(fileIds, { destinationDir: dir });
        setSyncResult(`Added ${fileIds.length} file(s) to download queue`);
      }
      setDownloadPickerId(null);
      loadDownloadTasks();
      refreshDownloadSummary();
    } catch (err: any) {
      setError(err.message || 'Failed to enqueue download');
    }
  }

  function refreshDownloadSummary() {
    if ((api as any).download?.getSummary) {
      (api as any).download.getSummary().then(setDownloadSummary).catch(() => {});
    }
  }

  // #3 — Verify which recordings actually have their files on this machine's disk
  async function handleVerify() {
    try {
      setVerifying(true);
      const map = await (api as any).download.verify();
      setVerifyMap(map || {});
      let full = 0, partial = 0, missing = 0;
      for (const v of Object.values(map || {}) as Array<{ total: number; completed: number; present: number }>) {
        if (v.present > 0 && v.present >= v.total) full++;
        else if (v.present > 0) partial++;
        else missing++;
      }
      setSyncResult(t('recordings.checkDone', { full, partial, missing }));
    } catch (err: any) {
      setError(err.message || 'Verify failed');
    } finally {
      setVerifying(false);
    }
  }

  // #2 — Resume/continue an unfinished download for one recording
  async function handleResume(rec: Recording, recTasks: DownloadTask[]) {
    try {
      for (const task of recTasks) {
        if (task.status === 'paused') await api.download.resume(task.id);
        else if (task.status === 'failed' || task.status === 'cancelled') await api.download.retry(task.id);
      }
      // Enqueue any files that never got a task (e.g. partial earlier selection)
      const tasked = new Set(recTasks.map((t) => t.recordingFileId));
      const missing = rec.recordingFiles.filter((f) => !tasked.has(f.id)).map((f) => f.id);
      if (missing.length > 0) {
        const dir = await getDownloadDir();
        if (dir) await api.download.enqueue(missing, { destinationDir: dir });
      }
      setTimeout(() => { loadDownloadTasks(); refreshDownloadSummary(); }, 300);
    } catch (err: any) {
      setError(err.message || 'Resume failed');
    }
  }

  async function handleDownloadFile(file: RecordingFile) {
    try {
      const dir = await getDownloadDir();
      if (!dir) return;
      await api.download.enqueue([file.id], { destinationDir: dir });
      setSyncResult(`Added 1 file to download queue`);
      loadDownloadTasks();
      refreshDownloadSummary();
    } catch (err: any) {
      setError(err.message || 'Failed to enqueue download');
    }
  }

  function toggleBatchRecording(recId: string) {
    setSelectedRecordings((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) next.delete(recId);
      else next.add(recId);
      return next;
    });
  }

  function selectAllRecordings() {
    setSelectedRecordings(new Set(recordings.map((r) => r.id)));
  }

  function selectNoneRecordings() {
    setSelectedRecordings(new Set());
  }

  async function handleBatchDownload() {
    const selectedRecs = recordings.filter((r) => selectedRecordings.has(r.id));
    const allFileIds = selectedRecs.flatMap((r) => r.recordingFiles.map((f) => f.id));
    if (allFileIds.length === 0) return;
    try {
      if (selectedAgent !== 'server' && isWeb && (api as any).agents) {
        const result = await (api as any).agents.downloadToAgent(selectedAgent, allFileIds);
        const agentName = agents.find((a) => a.id === selectedAgent)?.deviceName || selectedAgent;
        setSyncResult(`Sent ${result.sent} file(s) from ${selectedRecs.length} recording(s) to "${agentName}"`);
      } else {
        const dir = await getDownloadDir();
        if (!dir) return;
        await api.download.enqueue(allFileIds, { destinationDir: dir });
        setSyncResult(`Added ${allFileIds.length} file(s) from ${selectedRecs.length} recording(s) to queue`);
      }
      setBatchMode(false);
      setSelectedRecordings(new Set());
      loadDownloadTasks();
      refreshDownloadSummary();
    } catch (err: any) {
      setError(err.message || 'Failed to batch download');
    }
  }

  // === Multi-delete ===
  async function handleDeleteLocal() {
    const ids = [...selectedRecordings];
    if (ids.length === 0) return;
    if (!confirm(t('delete.confirmLocal', { n: ids.length }))) return;
    try {
      setDeleting(true);
      await api.recording.deleteLocalMany(ids);
      setSyncResult(t('delete.doneLocal', { n: ids.length }));
      closeDeleteDialog();
      loadRecordings(1);
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteCloudMany() {
    const ids = [...selectedRecordings];
    if (ids.length === 0) return;
    if (!confirm(t('delete.confirmCloud', { n: ids.length }))) return;
    try {
      setDeleting(true);
      const res = await api.recording.deleteCloudMany(ids);
      setSyncResult(t('delete.doneCloud', { ok: res.ok.length, failed: res.failed.length }));
      closeDeleteDialog();
      loadRecordings(1);
    } catch (err: any) {
      setError(err.message || 'Failed to delete from cloud');
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteDialog() {
    setDeleteDialogOpen(false);
    setBatchMode(false);
    setSelectedRecordings(new Set());
  }

  // === Rename ===
  function openRename(rec: Recording) {
    setRenameTarget(rec);
    setRenameValue(rec.customName || '');
  }

  async function handleRenameSave() {
    if (!renameTarget) return;
    try {
      setRenameSaving(true);
      const value = renameValue.trim();
      if (value) {
        await api.recording.rename(renameTarget.id, value, false);
      } else {
        await api.recording.clearCustomName(renameTarget.id);
      }
      setRenameTarget(null);
      loadRecordings();
    } catch (err: any) {
      setError(err.message || 'Failed to rename');
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleRenameReset() {
    if (!renameTarget) return;
    try {
      setRenameSaving(true);
      await api.recording.clearCustomName(renameTarget.id);
      setRenameTarget(null);
      loadRecordings();
    } catch (err: any) {
      setError(err.message || 'Failed to reset');
    } finally {
      setRenameSaving(false);
    }
  }

  // === Rules ===
  async function handleApplyRules() {
    try {
      setApplyingRules(true);
      const n = await (api as any).renameRules.apply();
      setSyncResult(t('rules.applied', { n }));
      loadRecordings();
    } catch (err: any) {
      setError(err.message || 'Failed to apply rules');
    } finally {
      setApplyingRules(false);
    }
  }

  // === Inline download controls ===
  async function handleUploadFile(taskId: string) {
    const googleApi = (api as any).google;
    if (!googleApi) return;
    try {
      setUploading((prev) => new Set(prev).add(taskId));
      await googleApi.upload(taskId);
      loadDownloadTasks();
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
    }
  }

  async function handleOpenFolder(folderPath: string) {
    try {
      if (!isWeb && (api as any).system?.openFolder) {
        await (api as any).system.openFolder(folderPath);
      } else {
        await navigator.clipboard.writeText(folderPath);
        setSyncResult(`📋 ${t('recordings.pathCopied')}: ${folderPath}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to open folder');
    }
  }

  function getAccountName(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.name || 'Unknown';
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  function handleFilter() {
    loadRecordings(1);
  }

  // Tasks for a given recording (for inline merged Downloads view)
  function tasksFor(recordingId: string): DownloadTask[] {
    return downloadTasks.filter((task) => task.recordingId === recordingId);
  }

  const GROUPS_PER_PAGE = 15;
  const allGroups = groupRecordings(recordings);
  const totalPages = Math.max(1, Math.ceil(allGroups.length / GROUPS_PER_PAGE));
  const pageGroups = allGroups.slice((page - 1) * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE);

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('recordings.title')}</h2>
        <div className="header-actions">
          <select
            className="sync-account-select"
            value={syncAccountId}
            onChange={(e) => setSyncAccountId(e.target.value)}
          >
            <option value="">{t('recordings.allAccounts')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => syncAccountId ? handleSyncAccount(syncAccountId) : handleSyncAll()}
            disabled={syncing}
          >
            {syncing ? t('recordings.syncing') : syncAccountId ? t('recordings.syncAccount') : t('recordings.syncAll')}
          </button>
          <button className="btn" onClick={() => setRulesOpen(true)}>
            ⚙ {t('rules.manage')}
          </button>
          <button className="btn" onClick={handleVerify} disabled={verifying}>
            🔍 {verifying ? t('recordings.checking') : t('recordings.checkDownloaded')}
          </button>
          {recordings.length > 0 && (
            <button className="btn btn-danger" onClick={handleClearList}>
              {t('recordings.clear')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {syncResult && (
        <div className="sync-result">
          <div className="alert alert-success">
            {syncResult}
            <button className="alert-close" onClick={() => { setSyncResult(null); setSyncLogs([]); }}>×</button>
          </div>
          {syncLogs.length > 0 && (
            <div className="sync-logs">
              {syncLogs.map((log, i) => (
                <div key={i} className="sync-log-line">{log}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {scheduler && (
        <div className="auto-sync-bar">
          <div className="auto-sync-toggles">
            <button
              className={`toggle-btn ${scheduler.enabled ? 'toggle-on' : 'toggle-off'}`}
              onClick={toggleAutoSync}
            >
              {t('recordings.autoSync')}: {scheduler.enabled ? t('recordings.on') : t('recordings.off')}
            </button>

            {scheduler.enabled && (
              <>
                <select
                  className="interval-select"
                  value={scheduler.intervalMinutes}
                  onChange={(e) => changeInterval(Number(e.target.value))}
                >
                  <option value={15}>15 {t('recordings.min')}</option>
                  <option value={30}>30 {t('recordings.min')}</option>
                  <option value={60}>1 {t('recordings.min') === 'min' ? 'hour' : 'giờ'}</option>
                  <option value={120}>2 {t('recordings.min') === 'min' ? 'hours' : 'giờ'}</option>
                  <option value={360}>6 {t('recordings.min') === 'min' ? 'hours' : 'giờ'}</option>
                  <option value={1440}>24 {t('recordings.min') === 'min' ? 'hours' : 'giờ'}</option>
                </select>

                <button
                  className={`toggle-btn ${scheduler.autoDownload ? 'toggle-on' : 'toggle-off'}`}
                  onClick={toggleAutoDownload}
                >
                  {t('recordings.autoDownload')}: {scheduler.autoDownload ? t('recordings.on') : t('recordings.off')}
                </button>
              </>
            )}
          </div>

          <div className="auto-sync-actions">
            {scheduler.isRunning && (
              <span className="auto-sync-status">{t('recordings.nextSyncIn')} {scheduler.intervalMinutes} {t('recordings.min')}</span>
            )}
            <button
              className="btn btn-sm"
              onClick={handleRunSchedulerNow}
              disabled={schedulerBusy}
            >
              {schedulerBusy ? t('recordings.running') : t('recordings.runNow')}
            </button>
          </div>
        </div>
      )}

      <div className="filters">
        <select
          value={filter.accountId}
          onChange={(e) => setFilter({ ...filter, accountId: e.target.value })}
        >
          <option value="">{t('recordings.allAccounts')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filter.from}
          onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          title={t('recordings.fromDate')}
        />
        <input
          type="date"
          value={filter.to}
          onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          title={t('recordings.toDate')}
        />
        <input
          placeholder={t('recordings.searchPlaceholder')}
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
        />
        <button className="btn" onClick={handleFilter}>{t('recordings.filter')}</button>
        <button
          className={`btn ${batchMode ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => { setBatchMode(!batchMode); setSelectedRecordings(new Set()); }}
        >
          {batchMode ? t('recordings.cancelBatch') : t('recordings.batchDownload')}
        </button>
      </div>

      {batchMode && (
        <div className="batch-toolbar">
          <button className="btn btn-sm" onClick={selectAllRecordings}>{t('recordings.selectAll')}</button>
          <button className="btn btn-sm" onClick={selectNoneRecordings}>{t('recordings.selectNone')}</button>
          <span className="batch-count">{t('recordings.recordingsSelected', { n: selectedRecordings.size, total: recordings.length })}</span>
          <div style={{ flex: 1 }} />
          {isWeb && (
            <div className="device-selector">
              <select
                className="device-picker"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <option value="server">💻 {t('recordings.serverLocal')}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.status === 'online' ? '🟢' : a.status === 'busy' ? '🟡' : '⚫'} {a.deviceName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            className="btn btn-danger"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={selectedRecordings.size === 0}
          >
            🗑 {t('delete.selected')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleBatchDownload}
            disabled={selectedRecordings.size === 0}
          >
            {t('recordings.downloadNRec', { n: selectedRecordings.size })}
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">{t('recordings.loading')}</div>
      ) : (
        <>
          <div className="recording-list">
            {pageGroups.map((group) => (
              <div key={group.key} className="meeting-group">
                {group.recordings.length > 1 && (
                  <div className="meeting-group-header" style={group.color ? { borderLeft: `4px solid ${group.color}` } : undefined}>
                    <span className="meeting-id-tag" style={{ background: group.color || getMeetingColor(group.meetingId) }}>
                      {group.meetingId}
                    </span>
                    <span className="meeting-group-topic">{group.name}</span>
                    <span className="meeting-group-count">
                      {group.recordings.length} {t('recordings.sessions')} &middot; {group.totalFiles} {t('recordings.files')} &middot; {formatSize(group.totalSize)}
                    </span>
                  </div>
                )}

                {group.recordings.map((rec) => {
                  const recTasks = tasksFor(rec.id);
                  const dl = recTasks.length ? summarizeTasks(recTasks) : null;
                  return (
              <div
                key={rec.id}
                className={`recording-card ${batchMode && selectedRecordings.has(rec.id) ? 'batch-selected' : ''} ${group.recordings.length > 1 ? 'grouped-card' : ''}`}
                style={rec.customColor ? { borderLeft: `4px solid ${rec.customColor}` } : undefined}
              >
                <div className="recording-header" onClick={() => batchMode ? toggleBatchRecording(rec.id) : toggleExpand(rec.id)}>
                  {batchMode && (
                    <div className="batch-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRecordings.has(rec.id)}
                        onChange={() => toggleBatchRecording(rec.id)}
                      />
                    </div>
                  )}
                  <div className="recording-expand">
                    {expandedId === rec.id ? '▼' : '▶'}
                  </div>
                  <div className="recording-info">
                    <div className="recording-title-row">
                      {group.recordings.length <= 1 && (
                        <span className="meeting-id-tag" style={{ background: rec.customColor || getMeetingColor(rec.meetingId) }} title={`${t('recordings.meetingId')}: ${rec.meetingId}`}>
                          {rec.meetingId}
                        </span>
                      )}
                      <span className="recording-title" title={effectiveName(rec)}>{effectiveName(rec)}</span>
                      {rec.customName && (
                        <span className="custom-name-badge" title={`${t('rename.original')}: ${rec.meetingTopic}`}>✎</span>
                      )}
                    </div>
                    <div className="recording-meta">
                      <span className="recording-account-tag">{getAccountName(rec.accountId)}</span>
                      {rec.hostEmail && <> &middot; {rec.hostEmail}</>}
                       &middot; {formatDate(rec.startTime)} {formatTime(rec.startTime)} &middot; <span title={t('recordings.duration')}>{formatDuration(rec.duration)}</span> &middot; {formatSize(rec.totalSize)}
                    </div>
                    {(dl || verifyMap[rec.id] || downloadSummary[rec.id]) && (
                      <div className="rec-substatus">
                        {dl && (
                          <div className={`rec-progress download-${dl.status}`} title={`${formatSize(dl.downloadedSize)} / ${formatSize(dl.totalSize)}`}>
                            <div className="download-progress-bar">
                              <div className="download-progress-fill" style={{ width: `${dl.overallProgress}%` }} />
                            </div>
                            <span className="download-percent">
                              {dl.status === 'completed' ? t('downloads.done')
                                : dl.status === 'failed' ? `${dl.completed}/${dl.total} ${t('downloads.failed')}`
                                : `${dl.overallProgress}%`}
                            </span>
                          </div>
                        )}
                        {!dl && downloadSummary[rec.id] && (
                          <span className={`download-badge download-${downloadSummary[rec.id].status}`} title={downloadSummary[rec.id].folderPath || ''}>
                            {downloadSummary[rec.id].status === 'completed' ? '✅' :
                             downloadSummary[rec.id].status === 'downloading' ? '⏬' :
                             downloadSummary[rec.id].status === 'failed' ? '❌' : '⏳'}
                            {' '}{downloadSummary[rec.id].completedCount}/{downloadSummary[rec.id].totalCount}
                            {downloadSummary[rec.id].agentId ? ` 📱 ${downloadSummary[rec.id].agentId.replace('agent-', '')}` : ' 💻 Server'}
                          </span>
                        )}
                        {verifyMap[rec.id] && (() => {
                          const v = verifyMap[rec.id];
                          const full = v.present > 0 && v.present >= v.total;
                          const cls = full ? 'verify-full' : v.present > 0 ? 'verify-partial' : 'verify-missing';
                          const label = full ? t('recordings.dlFull') : v.present > 0 ? t('recordings.dlPartial') : t('recordings.dlMissing');
                          const icon = full ? '✅' : v.present > 0 ? '⚠️' : '❌';
                          return <span className={`verify-badge ${cls}`} title={`${v.present}/${v.total}`}>{icon} {label} ({v.present}/{v.total})</span>;
                        })()}
                        {downloadSummary[rec.id]?.status === 'completed' && downloadSummary[rec.id]?.folderPath && (
                          <button
                            className="btn btn-sm btn-open-folder"
                            onClick={(e) => { e.stopPropagation(); handleOpenFolder(downloadSummary[rec.id].folderPath); }}
                            title={downloadSummary[rec.id].folderPath}
                          >
                            📂 {t('recordings.openFolder')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="recording-badges">
                    <span className="file-type-icons" title={rec.recordingFiles.map(f => getFileTypeLabel(f.fileType)).join(', ')}>
                      {getFileTypeIcons(rec.recordingFiles).join(' ')}
                    </span>
                    <span className="file-count">{rec.recordingFiles.length} {t('recordings.files')}</span>
                    <span className={`status-badge status-${rec.status}`}>{rec.status}</span>
                  </div>
                  <div className="recording-actions" onClick={(e) => e.stopPropagation()}>
                    {dl && (dl.status === 'paused' || dl.status === 'failed') && (
                      <button className="btn btn-sm btn-primary" onClick={() => handleResume(rec, recTasks)} title={t('recordings.resume')}>
                        ▶ {t('recordings.resume')}
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={handleVerify} disabled={verifying} title={t('recordings.check')}>🔍</button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => openDownloadPicker(rec)}
                      disabled={rec.recordingFiles.length === 0}
                    >
                      {t('recordings.download')}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => openRename(rec)}
                      title={t('rename.title')}
                    >
                      ✎ {t('recordings.rename')}
                    </button>
                    {rec.status !== 'deleted' && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteCloudSingle(rec)}
                      >
                        {t('recordings.deleteCloud')}
                      </button>
                    )}
                  </div>
                </div>

                {expandedId === rec.id && (
                  <div className="recording-files">
                    {downloadPickerId === rec.id && (
                      <div className="file-picker-toolbar">
                        <button className="btn btn-sm" onClick={() => selectAllFiles(rec)}>{t('recordings.selectAll')}</button>
                        <button className="btn btn-sm" onClick={selectNoneFiles}>{t('recordings.selectNone')}</button>
                        <span className="file-picker-count">{selectedFileIds.size} / {rec.recordingFiles.length} {t('recordings.selected')}</span>
                        <div style={{ flex: 1 }} />
                        {isWeb && (
                          <div className="device-selector">
                            <select
                              className="device-picker"
                              value={selectedAgent}
                              onChange={(e) => setSelectedAgent(e.target.value)}
                            >
                              <option value="server">💻 {t('recordings.serverLocal')}</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.status === 'online' ? '🟢' : a.status === 'busy' ? '🟡' : '⚫'} {a.deviceName}
                                </option>
                              ))}
                            </select>
                            {agents.length === 0 && (
                              <span className="device-hint">{t('recordings.noAgents')}</span>
                            )}
                          </div>
                        )}
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleDownloadSelected(rec)}
                          disabled={selectedFileIds.size === 0}
                        >
                          {t('recordings.downloadN', { n: selectedFileIds.size })}
                          {selectedAgent !== 'server' && agents.length > 0
                            ? ` → ${agents.find((a) => a.id === selectedAgent)?.deviceName || ''}`
                            : ''}
                        </button>
                        <button className="btn btn-sm" onClick={() => setDownloadPickerId(null)}>{t('common.cancel')}</button>
                      </div>
                    )}
                    <table>
                      <thead>
                        <tr>
                          {downloadPickerId === rec.id && <th style={{ width: 40 }}></th>}
                          <th>{t('recordings.fileType')}</th>
                          <th>{t('recordings.format')}</th>
                          <th>{t('recordings.size')}</th>
                          <th>{t('recordings.status')}</th>
                          <th>{t('recordings.action')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rec.recordingFiles.map((file) => (
                          <tr key={file.id} className={downloadPickerId === rec.id && selectedFileIds.has(file.id) ? 'file-selected' : ''}>
                            {downloadPickerId === rec.id && (
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedFileIds.has(file.id)}
                                  onChange={() => toggleFileSelection(file.id)}
                                />
                              </td>
                            )}
                            <td>{getFileTypeLabel(file.fileType)}</td>
                            <td className="text-mono">.{file.fileExtension}</td>
                            <td>{formatSize(file.fileSize)}</td>
                            <td>
                              <span className={`status-badge status-${file.status}`}>
                                {file.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleDownloadFile(file)}
                              >
                                {t('recordings.download')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Merged Downloads — progress & controls inline */}
                    {recTasks.length > 0 && (
                      <div className="inline-downloads">
                        <div className="inline-downloads-title">⏬ {t('downloads.title')}</div>
                        <table>
                          <thead>
                            <tr>
                              <th>{t('downloads.fileType')}</th>
                              <th>{t('downloads.size')}</th>
                              <th>{t('downloads.progress')}</th>
                              <th>{t('downloads.status')}</th>
                              <th>{t('downloads.actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recTasks.map((task) => (
                              <tr key={task.id}>
                                <td>{getFileTypeLabel(task.fileType)}</td>
                                <td>{formatSize(task.fileSize)}</td>
                                <td>
                                  <div className="file-progress">
                                    <div className="file-progress-bar">
                                      <div
                                        className={`file-progress-fill file-progress-${task.status}`}
                                        style={{ width: `${task.progress}%` }}
                                      />
                                    </div>
                                    <span className="file-progress-text">
                                      {task.status === 'downloading' ? `${task.progress}%` :
                                       task.status === 'completed' ? t('downloads.done') :
                                       task.status === 'failed' ? t('downloads.error') :
                                       task.status}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span className={`status-badge status-${task.status}`}>{task.status}</span>
                                </td>
                                <td>
                                  {task.status === 'downloading' && (
                                    <button className="btn btn-sm" onClick={() => api.download.pause(task.id)}>{t('downloads.pause')}</button>
                                  )}
                                  {task.status === 'paused' && (
                                    <button className="btn btn-sm btn-primary" onClick={() => api.download.resume(task.id)}>{t('downloads.resume')}</button>
                                  )}
                                  {task.status === 'failed' && (
                                    <button className="btn btn-sm btn-primary" onClick={() => api.download.retry(task.id)}>{t('downloads.retry')}</button>
                                  )}
                                  {['queued', 'downloading', 'paused'].includes(task.status) && (
                                    <button className="btn btn-sm btn-danger" onClick={() => api.download.cancel(task.id)}>{t('downloads.cancel')}</button>
                                  )}
                                  {task.status === 'completed' && gdriveConnected && (
                                    task.uploadStatus === 'uploaded' ? (
                                      <span className="status-badge status-completed" title={task.googleDriveFileId}>☁️ {t('downloads.uploaded')}</span>
                                    ) : (
                                      <button
                                        className="btn btn-sm btn-primary"
                                        onClick={() => handleUploadFile(task.id)}
                                        disabled={uploading.has(task.id) || task.uploadStatus === 'uploading'}
                                      >
                                        {uploading.has(task.id) || task.uploadStatus === 'uploading' ? '⏳' : '☁️'} {t('downloads.uploadDrive')}
                                      </button>
                                    )
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
                  );
                })}
              </div>
            ))}

            {recordings.length === 0 && (
              <div className="empty-state">
                {t('recordings.noRecordings')}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t('recordings.previous')}
              </button>
              <span className="pagination-info">
                {t('recordings.page')} {page} / {totalPages} ({allGroups.length} {t('recordings.groupsUnit')} · {totalCount} {t('recordings.recordingsUnit')})
              </span>
              <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                {t('recordings.next')}
              </button>
            </div>
          )}

          {recordings.length > 0 && totalPages <= 1 && (
            <div className="pagination-info" style={{ marginTop: 12, textAlign: 'center' }}>
              {allGroups.length} {t('recordings.groupsUnit')} · {totalCount} {t('recordings.recordingsUnit')}
            </div>
          )}
        </>
      )}

      {/* Rename modal */}
      {renameTarget && (
        <div className="modal-overlay" onClick={() => !renameSaving && setRenameTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('rename.title')}</h3>
              <button className="modal-close" onClick={() => setRenameTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{t('rename.label')}</label>
                <input
                  autoFocus
                  value={renameValue}
                  placeholder={t('rename.placeholder')}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSave()}
                />
                <small className="form-hint">{t('rename.hint')}</small>
                <small className="form-hint">{t('rename.original')}: <em>{renameTarget.meetingTopic}</em></small>
              </div>
            </div>
            <div className="modal-footer">
              {renameTarget.customName && (
                <button className="btn" onClick={handleRenameReset} disabled={renameSaving}>
                  {t('rename.reset')}
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setRenameTarget(null)} disabled={renameSaving}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleRenameSave} disabled={renameSaving}>
                {renameSaving ? t('recordings.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-scope dialog */}
      {deleteDialogOpen && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteDialogOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('delete.title', { n: selectedRecordings.size })}</h3>
              <button className="modal-close" onClick={() => setDeleteDialogOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>{t('delete.chooseScope')}</p>
              <button className="delete-scope-option" onClick={handleDeleteLocal} disabled={deleting}>
                <strong>🗑 {t('delete.local')}</strong>
                <span>{t('delete.localDesc')}</span>
              </button>
              <button className="delete-scope-option delete-scope-danger" onClick={handleDeleteCloudMany} disabled={deleting}>
                <strong>☁️ {t('delete.cloud')}</strong>
                <span>{t('delete.cloudDesc')}</span>
              </button>
            </div>
            <div className="modal-footer">
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Rules modal */}
      {rulesOpen && (
        <RulesModal
          onClose={() => setRulesOpen(false)}
          onApply={handleApplyRules}
          applying={applyingRules}
        />
      )}
    </div>
  );

  // === Handlers that reference component state but live below for readability ===
  async function handleClearList() {
    const target = syncAccountId
      ? accounts.find((a) => a.id === syncAccountId)?.name || t('recordings.allAccountsTarget')
      : t('recordings.allAccountsTarget');
    if (!confirm(t('recordings.clearConfirm', { target }))) return;
    try {
      setError(null);
      const count = await api.recording.clear(syncAccountId || undefined);
      setSyncResult(`Cleared ${count} recording(s)`);
      loadRecordings(1);
    } catch (err: any) {
      setError(err.message || 'Failed to clear');
    }
  }

  async function handleDeleteCloudSingle(rec: Recording) {
    if (!confirm(t('recordings.deleteCloudConfirm', { topic: effectiveName(rec) }))) return;
    try {
      setError(null);
      await api.recording.deleteFromCloud(rec.id);
      setSyncResult(`Moved to trash: "${effectiveName(rec)}"`);
      loadRecordings();
    } catch (err: any) {
      setError(err.message || 'Failed to delete from cloud');
    }
  }
}

// ============================================================
// Rules Modal
// ============================================================

interface RuleDraft {
  id?: string;
  meetingId: string;
  startFrom: string;
  startTo: string;
  dateFrom: string;
  dateTo: string;
  targetName: string;
  color: string;
  priority: number;
  enabled: boolean;
}

function emptyDraft(): RuleDraft {
  return { meetingId: '', startFrom: '', startTo: '', dateFrom: '', dateTo: '', targetName: '', color: '', priority: 0, enabled: true };
}

// Preset palette for rule colors (matches the meeting-id-tag palette)
const RULE_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
];

interface MeetingOption { meetingId: string; name: string; }

function ruleNormalizeId(id: string): string {
  return String(id || '').replace(/\D/g, '');
}

function ruleValidTime(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s).trim());
}

function ruleTimeToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function recLocalMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function recLocalDateStr(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Format 'YYYY-MM-DD' → 'DD/MM' for compact table display
function shortDate(s?: string): string {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}` : s;
}

interface FieldErrors {
  meetingId?: string;
  startFrom?: string;
  startTo?: string;
  targetName?: string;
  range?: string;
}

// Live count of recordings the current draft would match
function computeRuleMatch(draft: RuleDraft, recs: Array<{ meetingId: string; startTime: string }>): number | null {
  if (!draft.meetingId.trim() || !ruleValidTime(draft.startFrom) || !ruleValidTime(draft.startTo)) return null;
  const id = ruleNormalizeId(draft.meetingId);
  const from = ruleTimeToMin(draft.startFrom);
  const to = ruleTimeToMin(draft.startTo);
  if (from > to) return null;
  return recs.filter((r) =>
    ruleNormalizeId(r.meetingId) === id &&
    recLocalMinutes(r.startTime) >= from && recLocalMinutes(r.startTime) <= to &&
    (!draft.dateFrom || recLocalDateStr(r.startTime) >= draft.dateFrom) &&
    (!draft.dateTo || recLocalDateStr(r.startTime) <= draft.dateTo)
  ).length;
}

// Reusable rule form fields (used by both the Add panel and the Edit dialog).
function RuleFormFields({ draft, setDraft, errors, meetingOptions, recs, datalistId, actions }: {
  draft: RuleDraft;
  setDraft: (d: RuleDraft) => void;
  errors: FieldErrors;
  meetingOptions: MeetingOption[];
  recs: Array<{ meetingId: string; startTime: string }>;
  datalistId: string;
  actions: React.ReactNode;
}) {
  const { t } = useTranslation();
  const matchCount = computeRuleMatch(draft, recs);
  return (
    <>
      <div className="rule-form-grid">
        <div className="form-group">
          <label>{t('rules.meetingId')}</label>
          <input
            list={datalistId}
            className={errors.meetingId ? 'input-error' : ''}
            placeholder={t('rules.meetingPick')}
            value={draft.meetingId}
            onChange={(e) => setDraft({ ...draft, meetingId: e.target.value })}
          />
          <datalist id={datalistId}>
            {meetingOptions.map((o) => (
              <option key={o.meetingId} value={o.meetingId}>{o.name}</option>
            ))}
          </datalist>
          {errors.meetingId && <small className="field-error">{errors.meetingId}</small>}
        </div>

        <div className="form-group form-group-sm">
          <label>{t('rules.from')}</label>
          <input
            type="time"
            className={errors.startFrom ? 'input-error' : ''}
            value={draft.startFrom}
            onChange={(e) => setDraft({ ...draft, startFrom: e.target.value })}
          />
          {errors.startFrom && <small className="field-error">{errors.startFrom}</small>}
        </div>

        <div className="form-group form-group-sm">
          <label>{t('rules.to')}</label>
          <input
            type="time"
            className={errors.startTo || errors.range ? 'input-error' : ''}
            value={draft.startTo}
            onChange={(e) => setDraft({ ...draft, startTo: e.target.value })}
          />
          {errors.startTo && <small className="field-error">{errors.startTo}</small>}
        </div>

        <div className="form-group form-group-full">
          <label>{t('rules.name')}</label>
          <input
            className={errors.targetName ? 'input-error' : ''}
            placeholder={t('rules.namePlaceholder')}
            value={draft.targetName}
            onChange={(e) => setDraft({ ...draft, targetName: e.target.value })}
          />
          {errors.targetName && <small className="field-error">{errors.targetName}</small>}
        </div>

        <div className="form-group form-group-full">
          <label>{t('rules.dateRange')}</label>
          <div className="date-range-row">
            <input type="date" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
            <span className="date-range-sep">→</span>
            <input type="date" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
          </div>
          <small className="form-hint">{t('rules.dateRangeHint')}</small>
        </div>

        <div className="form-group form-group-full">
          <label>{t('rules.color')}</label>
          <div className="color-picker">
            <button
              type="button"
              className={`color-swatch color-none ${draft.color === '' ? 'color-selected' : ''}`}
              title={t('rules.noColor')}
              onClick={() => setDraft({ ...draft, color: '' })}
            >∅</button>
            {RULE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-swatch ${draft.color === c ? 'color-selected' : ''}`}
                style={{ background: c }}
                onClick={() => setDraft({ ...draft, color: c })}
              />
            ))}
          </div>
        </div>
      </div>

      {errors.range && <small className="field-error">{errors.range}</small>}

      <div className="rule-form-footer">
        <label className="rule-enabled-toggle">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          {t('rules.enabled')}
        </label>
        <span className={`match-preview ${matchCount === null ? '' : matchCount === 0 ? 'match-zero' : 'match-ok'}`}>
          {matchCount === null ? t('rules.matchHint') : matchCount === 0 ? t('rules.matchNone') : t('rules.matchCount', { n: matchCount })}
        </span>
        <div style={{ flex: 1 }} />
        {actions}
      </div>
    </>
  );
}

function RulesModal({ onClose, onApply, applying }: { onClose: () => void; onApply: () => void; applying: boolean }) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<RenameRule[]>([]);
  const [addDraft, setAddDraft] = useState<RuleDraft>(emptyDraft());
  const [addErrors, setAddErrors] = useState<FieldErrors>({});
  const [addSaving, setAddSaving] = useState(false);
  // Edit is shown in a centered dialog so it's never lost at the bottom
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RuleDraft>(emptyDraft());
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [editSaving, setEditSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Recordings (for the Meeting ID dropdown + live match preview)
  const [recs, setRecs] = useState<Array<{ meetingId: string; meetingTopic: string; customName?: string; startTime: string }>>([]);

  useEffect(() => { load(); loadRecs(); }, []);

  async function load() {
    try {
      setLoading(true);
      const list = await (api as any).renameRules.list();
      setRules(list);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecs() {
    try {
      const result = await api.recording.list({ pageSize: 1000, page: 1 });
      setRecs(result.recordings.map((r: any) => ({ meetingId: r.meetingId, meetingTopic: r.meetingTopic, customName: r.customName, startTime: r.startTime })));
    } catch {}
  }

  // Distinct meeting IDs with a friendly label for the dropdown
  const meetingOptions: MeetingOption[] = (() => {
    const map = new Map<string, string>();
    for (const r of recs) {
      if (!map.has(r.meetingId)) map.set(r.meetingId, r.customName || r.meetingTopic);
    }
    return [...map.entries()].map(([meetingId, name]) => ({ meetingId, name }));
  })();

  function validate(d: RuleDraft): FieldErrors {
    const e: FieldErrors = {};
    if (!d.meetingId.trim()) e.meetingId = t('rules.errMeeting');
    if (!ruleValidTime(d.startFrom)) e.startFrom = t('rules.errTime');
    if (!ruleValidTime(d.startTo)) e.startTo = t('rules.errTime');
    if (!d.targetName.trim()) e.targetName = t('rules.errName');
    if (!e.startFrom && !e.startTo && ruleTimeToMin(d.startFrom) > ruleTimeToMin(d.startTo)) {
      e.range = t('rules.errRange');
    }
    return e;
  }

  async function handleAdd() {
    const e = validate(addDraft);
    setAddErrors(e);
    if (Object.keys(e).length > 0) return;
    try {
      setAddSaving(true);
      setError(null);
      await (api as any).renameRules.create({ ...addDraft, priority: rules.length });
      setAddDraft(emptyDraft());
      setAddErrors({});
      load();
      onApply(); // re-evaluate recordings so the new rule takes effect immediately
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddSaving(false);
    }
  }

  function openEdit(rule: RenameRule) {
    setEditId(rule.id);
    setEditDraft({ ...rule, color: rule.color || '', dateFrom: rule.dateFrom || '', dateTo: rule.dateTo || '' });
    setEditErrors({});
  }

  function closeEdit() {
    setEditId(null);
    setEditErrors({});
  }

  async function handleEditSave() {
    if (!editId) return;
    const e = validate(editDraft);
    setEditErrors(e);
    if (Object.keys(e).length > 0) return;
    try {
      setEditSaving(true);
      setError(null);
      await (api as any).renameRules.update(editId, editDraft);
      closeEdit();
      load();
      onApply(); // re-apply so old names from the previous rule version are cleared
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  function useExample() {
    setAddDraft({ meetingId: '820 7737 8037', startFrom: '11:30', startTo: '12:00', dateFrom: '', dateTo: '', targetName: 'Quy Hoạch Cuộc Đời - Ca Trưa', color: '#f59e0b', priority: rules.length, enabled: true });
    setAddErrors({});
  }

  async function handleDelete(rule: RenameRule) {
    if (!confirm(t('rules.deleteConfirm', { name: rule.targetName }))) return;
    try {
      if (editId === rule.id) closeEdit();
      await (api as any).renameRules.delete(rule.id);
      load();
      onApply(); // clear names that the deleted rule had applied
    } catch (e: any) { setError(e.message); }
  }

  async function toggleEnabled(rule: RenameRule) {
    try {
      await (api as any).renameRules.update(rule.id, { enabled: !rule.enabled });
      load();
    } catch (e: any) { setError(e.message); }
  }

  // Export all rules to a downloadable JSON file
  function handleExport() {
    if (rules.length === 0) { setError(t('rules.exportEmpty')); return; }
    const payload = {
      app: 'zoom-recording-downloader',
      type: 'rename-rules',
      version: 1,
      exportedAt: new Date().toISOString(),
      rules: rules.map((r) => ({
        meetingId: r.meetingId,
        startFrom: r.startFrom,
        startTo: r.startTo,
        dateFrom: r.dateFrom || '',
        dateTo: r.dateTo || '',
        targetName: r.targetName,
        color: r.color || '',
        priority: r.priority,
        enabled: r.enabled,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rename-rules-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice(t('rules.exportDone', { n: rules.length }));
  }

  // Import rules from a JSON file (append, skipping exact duplicates)
  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const arr: any[] = Array.isArray(data) ? data : data?.rules;
      if (!Array.isArray(arr)) { setError(t('rules.importInvalid')); return; }

      const valid = arr.filter((r) =>
        r && r.meetingId && r.targetName && ruleValidTime(String(r.startFrom)) && ruleValidTime(String(r.startTo)));
      if (valid.length === 0) { setError(t('rules.importInvalid')); return; }

      const sig = (m: string, f: string, tt: string, n: string) => `${ruleNormalizeId(m)}|${f}|${tt}|${n.trim().toLowerCase()}`;
      const existing = new Set(rules.map((r) => sig(r.meetingId, r.startFrom, r.startTo, r.targetName)));
      const toImport = valid.filter((r) => !existing.has(sig(String(r.meetingId), String(r.startFrom), String(r.startTo), String(r.targetName))));
      const skipped = valid.length - toImport.length;

      if (toImport.length === 0) { setError(null); setNotice(t('rules.importAllDup')); return; }
      if (!confirm(t('rules.importConfirm', { n: toImport.length }))) return;

      const base = rules.length;
      for (let i = 0; i < toImport.length; i++) {
        const r = toImport[i];
        await (api as any).renameRules.create({
          meetingId: String(r.meetingId),
          startFrom: String(r.startFrom),
          startTo: String(r.startTo),
          dateFrom: r.dateFrom ? String(r.dateFrom) : '',
          dateTo: r.dateTo ? String(r.dateTo) : '',
          targetName: String(r.targetName),
          color: r.color || '',
          priority: base + i,
          enabled: r.enabled === false ? false : true,
        });
      }
      setError(null);
      setNotice(t('rules.importDone', { n: toImport.length, skipped }));
      load();
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }

  // Reorder: reassign priority = position for the swapped pair
  async function moveRule(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= rules.length) return;
    const reordered = [...rules];
    [reordered[index], reordered[j]] = [reordered[j], reordered[index]];
    try {
      await Promise.all(reordered.map((r, i) => (r.priority !== i ? (api as any).renameRules.update(r.id, { priority: i }) : null)).filter(Boolean));
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('rules.title')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="form-hint">{t('rules.desc')}</p>
          {error && <div className="alert alert-error">{error}<button className="alert-close" onClick={() => setError(null)}>×</button></div>}
          {notice && <div className="alert alert-success">{notice}<button className="alert-close" onClick={() => setNotice(null)}>×</button></div>}

          {/* Existing rules */}
          <div className="rules-toolbar">
            <h4 className="rules-section-title">{t('rules.existingTitle')}</h4>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={handleExport} disabled={rules.length === 0}>⬆ {t('rules.export')}</button>
            <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>⬇ {t('rules.import')}</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
            />
          </div>
          {loading ? (
            <div className="empty-state">{t('common.loading')}</div>
          ) : rules.length === 0 ? (
            <div className="empty-state">{t('rules.empty')}</div>
          ) : (
            <table className="rules-table">
              <thead>
                <tr>
                  <th>{t('rules.enabled')}</th>
                  <th>{t('rules.meetingId')}</th>
                  <th>{t('rules.from')}</th>
                  <th>{t('rules.to')}</th>
                  <th>{t('rules.dateRangeCol')}</th>
                  <th>{t('rules.name')}</th>
                  <th>{t('rules.color')}</th>
                  <th>{t('rules.order')}</th>
                  <th>{t('rules.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, index) => (
                  <tr key={rule.id} className={`${rule.enabled ? '' : 'rule-disabled'} ${editId === rule.id ? 'rule-editing' : ''}`}>
                    <td><input type="checkbox" checked={rule.enabled} onChange={() => toggleEnabled(rule)} /></td>
                    <td>{rule.meetingId}</td>
                    <td>{rule.startFrom}</td>
                    <td>{rule.startTo}</td>
                    <td className="rule-date-cell">
                      {rule.dateFrom || rule.dateTo
                        ? `${shortDate(rule.dateFrom) || '…'}–${shortDate(rule.dateTo) || '…'}`
                        : <span className="color-dot-none">{t('rules.allDates')}</span>}
                    </td>
                    <td>{rule.targetName}</td>
                    <td>
                      {rule.color
                        ? <span className="color-dot" style={{ background: rule.color }} />
                        : <span className="color-dot-none">—</span>}
                    </td>
                    <td className="move-btns">
                      <button className="btn btn-sm" title={t('rules.moveUp')} disabled={index === 0} onClick={() => moveRule(index, -1)}>⬆</button>
                      <button className="btn btn-sm" title={t('rules.moveDown')} disabled={index === rules.length - 1} onClick={() => moveRule(index, 1)}>⬇</button>
                    </td>
                    <td>
                      <div className="rule-actions-cell">
                        <button className="btn btn-sm btn-icon" title={t('common.edit')} onClick={() => openEdit(rule)}>✎</button>
                        <button className="btn btn-sm btn-icon btn-danger" title={t('common.delete')} onClick={() => handleDelete(rule)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add new rule */}
          <div className="rule-form-panel">
            <div className="rule-form-head">
              <h4 className="rules-section-title">{t('rules.addTitle')}</h4>
              <button className="btn btn-sm" onClick={useExample}>💡 {t('rules.useExample')}</button>
            </div>
            <RuleFormFields
              draft={addDraft}
              setDraft={setAddDraft}
              errors={addErrors}
              meetingOptions={meetingOptions}
              recs={recs}
              datalistId="rule-meeting-options-add"
              actions={
                <button className="btn btn-primary" onClick={handleAdd} disabled={addSaving}>
                  {addSaving ? t('recordings.saving') : `+ ${t('rules.add')}`}
                </button>
              }
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onApply} disabled={applying}>
            {applying ? t('rules.applying') : `▶ ${t('rules.applyNow')}`}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>

    {/* Edit dialog — centered so it's never lost at the bottom of a long list */}
    {editId && (
      <div className="modal-overlay" onClick={closeEdit}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{t('rules.editTitle')}</h3>
            <button className="modal-close" onClick={closeEdit}>×</button>
          </div>
          <div className="modal-body">
            <RuleFormFields
              draft={editDraft}
              setDraft={setEditDraft}
              errors={editErrors}
              meetingOptions={meetingOptions}
              recs={recs}
              datalistId="rule-meeting-options-edit"
              actions={
                <>
                  <button className="btn" onClick={closeEdit} disabled={editSaving}>{t('common.cancel')}</button>
                  <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving}>
                    {editSaving ? t('recordings.saving') : t('rules.saveRule')}
                  </button>
                </>
              }
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// === Helpers ===

const FILE_TYPE_LABELS: Record<string, string> = {
  shared_screen_with_speaker_view: 'Screen + Speaker',
  shared_screen_with_gallery_view: 'Screen + Gallery',
  shared_screen: 'Shared Screen',
  speaker_view: 'Speaker View',
  gallery_view: 'Gallery View',
  audio_only: 'Audio Only',
  audio_transcript: 'Audio Transcript',
  chat_file: 'Chat',
  timeline: 'Timeline',
  closed_caption: 'Subtitles',
};

function getFileTypeLabel(type: string): string {
  return FILE_TYPE_LABELS[type] || type.replace(/_/g, ' ');
}

const MEETING_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#e879f9', '#22d3ee', '#fb923c', '#a78bfa',
];

function getMeetingColor(meetingId: string): string {
  let hash = 0;
  for (let i = 0; i < meetingId.length; i++) {
    hash = ((hash << 5) - hash + meetingId.charCodeAt(i)) | 0;
  }
  return MEETING_COLORS[Math.abs(hash) % MEETING_COLORS.length];
}

function getFileTypeIcons(files: { fileType: string }[]): string[] {
  const types = new Set(files.map(f => f.fileType));
  const icons: string[] = [];
  if ([...types].some(t => t.includes('speaker') || t.includes('gallery') || t.includes('screen'))) icons.push('🎬');
  if (types.has('audio_only')) icons.push('🎵');
  if (types.has('chat_file')) icons.push('💬');
  if (types.has('audio_transcript')) icons.push('📝');
  if (types.has('timeline')) icons.push('⏱');
  if (types.has('closed_caption')) icons.push('📄');
  return icons;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// Aggregate the download tasks of one recording into a single progress summary.
function summarizeTasks(tasks: DownloadTask[]) {
  const totalSize = tasks.reduce((s, t) => s + t.fileSize, 0);
  const downloadedSize = tasks.reduce((s, t) => s + t.bytesDownloaded, 0);
  const completed = tasks.filter((t) => t.status === 'completed').length;
  let status: string = 'queued';
  if (tasks.some((t) => t.status === 'downloading')) status = 'downloading';
  else if (completed === tasks.length) status = 'completed';
  else if (tasks.some((t) => t.status === 'failed')) status = 'failed';
  else if (tasks.some((t) => t.status === 'paused')) status = 'paused';
  const overallProgress = totalSize > 0
    ? Math.round((downloadedSize / totalSize) * 100)
    : (completed === tasks.length ? 100 : 0);
  return { totalSize, downloadedSize, completed, total: tasks.length, overallProgress, status };
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getDefaultFromDate(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

interface MeetingGroup {
  key: string;
  meetingId: string;
  name: string;
  color?: string;
  recordings: Recording[];
  totalFiles: number;
  totalSize: number;
}

// Group by effective (rule-assigned) name + meeting ID. The same Zoom meeting ID
// is often reused for different classes at different times; grouping by name as
// well keeps each class together instead of lumping them under one ID.
function groupRecordings(recordings: Recording[]): MeetingGroup[] {
  const groups = new Map<string, MeetingGroup>();
  const order: string[] = [];

  for (const rec of recordings) {
    const name = effectiveName(rec);
    const key = `${rec.meetingId}::${name.trim().toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        meetingId: rec.meetingId,
        name,
        color: rec.customColor,
        recordings: [],
        totalFiles: 0,
        totalSize: 0,
      });
      order.push(key);
    }
    const group = groups.get(key)!;
    group.recordings.push(rec);
    group.totalFiles += rec.recordingFiles.length;
    group.totalSize += rec.totalSize;
    if (!group.color && rec.customColor) group.color = rec.customColor;
  }

  return order.map((key) => groups.get(key)!);
}
