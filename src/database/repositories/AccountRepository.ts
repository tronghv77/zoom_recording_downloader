import { Database as SqlJsDatabase } from 'sql.js';
import { randomUUID } from 'crypto';
import { ZoomAccount, AccountStatus, CreateAccountInput, UpdateAccountInput } from '../../shared/types';
import { saveDatabase } from '../connection';

export class AccountRepository {
  constructor(private db: SqlJsDatabase) {}

  findAll(): ZoomAccount[] {
    const result = this.db.exec('SELECT * FROM accounts ORDER BY name');
    if (result.length === 0) return [];
    return result[0].values.map((row) => this.mapRow(result[0].columns, row));
  }

  findById(id: string): ZoomAccount | null {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapObject(row);
  }

  create(input: CreateAccountInput): ZoomAccount {
    const id = randomUUID();
    this.db.run(
      `INSERT INTO accounts (id, name, email, client_id, client_secret, account_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.name, input.email, input.clientId, input.clientSecret, input.accountId],
    );
    saveDatabase();
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

    this.db.run(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDatabase();
    return this.findById(id)!;
  }

  delete(id: string): void {
    this.db.run('DELETE FROM accounts WHERE id = ?', [id]);
    saveDatabase();
  }

  updateStatus(id: string, status: AccountStatus): ZoomAccount {
    this.db.run("UPDATE accounts SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    saveDatabase();
    return this.findById(id)!;
  }

  updateToken(id: string, accessToken: string, expiresAt: number): void {
    this.db.run(
      "UPDATE accounts SET access_token = ?, token_expires_at = ?, updated_at = datetime('now') WHERE id = ?",
      [accessToken, expiresAt, id],
    );
    saveDatabase();
  }

  private mapObject(row: Record<string, any>): ZoomAccount {
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      clientId: row.client_id as string,
      clientSecret: row.client_secret as string,
      accountId: row.account_id as string,
      accessToken: (row.access_token as string) || undefined,
      tokenExpiresAt: (row.token_expires_at as number) || undefined,
      status: row.status as AccountStatus,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapRow(columns: string[], values: any[]): ZoomAccount {
    const row: Record<string, any> = {};
    columns.forEach((col, i) => { row[col] = values[i]; });
    return this.mapObject(row);
  }
}
