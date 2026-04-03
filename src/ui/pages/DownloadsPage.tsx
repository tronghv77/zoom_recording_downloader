import React, { useEffect, useState } from 'react';
import { api, isElectron } from '../api/client';
import { useTranslation } from '../i18n';
import type { DownloadTask } from '../../shared/types';

interface RecordingGroup {
  recordingId: string;
  meetingTopic: string;
  tasks: DownloadTask[];
  totalSize: number;
  downloadedSize: number;
  overallProgress: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

interface MeetingGroup {
  meetingId: string;
  topic: string;
  recordings: RecordingGroup[];
  totalFiles: number;
  totalSize: number;
  downloadedSize: number;
}

export function DownloadsPage() {
  const { t } = useTranslation();
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

  // Two-level grouping: meetingId → recordingId
  const meetingGroups = groupByMeeting(tasks);

  const totalActive = tasks.filter((t) => ['queued', 'downloading', 'paused'].includes(t.status)).length;
  const totalCompleted = tasks.filter((t) => t.status === 'completed').length;
  const totalFailed = tasks.filter((t) => t.status === 'failed').length;
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [uploading, setUploading] = useState<Set<string>>(new Set());

  useEffect(() => {
    const googleApi = (api as any).google;
    if (googleApi?.getStatus) {
      googleApi.getStatus().then((s: any) => setGdriveConnected(s.authenticated)).catch(() => {});
    }
  }, []);

  async function handleUploadFile(taskId: string) {
    const googleApi = (api as any).google;
    if (!googleApi) return;
    try {
      setUploading((prev) => new Set(prev).add(taskId));
      await googleApi.upload(taskId);
      loadQueue();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
    }
  }

  async function handleUploadAll() {
    const googleApi = (api as any).google;
    if (!googleApi) return;
    try {
      setUploading(new Set(['all']));
      const result = await googleApi.uploadAll();
      alert(`${t('downloads.uploadDone')}: ${result.uploaded} ${t('downloads.uploaded')}, ${result.failed} ${t('downloads.failed')}`);
      loadQueue();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(new Set());
    }
  }

  async function handleClear() {
    if (!confirm(t('downloads.clearConfirm'))) return;
    try {
      await (api as any).download.clear();
      loadQueue();
    } catch {}
  }

  if (loading) return <div className="page"><div className="empty-state">{t('common.loading')}</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('downloads.title')}</h2>
        <div className="header-actions">
          {tasks.length > 0 && (
            <span className="download-summary">
              {totalActive} {t('downloads.active')} &middot; {totalCompleted} {t('downloads.completed')} &middot; {totalFailed} {t('downloads.failed')}
            </span>
          )}
          {gdriveConnected && totalCompleted > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleUploadAll}
              disabled={uploading.size > 0}
            >
              {uploading.has('all') ? '⏳ Uploading...' : `☁️ ${t('downloads.uploadAll')}`}
            </button>
          )}
          {tasks.length > 0 && (
            <button className="btn btn-danger" onClick={handleClear}>
              {t('downloads.clearAll')}
            </button>
          )}
        </div>
      </div>

      <div className="download-list">
        {meetingGroups.length === 0 && (
          <div className="empty-state">
            {t('downloads.noDownloads')}
          </div>
        )}

        {meetingGroups.map((mg) => (
          <div key={mg.meetingId} className="meeting-group">
            {/* Meeting group header — shown when multiple recordings share same meeting ID */}
            {mg.recordings.length > 1 && (
              <div className="meeting-group-header">
                <span className="meeting-id-tag" style={{ background: getMeetingColor(mg.meetingId) }}>
                  {mg.meetingId}
                </span>
                <span className="meeting-group-topic">{mg.topic}</span>
                <span className="meeting-group-count">
                  {mg.recordings.length} {t('recordings.sessions')} &middot; {mg.totalFiles} {t('recordings.files')} &middot; {formatSize(mg.totalSize)}
                </span>
              </div>
            )}

            {mg.recordings.map((group) => {
              const status = getGroupStatus(group);
              const speed = getGroupSpeed(group);
              const isExpanded = expandedId === group.recordingId;

              return (
                <div key={group.recordingId} className={`recording-card download-group-${status} ${mg.recordings.length > 1 ? 'grouped-card' : ''}`}>
                  <div className="recording-header" onClick={() => setExpandedId(isExpanded ? null : group.recordingId)}>
                    <div className="recording-expand">
                      {isExpanded ? '▼' : '▶'}
                    </div>
                    <div className="recording-info">
                      <div className="recording-title-row">
                        {mg.recordings.length <= 1 && (
                          <span className="meeting-id-tag" style={{ background: getMeetingColor(mg.meetingId) }} title={`Meeting ID: ${mg.meetingId}`}>
                            {mg.meetingId}
                          </span>
                        )}
                        <span className="recording-title">{group.meetingTopic}</span>
                      </div>
                      <div className="recording-meta">
                        {group.tasks.length} {t('recordings.files')} &middot; {formatSize(group.totalSize)}
                        {group.tasks[0]?.agentId && (
                          <> &middot; 📱 {group.tasks[0].agentId.replace('agent-', '')}</>
                        )}
                        {!group.tasks[0]?.agentId && group.completedCount > 0 && (
                          <> &middot; 💻 Server</>
                        )}
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
                        {status === 'completed' ? t('downloads.done') :
                         status === 'failed' ? `${group.completedCount}/${group.tasks.length}` :
                         `${group.overallProgress}%`}
                      </span>
                    </div>

                    <div className="recording-badges">
                      <span className={`status-badge status-${status}`}>{status}</span>
                      {status === 'completed' && isElectron && (api as any).system?.openFolder && (
                        <button
                          className="btn btn-sm btn-open-folder"
                          title={t('downloads.openFolder')}
                          onClick={(e) => {
                            e.stopPropagation();
                            const folder = group.tasks[0]?.destinationPath?.replace(/[\\/][^\\/]+$/, '');
                            if (folder) (api as any).system.openFolder(folder);
                          }}
                        >
                          📂
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="recording-files">
                      <table>
                        <thead>
                          <tr>
                            <th>{t('downloads.fileType')}</th>
                            <th>{t('downloads.format')}</th>
                            <th>{t('downloads.size')}</th>
                            <th>{t('downloads.progress')}</th>
                            <th>{t('downloads.status')}</th>
                            <th>{t('downloads.actions')}</th>
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
                                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); api.download.pause(task.id); }}>{t('downloads.pause')}</button>
                                )}
                                {task.status === 'paused' && (
                                  <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); api.download.resume(task.id); }}>{t('downloads.resume')}</button>
                                )}
                                {task.status === 'failed' && (
                                  <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); api.download.retry(task.id); }}>{t('downloads.retry')}</button>
                                )}
                                {['queued', 'downloading', 'paused'].includes(task.status) && (
                                  <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); api.download.cancel(task.id); }}>{t('downloads.cancel')}</button>
                                )}
                                {task.status === 'completed' && gdriveConnected && (
                                  task.uploadStatus === 'uploaded' ? (
                                    <span className="status-badge status-completed" title={task.googleDriveFileId}>☁️ {t('downloads.uploaded')}</span>
                                  ) : (
                                    <button
                                      className="btn btn-sm btn-primary"
                                      onClick={(e) => { e.stopPropagation(); handleUploadFile(task.id); }}
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
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// === Helpers ===

function groupByMeeting(tasks: DownloadTask[]): MeetingGroup[] {
  // First group by recordingId
  const recMap = new Map<string, DownloadTask[]>();
  for (const task of tasks) {
    const key = task.recordingId;
    if (!recMap.has(key)) recMap.set(key, []);
    recMap.get(key)!.push(task);
  }

  const recGroups: RecordingGroup[] = [];
  for (const [recordingId, groupTasks] of recMap) {
    const totalSize = groupTasks.reduce((s, t) => s + t.fileSize, 0);
    const downloadedSize = groupTasks.reduce((s, t) => s + t.bytesDownloaded, 0);
    recGroups.push({
      recordingId,
      meetingTopic: groupTasks[0].meetingTopic,
      tasks: groupTasks,
      totalSize,
      downloadedSize,
      overallProgress: totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0,
      activeCount: groupTasks.filter((t) => ['queued', 'downloading'].includes(t.status)).length,
      completedCount: groupTasks.filter((t) => t.status === 'completed').length,
      failedCount: groupTasks.filter((t) => t.status === 'failed').length,
    });
  }

  // Then group recording groups by meetingId
  const meetingMap = new Map<string, MeetingGroup>();
  const order: string[] = [];

  for (const rg of recGroups) {
    const meetingId = rg.tasks[0]?.meetingId || rg.recordingId;
    if (!meetingMap.has(meetingId)) {
      meetingMap.set(meetingId, {
        meetingId,
        topic: rg.meetingTopic,
        recordings: [],
        totalFiles: 0,
        totalSize: 0,
        downloadedSize: 0,
      });
      order.push(meetingId);
    }
    const mg = meetingMap.get(meetingId)!;
    mg.recordings.push(rg);
    mg.totalFiles += rg.tasks.length;
    mg.totalSize += rg.totalSize;
    mg.downloadedSize += rg.downloadedSize;
  }

  return order.map((key) => meetingMap.get(key)!);
}

function getGroupStatus(g: RecordingGroup): string {
  if (g.tasks.some((t) => t.status === 'downloading')) return 'downloading';
  if (g.failedCount > 0 && g.completedCount < g.tasks.length) return 'failed';
  if (g.completedCount === g.tasks.length) return 'completed';
  if (g.tasks.some((t) => t.status === 'paused')) return 'paused';
  return 'queued';
}

function getGroupSpeed(g: RecordingGroup): number {
  return g.tasks.reduce((s, t) => s + (t.status === 'downloading' ? (t.speed || 0) : 0), 0);
}

// Color for Meeting ID — same as RecordingsPage
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
