import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DownloadTask } from '../../shared/types';

export function DownloadsPage() {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);

  useEffect(() => {
    loadQueue();

    const unsubscribe = api.download.onProgress(() => {
      loadQueue(); // Refresh on progress updates
    });

    return unsubscribe;
  }, []);

  async function loadQueue() {
    const queue = await api.download.getQueue();
    setTasks(queue);
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function formatSpeed(bytesPerSec: number): string {
    return `${formatSize(bytesPerSec)}/s`;
  }

  return (
    <div className="page">
      <h2>Downloads</h2>

      <div className="download-list">
        {tasks.map((task) => (
          <div key={task.id} className={`download-item download-${task.status}`}>
            <div className="download-info">
              <div className="download-name">{task.meetingTopic}</div>
              <div className="download-meta">
                {task.fileType} - {formatSize(task.fileSize)}
                {task.speed ? ` - ${formatSpeed(task.speed)}` : ''}
              </div>
            </div>

            <div className="download-progress-bar">
              <div
                className="download-progress-fill"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <span className="download-percent">{task.progress}%</span>

            <div className="download-actions">
              {task.status === 'downloading' && (
                <button className="btn btn-sm" onClick={() => api.download.pause(task.id)}>
                  Pause
                </button>
              )}
              {task.status === 'paused' && (
                <button className="btn btn-sm" onClick={() => api.download.resume(task.id)}>
                  Resume
                </button>
              )}
              {task.status === 'failed' && (
                <button className="btn btn-sm" onClick={() => api.download.retry(task.id)}>
                  Retry
                </button>
              )}
              {['queued', 'downloading', 'paused'].includes(task.status) && (
                <button className="btn btn-sm btn-danger" onClick={() => api.download.cancel(task.id)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="empty-state">No downloads in queue</div>
        )}
      </div>
    </div>
  );
}
