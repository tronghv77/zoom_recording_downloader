import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export function DashboardPage() {
  const [accountCount, setAccountCount] = useState(0);
  const [downloadQueue, setDownloadQueue] = useState<any[]>([]);

  useEffect(() => {
    api.account.list().then((accounts) => setAccountCount(accounts.length));
    api.download.getQueue().then(setDownloadQueue);
  }, []);

  const activeDownloads = downloadQueue.filter((t) => t.status === 'downloading');
  const completedDownloads = downloadQueue.filter((t) => t.status === 'completed');

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{accountCount}</div>
          <div className="stat-label">Zoom Accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{activeDownloads.length}</div>
          <div className="stat-label">Active Downloads</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedDownloads.length}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>
    </div>
  );
}
