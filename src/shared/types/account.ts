export interface ZoomAccount {
  id: string;
  name: string;
  email: string;
  clientId: string;
  clientSecret: string;
  accountId: string; // Zoom Server-to-Server OAuth account ID
  accessToken?: string;
  tokenExpiresAt?: number;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export type AccountStatus = 'active' | 'expired' | 'error';

export interface CreateAccountInput {
  name: string;
  email: string;
  clientId: string;
  clientSecret: string;
  accountId: string;
}

export interface UpdateAccountInput {
  name?: string;
  clientId?: string;
  clientSecret?: string;
  accountId?: string;
}
