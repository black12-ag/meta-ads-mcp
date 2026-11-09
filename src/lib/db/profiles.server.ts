/** profiles: one row per Firebase user, created on first authenticated request. Server-only. */
import { q } from "./pool.server";

/** Upserts the profile; true only when this call created it. */
export async function ensureProfile(id: string, email: string | null, displayName: string | null) {
  const [row] = await q<{ created: boolean }>(
    `INSERT INTO profiles (id, email, display_name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, profiles.email),
       display_name = COALESCE(profiles.display_name, EXCLUDED.display_name)
     RETURNING (xmax = 0) AS created`,
    [id, email, displayName],
  );
  return row?.created === true;
}
