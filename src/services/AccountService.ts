import { IAccountService } from '../shared/interfaces';
import { ZoomAccount, CreateAccountInput, UpdateAccountInput } from '../shared/types';
import { AccountRepository } from '../database/repositories/AccountRepository';
import { ZoomApiClient } from './ZoomApiClient';

export class AccountService implements IAccountService {
  constructor(private accountRepo: AccountRepository) {}

  async list(): Promise<ZoomAccount[]> {
    return this.accountRepo.findAll();
  }

  async getById(id: string): Promise<ZoomAccount | null> {
    return this.accountRepo.findById(id);
  }

  async create(input: CreateAccountInput): Promise<ZoomAccount> {
    const account = this.accountRepo.create(input);

    // Test connection immediately
    const client = this.createApiClient(account);
    const connected = await client.testConnection();

    if (connected) {
      return this.accountRepo.updateStatus(account.id, 'active');
    }

    return this.accountRepo.updateStatus(account.id, 'error');
  }

  async update(id: string, input: UpdateAccountInput): Promise<ZoomAccount> {
    return this.accountRepo.update(id, input);
  }

  async delete(id: string): Promise<void> {
    this.accountRepo.delete(id);
  }

  async testConnection(id: string): Promise<boolean> {
    const account = await this.getById(id);
    if (!account) throw new Error(`Account not found: ${id}`);

    const client = this.createApiClient(account);
    const result = await client.testConnection();

    await this.accountRepo.updateStatus(id, result ? 'active' : 'error');
    return result;
  }

  async refreshToken(id: string): Promise<void> {
    const account = await this.getById(id);
    if (!account) throw new Error(`Account not found: ${id}`);

    const client = this.createApiClient(account);
    await client.refreshToken();

    this.accountRepo.updateToken(id, client.getAccessToken()!, client.getTokenExpiresAt());
  }

  createApiClient(account: ZoomAccount): ZoomApiClient {
    return new ZoomApiClient(account.clientId, account.clientSecret, account.accountId);
  }
}
