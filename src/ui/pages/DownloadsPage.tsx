import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DownloadTask } from '../../shared/types';

interface DownloadGroup {
  meetingTopic: string;
  recordingId: string;
  tasks: DownloadTask[];
  totalSize: number;
  downloadedSize: number;
  overallProgress: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

export function DownloadsPage() {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadQueue();

    const unsubscribe = api.download.onProgress((progress: any) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === progress.taskId
            ? { ...t, progress: progress.progress, bytesDownloaded: progress.bytesDownloaded, speed: progress.speed, status: progress.status }
            : t,
        ),
      );
      if (progress.status !== 'downloading') {
        setTimeout(loadQueue, 300);
      }
    });

    return () => { unsubscribe(); };
  }, []);

  async function loadQueue() {
    try {
      const queue = await api.download.getQueue();
      setTasks(queue);
    } finally {
      setLoading(false);
    }
  }

  // Group tasks by recordingId
  const groups: DownloadGroup[] = [];
  const groupMap = new Map<string, DownloadTask[]>();

  for (const task of tasks) {
    const key = task.recordingId;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(task);
  }

  for (const [recordingId, groupTasks] of groupMap) {
    const totalSize = groupTasks.reduce((s, t) => s + t.fileSize, 0);
    const downloadedSize = groupTasks.reduce((s, t) => s + t.bytesDownloaded, 0);
    const overallProgress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;

    groups.push({
      meetingTopic: groupTasks[0].meetingTopic,
      recordingId,
      tasks: groupTasks,
      totalSize,
      downloadedSize,
      overallProgress,
      activeCount: groupTasks.filter((t) => ['queued', 'downloading'].includes(t.status)).length,
      completedCount: groupTasks.filter((t) => t.status === 'completed').length,
      failedCount: groupTasks.filter((t) => t.status === 'failed').length,
    });
  }

  function getGroupStatus(g: DownloadGroup): string {
    if (g.tasks.some((t) => t.status === 'downloading')) return 'downloading';
    if (g.failedCount > 0 && g.completedCount < g.tasks.length) return 'failed';
    if (g.completedCount === g.tasks.length) return 'completed';
    if (g.tasks.some((t) => t.status === 'paused')) return 'paused';
    return 'queued';
  }

  function getGroupSpeed(g: DownloadGroup): number {
    return g.tasks.reduce((s, t) => s + (t.status === 'downloading' ? (t.speed || 0) : 0), 0);
  }

  const totalActive = tasks.filter((t) => ['queued', 'downloading', 'paused'].includes(t.status)).length;
  const totalCompleted = tasks.filter((t) => t.status === 'completed').length;
  const totalFailed = tasks.filter((t) => t.status === 'failed').length;

  if (loading) return <div className="page"><div className="empty-state">Loading...</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Downloads</h2>
        {tasks.length > 0 && (
          <span className="download-summary">
            {totalActive} active &middot; {totalCompleted} completed &middot; {totalFailed} failed
          </span>
        )}
      </div>

      <div className="download-list">
        {groups.length === 0 && (
          <div className="empty-state">
            No downloads yet. Go to Recordings and click Download to start.
          </div>
        )}

        {groups.map((group) => {
          const status = getGroupStatus(group);
          const speed = getGroupSpeed(group);
          const isExpanded = expandedId === group.recordingId;

          return (
            <div key={group.recordingId} className={`recording-card download-group-${status}`}>
              <div className="recording-header" onClick={() => setExpandedId(isExpanded ? null : group.recordingId)}>
                <div className="recording-expand">
                  {isExpanded ? '▼' : '▶'}
                </div>
                <div className="recording-info">
                  <div className="recording-title">{group.meetingTopic}</div>
                  <div className="recording-meta">
                    {group.tasks.length} files &middot; {formatSize(group.totalSize)}
                    {status === 'downloading' && speed > 0 && <> &middot; {formatSize(speed)}/s</>}
                    {status === 'downloading' && speed > 0 && group.totalSize > group.downloadedSize && (
                      <> &middot; {formatEta(group.totalSize - group.downloadedSize, speed)}</>
                    )}
                  </div>
                </div>

                <div className="download-progress-section">
                  <div className="download-progress-bar">
                    <div className="download-progress-fill" style={{ width: `${group.overallProgress}%` }} />
                  </div>
                  <span className="download-percent">
                    {status === 'completed' ? 'Done' :
                     status === 'failed' ? `${group.completedCount}/${group.tasks.length}` :
                     `${group.overallProgress}%`}
                  </span>
                </div>

                <div className="recording-badges">
                  <span className={`status-badge status-${status}`}>{status}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="recording-files">
                  <table>
                    <thead>
                      <tr>
                        <th>File Type</th>
                        <th>Format</th>
                        <th>Size</th>
                        <th>Progress</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.tasks.map((task) => (
                        <tr key={task.id}>
                          <td>{getFileTypeLabel(task.fileType)}</td>
                          <td className="text-mono">{task.destinationPath.split('.').pop()?.toUpperCase()}</td>
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
                                 task.status === 'completed' ? 'Done' :
                                 task.status === 'failed' ? 'Error' :
                                 task.status}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge status-${task.status}`}>{task.status}</span>
                          </td>
                          <td>
                            {task.status === 'downloading' && (
                              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); api.download.pause(task.id); }}>Pause</button>
                            )}
                            {task.status === 'paused' && (
                              <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); api.download.resume(task.id); }}>Resume</button>
                            )}
                            {task.status === 'failed' && (
                              <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); api.download.retry(task.id); }}>Retry</button>
                            )}
                            {['queued', 'downloading', 'paused'].includes(task.status) && (
                              <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); api.download.cancel(task.id); }}>Cancel</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FILE_TYPE_LABELS: Record<string, string> = {
  shared_screen_with_speaker_view: 'Screen + Speaker',
  shared_screen_with_gallery_view: 'Screen + Gallery',
  shared_screen: 'Shared Screen',
  speaker_view: 'Speaker View',
  gallery_view: 'Gallery View',
  active_speaker: 'Active Speaker',
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
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatEta(remainingBytes: number, speed: number): string {
  if (speed <= 0) return '';
  const seconds = Math.round(remainingBytes / speed);
  if (seconds < 60) return `${seconds}s left`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m left`;
  return `${Math.round(seconds / 3600)}h left`;
}
