import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Recording, ZoomAccount } from '../../shared/types';

export function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [accounts, setAccounts] = useState<ZoomAccount[]>([]);
  const [filter, setFilter] = useState({ accountId: '', search: '' });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.account.list().then(setAccounts);
    loadRecordings();
  }, []);

  async function loadRecordings() {
    const result = await api.recording.list(filter);
    setRecordings(result.recordings);
  }

  async function handleSync() {
    setSyncing(true);
    const count = await api.recording.syncAll();
    setSyncing(false);
    alert(`Found ${count} new recording(s)`);
    loadRecordings();
  }

  async function handleDownload(recording: Recording) {
    const dir = await api.system.selectDirectory();
    if (!dir) return;

    const fileIds = recording.recordingFiles.map((f) => f.id);
    await api.download.enqueue(fileIds, { destinationDir: dir });
    alert('Added to download queue');
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Recordings</h2>
        <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync All'}
        </button>
      </div>

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
          placeholder="Search meeting topic..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
        <button className="btn" onClick={loadRecordings}>Filter</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Meeting Topic</th>
              <th>Date</th>
              <th>Duration</th>
              <th>Size</th>
              <th>Files</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recordings.map((rec) => (
              <tr key={rec.id}>
                <td>{rec.meetingTopic}</td>
                <td>{new Date(rec.startTime).toLocaleDateString()}</td>
                <td>{formatDuration(rec.duration)}</td>
                <td>{formatSize(rec.totalSize)}</td>
                <td>{rec.recordingFiles.length}</td>
                <td>
                  <button className="btn btn-sm btn-primary" onClick={() => handleDownload(rec)}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
            {recordings.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center">
                  No recordings found. Click "Sync All" to fetch from Zoom.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
