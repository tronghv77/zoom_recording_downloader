import { ZoomAccount, CreateAccountInput, UpdateAccountInput } from '../types';

export interface IAccountService {
  list(): Promise<ZoomAccount[]>;
  getById(id: string): Promise<ZoomAccount | null>;
  create(input: CreateAccountInput): Promise<ZoomAccount>;
  update(id: string, input: UpdateAccountInput): Promise<ZoomAccount>;
  delete(id: string): Promise<void>;
  testConnection(id: string): Promise<boolean>;
  refreshToken(id: string): Promise<void>;
}
