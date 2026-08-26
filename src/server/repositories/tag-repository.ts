import type pg from 'pg';

export interface Tag {
  id: number;
  name: string;
}

export class TagRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Resolves names to ids, creating any the vocabulary does not yet hold.
   * `citext` makes the uniqueness case-insensitive in the column's own type,
   * so ON CONFLICT catches "Ops" against an existing "ops" without the query
   * having to fold case itself.
   */
  async getOrCreate(client: pg.PoolClient, names: readonly string[]): Promise<Tag[]> {
    if (names.length === 0) return [];

    await client.query(
      `INSERT INTO tags (name) SELECT unnest($1::citext[]) ON CONFLICT (name) DO NOTHING`,
      [names],
    );
    const { rows } = await client.query<Tag>(
      `SELECT id, name::text AS name FROM tags WHERE name = ANY($1::citext[])`,
      [names],
    );
    return rows;
  }

  /** Prefix search for the autocomplete. Case-insensitive by column type. */
  async suggest(prefix: string, limit = 10): Promise<Tag[]> {
    const { rows } = await this.pool.query<Tag>(
      `SELECT id, name::text AS name FROM tags
        WHERE name ILIKE $1 || '%'
        ORDER BY name
        LIMIT $2`,
      [prefix, limit],
    );
    return rows;
  }
}
