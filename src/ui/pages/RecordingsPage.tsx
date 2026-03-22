import React, { useEffect, useState } from 'react';
import { api, isWeb } from '../api/client';
import type { Recording, RecordingFile, ZoomAccount } from '../../shared/types';

export function RecordingsPage() {
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [downloadPickerId, setDownloadPickerId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [scheduler, setScheduler] = useState<any>(null);
  const [schedulerBusy, setSchedulerBusy] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('server');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedRecordings, setSelectedRecordings] = useState<Set<string>>(new Set());
  const [downloadSummary, setDownloadSummary] = useState<Record<string, any>>({});

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

    const unsubs: Array<() => void> = [];
    unsubs.push(api.scheduler.onMessage(() => { loadScheduler(); }));

    // Load download summary
    if (isWeb && (api as any).download?.getSummary) {
      (api as any).download.getSummary().then(setDownloadSummary).catch(() => {});
    }

    // Load agents in web mode
    if (isWeb && (api as any).agents) {
      (api as any).agents.list().then(setAgents).catch(() => {});
      unsubs.push((api as any).agents.onAgentUpdate((list: any[]) => setAgents(list)));
    }

    return () => { unsubs.forEach((u) => u()); };
  }, []);

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
    const newConfig = { ...scheduler, enabled: !scheduler.enabled };
    await api.scheduler.saveConfig(newConfig);
    loadScheduler();
  }

  async function toggleAutoDownload() {
    if (!scheduler) return;
    const newConfig = { ...scheduler, autoDownload: !scheduler.autoDownload };
    await api.scheduler.saveConfig(newConfig);
    loadScheduler();
  }

  async function changeInterval(minutes: number) {
    if (!scheduler) return;
    const newConfig = { ...scheduler, intervalMinutes: minutes };
    await api.scheduler.saveConfig(newConfig);
    loadScheduler();
  }

  async function handleRunSchedulerNow() {
    try {
      setSchedulerBusy(true);
      const logs = await api.scheduler.runNow();
      setSyncLogs(logs);
      setSyncResult(`Scheduler completed`);
      loadRecordings(1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSchedulerBusy(false);
      loadScheduler();
    }
  }

  async function loadRecordings(p = page, filterOverride?: Partial<typeof filter>) {
    const f = { ...filter, ...filterOverride };
    try {
      setLoading(true);
      setError(null);
      const result = await api.recording.list({
        accountId: f.accountId || undefined,
        search: f.search || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
        page: p,
        pageSize: 20,
      });
      setRecordings(result.recordings);
      setTotalCount(result.totalCount);
      setPage(p);
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
        // Download to remote agent
        const result = await (api as any).agents.downloadToAgent(selectedAgent, fileIds);
        const agentName = agents.find((a) => a.id === selectedAgent)?.deviceName || selectedAgent;
        setSyncResult(`Sent ${result.sent} file(s) to "${agentName}"`);
      } else {
        // Download to server (local)
        const dir = await getDownloadDir();
        if (!dir) return;
        await api.download.enqueue(fileIds, { destinationDir: dir });
        setSyncResult(`Added ${fileIds.length} file(s) to download queue`);
      }
      setDownloadPickerId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to enqueue download');
    }
  }

  async function handleDownloadFile(file: RecordingFile) {
    try {
      const dir = await getDownloadDir();
      if (!dir) return;
      await api.download.enqueue([file.id], { destinationDir: dir });
      setSyncResult(`Added 1 file to download queue`);
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
      // Refresh download summary
      if (isWeb && (api as any).download?.getSummary) {
        (api as any).download.getSummary().then(setDownloadSummary).catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to batch download');
    }
  }

  async function handleClear() {
    const target = syncAccountId
      ? accounts.find((a) => a.id === syncAccountId)?.name || 'this account'
      : 'all accounts';
    if (!confirm(`Clear all recordings from "${target}"? This only removes from the local list, not from Zoom Cloud.`)) return;
    try {
      setError(null);
      const count = await api.recording.clear(syncAccountId || undefined);
      setSyncResult(`Cleared ${count} recording(s)`);
      loadRecordings(1);
    } catch (err: any) {
      setError(err.message || 'Failed to clear');
    }
  }

  async function handleDeleteCloud(rec: Recording) {
    if (!confirm(`Move "${rec.meetingTopic}" to Zoom Trash?\n\nRecording can be recovered within 30 days from Zoom Trash.`)) return;
    try {
      setError(null);
      await api.recording.deleteFromCloud(rec.id);
      setSyncResult(`Moved to trash: "${rec.meetingTopic}"`);
      loadRecordings();
    } catch (err: any) {
      setError(err.message || 'Failed to delete from cloud');
    }
  }

  function startRename(rec: Recording) {
    setRenamingId(rec.id);
    setRenameValue(rec.meetingTopic);
  }

  async function handleRename() {
    if (!renamingId || !renameValue.trim()) return;
    try {
      setRenaming(true);
      setError(null);
      await api.recording.rename(renamingId, renameValue.trim(), false);
      setSyncResult('Renamed successfully');
      setRenamingId(null);
      loadRecordings();
    } catch (err: any) {
      setError(err.message || 'Rename failed');
    } finally {
      setRenaming(false);
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

  const totalPages = Math.ceil(totalCount / 20);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Recordings</h2>
        <div className="header-actions">
          <select
            className="sync-account-select"
            value={syncAccountId}
            onChange={(e) => setSyncAccountId(e.target.value)}
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => syncAccountId ? handleSyncAccount(syncAccountId) : handleSyncAll()}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : syncAccountId ? 'Sync Account' : 'Sync All'}
          </button>
          {recordings.length > 0 && (
            <button className="btn btn-danger" onClick={handleClear}>
              Clear
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
              Auto Sync: {scheduler.enabled ? 'ON' : 'OFF'}
            </button>

            {scheduler.enabled && (
              <>
                <select
                  className="interval-select"
                  value={scheduler.intervalMinutes}
                  onChange={(e) => changeInterval(Number(e.target.value))}
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={360}>6 hours</option>
                  <option value={1440}>24 hours</option>
                </select>

                <button
                  className={`toggle-btn ${scheduler.autoDownload ? 'toggle-on' : 'toggle-off'}`}
                  onClick={toggleAutoDownload}
                >
                  Auto Download: {scheduler.autoDownload ? 'ON' : 'OFF'}
                </button>
              </>
            )}
          </div>

          <div className="auto-sync-actions">
            {scheduler.isRunning && (
              <span className="auto-sync-status">Next sync in {scheduler.intervalMinutes} min</span>
            )}
            <button
              className="btn btn-sm"
              onClick={handleRunSchedulerNow}
              disabled={schedulerBusy}
            >
              {schedulerBusy ? 'Running...' : 'Run Now'}
            </button>
          </div>
        </div>
      )}

      <div className="filters">
        <select
          value={filter.accountId}
          onChange={(e) => setFilter({ ...filter, accountId: e.target.value })}
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filter.from}
          onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          title="From date"
        />
        <input
          type="date"
          value={filter.to}
          onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          title="To date"
        />
        <input
          placeholder="Search meeting topic..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
        />
        <button className="btn" onClick={handleFilter}>Filter</button>
        <button
          className={`btn ${batchMode ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => { setBatchMode(!batchMode); setSelectedRecordings(new Set()); }}
        >
          {batchMode ? 'Cancel Batch' : 'Batch Download'}
        </button>
      </div>

      {batchMode && (
        <div className="batch-toolbar">
          <button className="btn btn-sm" onClick={selectAllRecordings}>Select All</button>
          <button className="btn btn-sm" onClick={selectNoneRecordings}>Select None</button>
          <span className="batch-count">{selectedRecordings.size} / {recordings.length} recording(s) selected</span>
          <div style={{ flex: 1 }} />
          {isWeb && (
            <div className="device-selector">
              <select
                className="device-picker"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <option value="server">💻 Server (local)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.status === 'online' ? '🟢' : a.status === 'busy' ? '🟡' : '⚫'} {a.deviceName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={handleBatchDownload}
            disabled={selectedRecordings.size === 0}
          >
            Download {selectedRecordings.size} recording(s)
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading recordings...</div>
      ) : (
        <>
          <div className="recording-list">
            {recordings.map((rec) => (
              <div key={rec.id} className={`recording-card ${batchMode && selectedRecordings.has(rec.id) ? 'batch-selected' : ''}`}>
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
                    <div className="recording-title" title={rec.meetingTopic}>{rec.meetingTopic}</div>
                    <div className="recording-meta">
                      <span className="recording-account-tag">{getAccountName(rec.accountId)}</span>
                      {rec.hostEmail && <> &middot; {rec.hostEmail}</>}
                       &middot; {formatDate(rec.startTime)} {formatTime(rec.startTime)} &middot; <span title="Duration">{formatDuration(rec.duration)}</span> &middot; {formatSize(rec.totalSize)}
                    </div>
                  </div>
                  <div className="recording-badges">
                    <span className="file-count">{rec.recordingFiles.length} files</span>
                    <span className={`status-badge status-${rec.status}`}>{rec.status}</span>
                    {downloadSummary[rec.id] && (
                      <span className={`download-badge download-${downloadSummary[rec.id].status}`}>
                        {downloadSummary[rec.id].status === 'completed' ? '✅' :
                         downloadSummary[rec.id].status === 'downloading' ? '⏬' :
                         downloadSummary[rec.id].status === 'failed' ? '❌' : '⏳'}
                        {' '}
                        {downloadSummary[rec.id].completedCount}/{downloadSummary[rec.id].totalCount}
                        {downloadSummary[rec.id].agentId
                          ? ` 📱 ${downloadSummary[rec.id].agentId.replace('agent-', '')}`
                          : ' 💻 Server'}
                      </span>
                    )}
                  </div>
                  <div className="recording-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => startRename(rec)}>
                      Rename
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => openDownloadPicker(rec)}
                      disabled={rec.recordingFiles.length === 0}
                    >
                      Download
                    </button>
                    {rec.status !== 'deleted' && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteCloud(rec)}
                      >
                        Delete Cloud
                      </button>
                    )}
                  </div>
                </div>

                {renamingId === rec.id && (
                  <div className="rename-form" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                      autoFocus
                    />
                    <div className="rename-actions">
                      <button className="btn btn-sm btn-primary" onClick={handleRename} disabled={renaming}>
                        {renaming ? 'Saving...' : 'Save'}
                      </button>
                      <button className="btn btn-sm" onClick={() => setRenamingId(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {expandedId === rec.id && (
                  <div className="recording-files">
                    {downloadPickerId === rec.id && (
                      <div className="file-picker-toolbar">
                        <button className="btn btn-sm" onClick={() => selectAllFiles(rec)}>Select All</button>
                        <button className="btn btn-sm" onClick={selectNoneFiles}>Select None</button>
                        <span className="file-picker-count">{selectedFileIds.size} / {rec.recordingFiles.length} selected</span>
                        <div style={{ flex: 1 }} />
                        {isWeb && (
                          <div className="device-selector">
                            <select
                              className="device-picker"
                              value={selectedAgent}
                              onChange={(e) => setSelectedAgent(e.target.value)}
                            >
                              <option value="server">💻 Server (local)</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.status === 'online' ? '🟢' : a.status === 'busy' ? '🟡' : '⚫'} {a.deviceName}
                                </option>
                              ))}
                            </select>
                            {agents.length === 0 && (
                              <span className="device-hint">No agents connected</span>
                            )}
                          </div>
                        )}
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleDownloadSelected(rec)}
                          disabled={selectedFileIds.size === 0}
                        >
                          Download {selectedFileIds.size} file(s)
                          {selectedAgent !== 'server' && agents.length > 0
                            ? ` → ${agents.find((a) => a.id === selectedAgent)?.deviceName || ''}`
                            : ''}
                        </button>
                        <button className="btn btn-sm" onClick={() => setDownloadPickerId(null)}>Cancel</button>
                      </div>
                    )}
                    <table>
                      <thead>
                        <tr>
                          {downloadPickerId === rec.id && <th style={{ width: 40 }}></th>}
                          <th>File Type</th>
                          <th>Format</th>
                          <th>Size</th>
                          <th>Status</th>
                          <th>Action</th>
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
                                Download
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {recordings.length === 0 && (
              <div className="empty-state">
                No recordings found. Click "Sync All Accounts" to fetch from Zoom Cloud.
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => loadRecordings(page - 1)}>
                Previous
              </button>
              <span className="pagination-info">
                Page {page} / {totalPages} ({totalCount} recordings)
              </span>
              <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => loadRecordings(page + 1)}>
                Next
              </button>
            </div>
          )}

          {recordings.length > 0 && totalPages <= 1 && (
            <div className="pagination-info" style={{ marginTop: 12, textAlign: 'center' }}>
              {totalCount} recording(s)
            </div>
          )}
        </>
      )}
    </div>
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

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
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
