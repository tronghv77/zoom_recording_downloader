import { google, drive_v3 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsRepository } from '../database/repositories/SettingsRepository';
import { DownloadRepository } from '../database/repositories/DownloadRepository';

export class GoogleDriveService {
  private folderCache = new Map<string, string>(); // path → driveId

  constructor(
    private settingsRepo: SettingsRepository,
    private downloadRepo: DownloadRepository,
  ) {}

  // === OAuth ===

  getAuthUrl(redirectUri: string): string {
    const oauth2 = this.createOAuth2Client(redirectUri);
    return oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });
  }

  async handleCallback(code: string, redirectUri: string): Promise<void> {
    const oauth2 = this.createOAuth2Client(redirectUri);
    const { tokens } = await oauth2.getToken(code);
    this.settingsRepo.set('googleDriveTokens', JSON.stringify(tokens));
    console.log('[GoogleDrive] OAuth tokens saved');
  }

  isAuthenticated(): boolean {
    const tokens = this.getTokens();
    return !!(tokens && tokens.refresh_token);
  }

  isAutoUploadEnabled(): boolean {
    return this.settingsRepo.get('googleDriveAutoUpload') === 'true' && this.isAuthenticated();
  }

  disconnect(): void {
    this.settingsRepo.set('googleDriveTokens', '');
    this.folderCache.clear();
    console.log('[GoogleDrive] Disconnected');
  }

  getStatus(): { authenticated: boolean; autoUpload: boolean; folderId: string } {
    return {
      authenticated: this.isAuthenticated(),
      autoUpload: this.settingsRepo.get('googleDriveAutoUpload') === 'true',
      folderId: this.settingsRepo.get('googleDriveFolderId') || '',
    };
  }

  getSettings(): { clientId: string; clientSecret: string; folderId: string; autoUpload: boolean; enabled: boolean } {
    return {
      clientId: this.settingsRepo.get('googleDriveClientId') || '',
      clientSecret: this.settingsRepo.get('googleDriveClientSecret') || '',
      folderId: this.settingsRepo.get('googleDriveFolderId') || '',
      autoUpload: this.settingsRepo.get('googleDriveAutoUpload') === 'true',
      enabled: this.settingsRepo.get('googleDriveEnabled') === 'true',
    };
  }

  saveSettings(settings: { clientId?: string; clientSecret?: string; folderId?: string; autoUpload?: boolean; enabled?: boolean }): void {
    if (settings.clientId !== undefined) this.settingsRepo.set('googleDriveClientId', settings.clientId);
    if (settings.clientSecret !== undefined) this.settingsRepo.set('googleDriveClientSecret', settings.clientSecret);
    if (settings.folderId !== undefined) this.settingsRepo.set('googleDriveFolderId', settings.folderId);
    if (settings.autoUpload !== undefined) this.settingsRepo.set('googleDriveAutoUpload', String(settings.autoUpload));
    if (settings.enabled !== undefined) this.settingsRepo.set('googleDriveEnabled', String(settings.enabled));
  }

  // === Upload ===

  async uploadFile(taskId: string): Promise<{ fileId: string }> {
    const task = this.downloadRepo.findById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== 'completed') throw new Error(`Task not completed: ${task.status}`);

    const filePath = task.destinationPath;
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    // Update status
    this.downloadRepo.updateUploadStatus(taskId, 'uploading');

    try {
      const drive = this.createDriveClient();
      const configuredFolderId = this.settingsRepo.get('googleDriveFolderId') || '';
      // Auto-create ZoomRecordings folder if no folder ID configured
      const rootFolderId = configuredFolderId
        ? this.extractFolderId(configuredFolderId)
        : await this.ensureRootFolder(drive);

      // Build folder path on Drive from destination path
      const relativePath = this.getRelativePath(filePath);
      const folderParts = path.dirname(relativePath).split(/[/\\]/).filter(Boolean);
      const parentId = await this.ensureDriveFolder(drive, folderParts, rootFolderId);

      // Upload file
      const fileName = path.basename(filePath);
      const fileSize = fs.statSync(filePath).size;

      console.log(`[GoogleDrive] Uploading: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentId],
        },
        media: {
          body: fs.createReadStream(filePath),
        },
        fields: 'id, name, webViewLink',
      });

      const driveFileId = res.data.id!;
      this.downloadRepo.updateUploadStatus(taskId, 'uploaded', driveFileId);

      console.log(`[GoogleDrive] Uploaded: ${fileName} → ${driveFileId}`);
      return { fileId: driveFileId };
    } catch (error: any) {
      this.downloadRepo.updateUploadStatus(taskId, 'failed');
      throw error;
    }
  }

  async uploadAll(): Promise<{ uploaded: number; failed: number }> {
    // Find all completed tasks not yet uploaded
    const allTasks = this.downloadRepo.findByStatus('completed');
    const toUpload = allTasks.filter((t) => !t.uploadStatus || t.uploadStatus === 'failed');

    let uploaded = 0;
    let failed = 0;

    for (const task of toUpload) {
      try {
        await this.uploadFile(task.id);
        uploaded++;
      } catch (err: any) {
        console.error(`[GoogleDrive] Failed to upload ${task.id}: ${err.message}`);
        failed++;
      }
    }

    return { uploaded, failed };
  }

  async onDownloadCompleted(taskId: string): Promise<void> {
    if (!this.isAutoUploadEnabled()) return;
    try {
      await this.uploadFile(taskId);
    } catch (err: any) {
      console.error(`[GoogleDrive] Auto-upload failed for ${taskId}: ${err.message}`);
    }
  }

  // === Private helpers ===

  private extractFolderId(input: string): string {
    // Accept full URL or just ID
    // https://drive.google.com/drive/u/0/folders/ABC123 → ABC123
    const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input.trim();
  }

  private async ensureRootFolder(drive: drive_v3.Drive): Promise<string> {
    const folderName = 'ZoomRecordings';
    const cacheKey = `root/${folderName}`;

    if (this.folderCache.has(cacheKey)) {
      return this.folderCache.get(cacheKey)!;
    }

    // Search for existing folder
    const res = await drive.files.list({
      q: `name='${folderName}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1,
    });

    let folderId: string;
    if (res.data.files && res.data.files.length > 0) {
      folderId = res.data.files[0].id!;
      console.log(`[GoogleDrive] Found root folder: ${folderName} (${folderId})`);
    } else {
      const createRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = createRes.data.id!;
      console.log(`[GoogleDrive] Created root folder: ${folderName} (${folderId})`);
    }

    this.folderCache.set(cacheKey, folderId);
    return folderId;
  }

  private createOAuth2Client(redirectUri?: string) {
    const clientId = this.settingsRepo.get('googleDriveClientId') || process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = this.settingsRepo.get('googleDriveClientSecret') || process.env.GOOGLE_CLIENT_SECRET || '';
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  private getTokens(): any | null {
    const raw = this.settingsRepo.get('googleDriveTokens');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private createDriveClient(): drive_v3.Drive {
    const oauth2 = this.createOAuth2Client();
    const tokens = this.getTokens();
    if (!tokens) throw new Error('Google Drive not authenticated');
    oauth2.setCredentials(tokens);

    // Auto-refresh tokens
    oauth2.on('tokens', (newTokens) => {
      const existing = this.getTokens() || {};
      const merged = { ...existing, ...newTokens };
      this.settingsRepo.set('googleDriveTokens', JSON.stringify(merged));
    });

    return google.drive({ version: 'v3', auth: oauth2 });
  }

  private async ensureDriveFolder(drive: drive_v3.Drive, parts: string[], parentId: string): Promise<string> {
    let currentParent = parentId;

    for (let i = 0; i < parts.length; i++) {
      const folderName = parts[i];
      const cacheKey = `${currentParent}/${folderName}`;

      if (this.folderCache.has(cacheKey)) {
        currentParent = this.folderCache.get(cacheKey)!;
        continue;
      }

      // Search for existing folder
      const searchRes = await drive.files.list({
        q: `name='${folderName.replace(/'/g, "\\'")}' and '${currentParent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        pageSize: 1,
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        currentParent = searchRes.data.files[0].id!;
      } else {
        // Create folder
        const createRes = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [currentParent],
          },
          fields: 'id',
        });
        currentParent = createRes.data.id!;
      }

      this.folderCache.set(cacheKey, currentParent);
    }

    return currentParent;
  }

  private getRelativePath(filePath: string): string {
    // Try to extract relative path from download dir
    const settings = this.settingsRepo.getAll();
    const downloadDir = settings.defaultDownloadDir || '';
    if (downloadDir && filePath.startsWith(downloadDir)) {
      return filePath.substring(downloadDir.length).replace(/^[/\\]/, '');
    }
    // Fallback: use last 3 path segments
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.slice(-3).join('/');
  }
}
