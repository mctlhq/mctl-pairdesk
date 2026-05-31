import { config } from '../config.js';
import { pool } from '../db/pool.js';

let cachedId: number | null = null;

/**
 * Resolve (and seed on first call) the single MVP community by slug, caching its
 * id for the process lifetime. Every tenant-scoped row carries community_id; in
 * the single-community MVP they all point here. When multi-community lands, this
 * is the seam to replace with per-request resolution.
 */
export async function getDefaultCommunityId(): Promise<number> {
  if (cachedId !== null) return cachedId;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO communities (slug, name)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [config.defaultCommunitySlug, config.defaultCommunityName],
  );
  cachedId = rows[0]!.id;
  return cachedId;
}
