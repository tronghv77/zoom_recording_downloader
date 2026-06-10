import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { IDownloadService } from '../shared/interfaces';
import { DownloadTask, DownloadOptions, DownloadProgress } from '../shared/types';
import { DownloadRepository } from '../database/repositories/DownloadRepository';
import { RecordingRepository } from '../database/repositories/RecordingRepository';
import { AccountService } from './AccountService';

type ProgressCallback = (progress: DownloadProgress) => void;

export class DownloadService implements IDownloadService {
  private activeDownloads = new Map<string, AbortController>();
  private progressListeners: ProgressCallback[] = [];
  private maxConcurrent = 3;

  constructor(
    private downloadRepo: DownloadRepository,
    private recordingRepo: RecordingRepository,
    private accountService: AccountService,
  ) {}

  // Apply the user's "Max Concurrent Downloads" setting (default stays 3).
  setMaxConcurrent(n: number): void {
    if (Number.isFinite(n) && n >= 1 && n <= 10) {
      this.maxConcurrent = Math.floor(n);
      this.processQueue();
    }
  }

  // On app startup, tasks left as 'downloading' from a previous session (the app
  // was closed/crashed mid-download) are stuck — the in-memory queue is empty.
  // Reset them to 'queued' so they resume automatically.
  recoverInterrupted(): number {
    const stuck = this.downloadRepo.findByStatus('downloading');
    for (const t of stuck) {
      this.downloadRepo.resetProgress(t.id);
      this.downloadRepo.updateStatus(t.id, 'queued');
    }
    if (stuck.length > 0) this.processQueue();
    return stuck.length;
  }

  async enqueue(recordingFileIds: string[], options: DownloadOptions, folderTemplate?: string): Promise<DownloadTask[]> {
    const tasks: DownloadTask[] = [];

    for (const fileId of recordingFileIds) {
      // Avoid duplicate rows: reuse an existing task for the same file.
      const existing = this.downloadRepo.findByFileId(fileId);
      if (existing) {
        if (existing.status === 'queued' || existing.status === 'downloading') {
          tasks.push(existing); // already in progress — skip
          continue;
        }
        // completed / failed / cancelled / paused → re-download in place
        this.downloadRepo.resetProgress(existing.id);
        this.downloadRepo.updateStatus(existing.id, 'queued');
        tasks.push(this.downloadRepo.findById(existing.id)!);
        continue;
      }
      const task = this.downloadRepo.createTask(fileId, options, folderTemplate);
      tasks.push(task);
    }

    // Auto-start queued tasks up to max concurrent
    this.processQueue();
    return tasks;
  }

  async start(taskId: string): Promise<void> {
    const task = this.downloadRepo.findById(taskId);
    if (!task) throw new Error(`Download task not found: ${taskId}`);

    this.downloadRepo.updateStatus(taskId, 'downloading');
    this.executeDownload(task);
  }

  async pause(taskId: string): Promise<void> {
    const controller = this.activeDownloads.get(taskId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(taskId);
    }
    this.downloadRepo.updateStatus(taskId, 'paused');
    // Keep the current progress on the UI (don't reset the bar to 0%)
    const task = this.downloadRepo.findById(taskId);
    this.emitProgress({
      taskId,
      progress: task?.progress ?? 0,
      bytesDownloaded: task?.bytesDownloaded ?? 0,
      totalBytes: task?.fileSize ?? 0,
      speed: 0,
      status: 'paused',
    });
  }

  async resume(taskId: string): Promise<void> {
    this.downloadRepo.updateStatus(taskId, 'queued');
    this.processQueue();
  }

  async cancel(taskId: string): Promise<void> {
    const controller = this.activeDownloads.get(taskId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(taskId);
    }
    this.downloadRepo.updateStatus(taskId, 'cancelled');
    this.deletePartialFile(taskId); // remove the half-downloaded file
    this.emitProgress({ taskId, progress: 0, bytesDownloaded: 0, totalBytes: 0, speed: 0, status: 'cancelled' });
  }

  // Delete a leftover partial/incomplete file (after cancel or failure) so it
  // doesn't masquerade as a real download during on-disk verification.
  private deletePartialFile(taskId: string): void {
    try {
      const task = this.downloadRepo.findById(taskId);
      if (task && task.destinationPath && fs.existsSync(task.destinationPath)) {
        fs.unlinkSync(task.destinationPath);
      }
    } catch { /* ignore */ }
  }

  async retry(taskId: string): Promise<void> {
    this.downloadRepo.updateStatus(taskId, 'queued');
    this.downloadRepo.resetProgress(taskId);
    this.processQueue();
  }

  async getQueue(): Promise<DownloadTask[]> {
    return this.downloadRepo.findAll();
  }

  getSummary(): Record<string, any> {
    return this.downloadRepo.getDownloadSummary();
  }

