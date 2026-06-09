import { Database as SqlJsDatabase } from 'sql.js';
import { randomUUID } from 'crypto';
import { RenameRule } from '../../shared/types';
import { saveDatabase } from '../connection';

export class RenameRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  findAll(): RenameRule[] {
    const result = this.db.exec(
      'SELECT * FROM rename_rules ORDER BY priority ASC, created_at ASC',
    );
    if (result.length === 0) return [];
    return result[0].values.map((values) => {
      const row: Record<string, any> = {};
      result[0].columns.forEach((col, i) => { row[col] = values[i]; });
      return this.mapObject(row);
    });
  }

  create(input: Omit<RenameRule, 'id' | 'createdAt'>): RenameRule {
    const id = randomUUID();
    this.db.run(
      `INSERT INTO rename_rules (id, meeting_id, start_from, start_to, target_name, color, priority, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        normalizeMeetingId(input.meetingId),
        input.startFrom,
        input.startTo,
        input.targetName,
        input.color || null,
        input.priority ?? 0,
        input.enabled === false ? 0 : 1,
      ],
    );
    saveDatabase();
    return this.findById(id)!;
  }

  update(id: string, input: Partial<Omit<RenameRule, 'id' | 'createdAt'>>): RenameRule {
    const existing = this.findById(id);
    if (!existing) throw new Error(`Rename rule not found: ${id}`);
    const merged = { ...existing, ...input };
    this.db.run(
      `UPDATE rename_rules SET meeting_id = ?, start_from = ?, start_to = ?, target_name = ?, color = ?, priority = ?, enabled = ? WHERE id = ?`,
      [
        normalizeMeetingId(merged.meetingId),
        merged.startFrom,
        merged.startTo,
        merged.targetName,
        merged.color || null,
        merged.priority ?? 0,
        merged.enabled === false ? 0 : 1,
        id,
      ],
    );
    saveDatabase();
    return this.findById(id)!;
  }

  delete(id: string): void {
    this.db.run('DELETE FROM rename_rules WHERE id = ?', [id]);
    saveDatabase();
  }

  private findById(id: string): RenameRule | null {
    const stmt = this.db.prepare('SELECT * FROM rename_rules WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapObject(row);
  }

  private mapObject(row: Record<string, any>): RenameRule {
    return {
      id: row.id as string,
      meetingId: row.meeting_id as string,
      startFrom: row.start_from as string,
      startTo: row.start_to as string,
      targetName: row.target_name as string,
      color: (row.color as string) || undefined,
      priority: (row.priority as number) ?? 0,
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as string,
    };
  }
}

// Strip spaces/dashes so "820 7737 8037" matches the stored "82077378037".
export function normalizeMeetingId(id: string): string {
  return String(id || '').replace(/\D/g, '');
}
