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

  async enqueue(recordingFileIds: string[], options: DownloadOptions): Promise<DownloadTask[]> {
    const tasks: DownloadTask[] = [];

    for (const fileId of recordingFileIds) {
      const task = this.downloadRepo.createTask(fileId, options);
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
    await this.executeDownload(task);
  }

  async pause(taskId: string): Promise<void> {
    const controller = this.activeDownloads.get(taskId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(taskId);
    }
    this.downloadRepo.updateStatus(taskId, 'paused');
  }

  async resume(taskId: string): Promise<void> {
    const task = this.downloadRepo.findById(taskId);
    if (!task) throw new Error(`Download task not found: ${taskId}`);

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
  }

  async retry(taskId: string): Promise<void> {
    this.downloadRepo.updateStatus(taskId, 'queued');
    this.downloadRepo.resetProgress(taskId);
    this.processQueue();
  }

  async getQueue(): Promise<DownloadTask[]> {
    return this.downloadRepo.findAll();
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

  private async processQueue(): Promise<void> {
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

      // Get fresh download URL with token
      const recording = await this.recordingRepo.findById(task.recordingId);
      if (!recording) throw new Error('Recording not found');

      const account = await this.accountService.getById(recording.accountId);
      if (!account) throw new Error('Account not found');

      const client = this.accountService.createApiClient(account);
      const token = await client.refreshToken();
      const downloadUrl = `${task.downloadUrl}?access_token=${token}`;

      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        signal: controller.signal,
      });

      const writer = fs.createWriteStream(task.destinationPath);
      const totalBytes = task.fileSize;
      let bytesDownloaded = 0;
      let lastTime = Date.now();
      let lastBytes = 0;

      response.data.on('data', (chunk: Buffer) => {
        bytesDownloaded += chunk.length;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;

        let speed = 0;
        if (elapsed >= 1) {
          speed = (bytesDownloaded - lastBytes) / elapsed;
          lastTime = now;
          lastBytes = bytesDownloaded;
        }

        const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;

        this.downloadRepo.updateProgress(task.id, progress, bytesDownloaded, speed);
        this.emitProgress({
          taskId: task.id,
          progress,
          bytesDownloaded,
          totalBytes,
          speed,
          status: 'downloading',
        });
      });

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.pipe(writer);
      });

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

      // Process next in queue
      this.processQueue();
    } catch (error: unknown) {
      this.activeDownloads.delete(task.id);

      if (axios.isCancel(error)) return; // User cancelled

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.downloadRepo.updateError(task.id, message);
      this.processQueue();
    }
  }
}