  // Verify which recordings have their downloaded files actually present on disk.
  // Returns per recordingId: total tasks, completed tasks, and files found on disk.
  verifyOnDisk(): Record<string, { total: number; completed: number; present: number }> {
    const tasks = this.downloadRepo.findAll();
    const map: Record<string, { total: number; completed: number; present: number }> = {};
    for (const task of tasks) {
      if (task.agentId) continue; // remote-agent downloads are not on this machine
      const r = map[task.recordingId] || (map[task.recordingId] = { total: 0, completed: 0, present: 0 });
      r.total++;
      if (task.status === 'completed') r.completed++;
      try {
        if (task.destinationPath && fs.existsSync(task.destinationPath)) {
          // Count as present only if the file is actually complete on disk
          // (a partial/aborted file would otherwise be a false positive).
          const size = fs.statSync(task.destinationPath).size;
          if (size > 0 && (task.fileSize <= 0 || size >= task.fileSize * 0.98)) r.present++;
        }
      } catch { /* ignore */ }
    }
    return map;
  }

  clearAll(status?: string): number {
    // Cancel any active downloads first
    for (const [taskId, controller] of this.activeDownloads) {
      controller.abort();
      this.activeDownloads.delete(taskId);
    }
    return this.downloadRepo.clearAll(status as any);
  }

  async getProgress(taskId: string): Promise<DownloadProgress | null> {
    const task = this.downloadRepo.findById(taskId);
    if (!task) return null;

    return {
      taskId: task.id,
      progress: task.progress,
      bytesDownloaded: task.bytesDownloaded,
      totalBytes: task.fileSize,
      speed: task.speed || 0,
      status: task.status,
    };
  }

  onProgress(callback: ProgressCallback): () => void {
    this.progressListeners.push(callback);
    return () => {
      this.progressListeners = this.progressListeners.filter((cb) => cb !== callback);
    };
  }

  private emitProgress(progress: DownloadProgress): void {
    for (const listener of this.progressListeners) {
      listener(progress);
    }
  }

  private processQueue(): void {
    if (this.activeDownloads.size >= this.maxConcurrent) return;

    const queuedTasks = this.downloadRepo.findByStatus('queued');
    const slotsAvailable = this.maxConcurrent - this.activeDownloads.size;

    for (let i = 0; i < Math.min(slotsAvailable, queuedTasks.length); i++) {
      this.start(queuedTasks[i].id);
    }
  }

  private async executeDownload(task: DownloadTask): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(task.id, controller);

    try {
      // Ensure destination directory exists
      const dir = path.dirname(task.destinationPath);
      fs.mkdirSync(dir, { recursive: true });

      // Get fresh access token
      const recording = this.recordingRepo.findById(task.recordingId);
      if (!recording) throw new Error('Recording not found');

      const account = await this.accountService.getById(recording.accountId);
      if (!account) throw new Error('Account not found');

      const client = this.accountService.createApiClient(account);
      const token = await client.refreshToken();

      // Zoom download URL needs access_token as query param
      const separator = task.downloadUrl.includes('?') ? '&' : '?';
      const downloadUrl = `${task.downloadUrl}${separator}access_token=${token}`;

      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        signal: controller.signal,
        maxRedirects: 5,
        timeout: 30000,
      });

      const writer = fs.createWriteStream(task.destinationPath);
      const totalBytes = Number(response.headers['content-length']) || task.fileSize;
      let bytesDownloaded = 0;
      let lastEmitTime = Date.now();
      let lastSpeedTime = Date.now();
      let lastSpeedBytes = 0;
      let currentSpeed = 0;

      response.data.on('data', (chunk: Buffer) => {
        bytesDownloaded += chunk.length;

        const now = Date.now();

        // Calculate speed every second
        const speedElapsed = (now - lastSpeedTime) / 1000;
        if (speedElapsed >= 1) {
          currentSpeed = (bytesDownloaded - lastSpeedBytes) / speedElapsed;
          lastSpeedTime = now;
          lastSpeedBytes = bytesDownloaded;
        }

        // Throttle progress events to max ~4 per second
        if (now - lastEmitTime >= 250) {
          lastEmitTime = now;
          const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;

          this.downloadRepo.updateProgress(task.id, progress, bytesDownloaded, currentSpeed);
          this.emitProgress({
            taskId: task.id,
            progress,
            bytesDownloaded,
            totalBytes,
            speed: currentSpeed,
            status: 'downloading',
          });
        }
      });

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
        response.data.pipe(writer);
      });

      this.downloadRepo.updateProgress(task.id, 100, totalBytes, 0);
      this.downloadRepo.updateStatus(task.id, 'completed');
      this.activeDownloads.delete(task.id);
      this.emitProgress({
        taskId: task.id,
        progress: 100,
        bytesDownloaded: totalBytes,
        totalBytes,
        speed: 0,
        status: 'completed',
      });

      this.processQueue();
    } catch (error: unknown) {
      this.activeDownloads.delete(task.id);

      if (axios.isCancel(error)) {
        this.processQueue();
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.downloadRepo.updateError(task.id, message);
      this.deletePartialFile(task.id); // clean up the incomplete file
      this.emitProgress({
        taskId: task.id,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: task.fileSize,
        speed: 0,
        status: 'failed',
      });
      this.processQueue();
    }
  }
}
