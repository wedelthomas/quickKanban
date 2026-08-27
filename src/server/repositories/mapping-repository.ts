import type pg from 'pg';
import type { ColumnKey, ColumnMapping } from '../../shared/types.js';
import type { Mapping } from '../../domain/column-mapping.js';

export class MappingRepository {
  constructor(private readonly pool: pg.Pool) {}

  /** The shape the domain functions take: only what deciding requires. */
  async forDomain(client?: pg.PoolClient): Promise<Mapping[]> {
    const runner = client ?? this.pool;
    const { rows } = await runner.query<{
      column_id: number;
      position: number;
      status_name: string;
    }>(
      `SELECT m.column_id, c.position, m.status_name
         FROM column_status_mappings m JOIN columns c ON c.id = m.column_id`,
    );
    return rows.map((r) => ({
      columnId: r.column_id,
      columnPosition: r.position,
      statusName: r.status_name,
    }));
  }

  /** Every column, mapped or not — the interface needs the gaps as much as the entries. */
  async list(): Promise<ColumnMapping[]> {
    const { rows } = await this.pool.query<{
      id: number;
      key: ColumnKey;
      name: string;
      status_name: string | null;
    }>(
      `SELECT c.id, c.key, c.name, m.status_name
         FROM columns c LEFT JOIN column_status_mappings m ON m.column_id = c.id
        ORDER BY c.position`,
    );
    return rows.map((r) => ({
      columnId: r.id,
      columnKey: r.key,
      columnName: r.name,
      statusName: r.status_name,
    }));
  }

  /**
   * Replaces the whole set. Removing a mapping is expressed by sending it as
   * null rather than by a separate delete, so the interface has one way to say
   * "this column is local-only".
   */
  async replace(
    mappings: { columnId: number; statusName: string | null }[],
  ): Promise<ColumnMapping[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM column_status_mappings');
      const wanted = mappings.filter((m) => m.statusName && m.statusName.trim() !== '');
      if (wanted.length > 0) {
        await client.query(
          `INSERT INTO column_status_mappings (column_id, status_name)
           SELECT unnest($1::smallint[]), unnest($2::text[])`,
          [wanted.map((m) => m.columnId), wanted.map((m) => m.statusName!.trim())],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.list();
  }
}
