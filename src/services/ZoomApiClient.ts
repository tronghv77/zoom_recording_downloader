import axios, { AxiosInstance } from 'axios';

const ZOOM_API_BASE = 'https://api.zoom.us/v2';
const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class ZoomApiClient {
  private httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private accountId: string,
  ) {
    this.httpClient = axios.create({
      baseURL: ZOOM_API_BASE,
      timeout: 30000,
    });

    this.httpClient.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }
    return this.refreshToken();
  }

  async refreshToken(): Promise<string> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await axios.post<TokenResponse>(
      ZOOM_OAUTH_URL,
      new URLSearchParams({
        grant_type: 'account_credentials',
        account_id: this.accountId,
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
    return this.accessToken;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.refreshToken();
      await this.httpClient.get('/users/me');
      return true;
    } catch {
      return false;
    }
  }

  async listRecordings(from: string, to: string, pageSize = 30, nextPageToken?: string) {
    const params: Record<string, string | number> = {
      from,
      to,
      page_size: pageSize,
    };
    if (nextPageToken) {
      params.next_page_token = nextPageToken;
    }

    const response = await this.httpClient.get('/users/me/recordings', { params });
    return response.data;
  }

  async getRecordingDownloadUrl(fileId: string): Promise<string> {
    const response = await this.httpClient.get(`/meetings/recordings/${fileId}`);
    return response.data.download_url;
  }

  async deleteRecording(meetingId: string): Promise<void> {
    await this.httpClient.delete(`/meetings/${meetingId}/recordings`);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getTokenExpiresAt(): number {
    return this.tokenExpiresAt;
  }
}
