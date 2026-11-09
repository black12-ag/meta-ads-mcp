/** meta_app_settings. Server-only. */
import { maybeOne, q } from "./pool.server";

export interface AppSettingsRow {
  user_id: string;
  public_base_url: string;
  redirect_path: string;
  webhook_path: string;
  deauthorize_path: string;
  data_deletion_path: string;
  verify_token: string;
  last_validated_at: string | null;
  last_validation: unknown;
  created_at: string;
  updated_at: string;
}

export async function getAppSettings(userId: string) {
  return maybeOne<AppSettingsRow>(`SELECT * FROM meta_app_settings WHERE user_id = $1`, [userId]);
}

export async function upsertAppSettings(
  userId: string,
  f: Pick<
    AppSettingsRow,
    "public_base_url" | "redirect_path" | "webhook_path" | "deauthorize_path" | "data_deletion_path" | "verify_token"
  >,
) {
  await q(
    `INSERT INTO meta_app_settings
       (user_id, public_base_url, redirect_path, webhook_path, deauthorize_path, data_deletion_path, verify_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       public_base_url = EXCLUDED.public_base_url, redirect_path = EXCLUDED.redirect_path,
       webhook_path = EXCLUDED.webhook_path, deauthorize_path = EXCLUDED.deauthorize_path,
       data_deletion_path = EXCLUDED.data_deletion_path, verify_token = EXCLUDED.verify_token`,
    [userId, f.public_base_url, f.redirect_path, f.webhook_path, f.deauthorize_path, f.data_deletion_path, f.verify_token],
  );
}

export async function saveValidation(userId: string, ranAt: string, report: unknown) {
  await q(
    `INSERT INTO meta_app_settings (user_id, last_validated_at, last_validation)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       last_validated_at = EXCLUDED.last_validated_at, last_validation = EXCLUDED.last_validation`,
    [userId, ranAt, JSON.stringify(report)],
  );
}
