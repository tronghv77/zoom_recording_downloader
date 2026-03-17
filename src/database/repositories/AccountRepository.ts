import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { ZoomAccount, AccountStatus, CreateAccountInput, UpdateAccountInput } from '../../shared/types';

export class AccountRepository {
  constructor(private db: Database.Database) {}

  findAll(): ZoomAccount[] {
    const rows = this.db.prepare('SELECT * FROM accounts ORDER BY name').all() as any[];
    return rows.map(this.mapRow);
  }

  findById(id: string): ZoomAccount | null {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  create(input: CreateAccountInput): ZoomAccount {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO accounts (id, name, email, client_id, client_secret, account_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.email, input.clientId, input.clientSecret, input.accountId);

    return this.findById(id)!;
  }

  update(id: string, input: UpdateAccountInput): ZoomAccount {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.clientId !== undefined) { fields.push('client_id = ?'); values.push(input.clientId); }
    if (input.clientSecret !== undefined) { fields.push('client_secret = ?'); values.push(input.clientSecret); }
    if (input.accountId !== undefined) { fields.push('account_id = ?'); values.push(input.accountId); }

    if (fields.length === 0) return this.findById(id)!;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id)!;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  updateStatus(id: string, status: AccountStatus): ZoomAccount {
    this.db
      .prepare("UPDATE accounts SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, id);
    return this.findById(id)!;
  }

  updateToken(id: string, accessToken: string, expiresAt: number): void {
    this.db
      .prepare("UPDATE accounts SET access_token = ?, token_expires_at = ?, updated_at = datetime('now') WHERE id = ?")
      .run(accessToken, expiresAt, id);
  }

  private mapRow(row: any): ZoomAccount {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      clientId: row.client_id,
      clientSecret: row.client_secret,
      accountId: row.account_id,
      accessToken: row.access_token || undefined,
      tokenExpiresAt: row.token_expires_at || undefined,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
