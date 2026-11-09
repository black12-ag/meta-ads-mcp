-- Viral4All Ads schema. PostgreSQL 13+. Idempotent: safe to re-run.
-- user_id everywhere is the Firebase uid (text). No auth tables live here.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  email text,
  display_name text,
  company text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  platform text NOT NULL,
  objective text NOT NULL DEFAULT 'awareness',
  status text NOT NULL DEFAULT 'draft',
  budget_cents bigint NOT NULL DEFAULT 0,
  spend_cents bigint NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  conversions bigint NOT NULL DEFAULT 0,
  starts_at date,
  ends_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_user_idx ON campaigns (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  content text NOT NULL,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_user_idx ON posts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  meta_user_id text NOT NULL,
  meta_name text,
  meta_picture_url text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  active_ad_account_id text,
  active_page_id text,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, meta_user_id)
);

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  connection_id uuid NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  timezone_name text,
  account_status integer,
  spend_cap_cents bigint,
  amount_spent_cents bigint,
  business_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id)
);

CREATE TABLE IF NOT EXISTS meta_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  connection_id uuid NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  name text NOT NULL,
  category text,
  picture_url text,
  tasks text[] NOT NULL DEFAULT '{}',
  instagram_business_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_id)
);

CREATE TABLE IF NOT EXISTS saved_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  platform text NOT NULL DEFAULT 'meta',
  ad_account_id text,
  page_id text,
  external_ad_id text,
  external_adset_id text,
  external_campaign_id text,
  name text NOT NULL,
  campaign_name text,
  adset_name text,
  status text NOT NULL DEFAULT 'PAUSED',
  objective text,
  destination_type text NOT NULL DEFAULT 'website',
  destination_url text,
  whatsapp_number text,
  call_to_action text NOT NULL DEFAULT 'LEARN_MORE',
  headline text,
  primary_text text,
  description text,
  image_url text,
  budget_kind text NOT NULL DEFAULT 'daily',
  budget_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  start_time timestamptz,
  end_time timestamptz,
  lifetime_spend_cents bigint NOT NULL DEFAULT 0,
  lifetime_impressions bigint NOT NULL DEFAULT 0,
  lifetime_clicks bigint NOT NULL DEFAULT 0,
  lifetime_results bigint NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_ads_user_external_ad_idx
  ON saved_ads (user_id, external_ad_id) WHERE external_ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS saved_ads_user_created_idx ON saved_ads (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meta_oauth_states (
  state text PRIMARY KEY,
  user_id text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  ad_account_id text,
  ads_synced integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error_message text,
  source text NOT NULL DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_sync_runs_user_created_idx ON meta_sync_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL DEFAULT 'CLI key',
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['ads:read','ads:status','sync:write'],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);

CREATE TABLE IF NOT EXISTS meta_ad_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  ad_account_id text,
  external_ad_id text NOT NULL,
  ad_name text,
  field text NOT NULL,
  previous_value text,
  new_value text,
  source text NOT NULL DEFAULT 'sync',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_ad_changes_user_time_idx ON meta_ad_changes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meta_ad_changes_ad_idx ON meta_ad_changes (external_ad_id);

CREATE TABLE IF NOT EXISTS meta_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  meta_user_id text,
  object text,
  field text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_webhook_events_user_idx ON meta_webhook_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meta_sync_retries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  ad_account_id text,
  source text NOT NULL DEFAULT 'webhook',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_error_kind text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS meta_sync_retries_pending_key
  ON meta_sync_retries (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS meta_sync_retries_due_idx
  ON meta_sync_retries (next_attempt_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS api_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  key_prefix text,
  source text NOT NULL DEFAULT 'api',
  action text NOT NULL,
  method text,
  path text,
  ad_account_id text,
  ok boolean NOT NULL DEFAULT true,
  status_code integer,
  duration_ms integer,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_audit_log_user_created_idx ON api_audit_log (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meta_app_settings (
  user_id text PRIMARY KEY,
  public_base_url text NOT NULL DEFAULT '',
  redirect_path text NOT NULL DEFAULT '/api/public/meta/callback',
  webhook_path text NOT NULL DEFAULT '/api/public/meta/webhook',
  deauthorize_path text NOT NULL DEFAULT '/api/public/meta/deauthorize',
  data_deletion_path text NOT NULL DEFAULT '/api/public/meta/data-deletion',
  verify_token text NOT NULL DEFAULT '',
  last_validated_at timestamptz,
  last_validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- OAuth 2.1 for MCP clients (Claude, ChatGPT, Cursor). Secrets and tokens are stored as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id text PRIMARY KEY,
  client_name text,
  redirect_uris text[] NOT NULL,
  client_secret_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per grant; refresh rotates the hashes in place.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  client_id text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  scopes text[] NOT NULL,
  access_hash text NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_hash text UNIQUE,
  refresh_expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx ON oauth_tokens (user_id);

-- Spend/publish changes requested over MCP. They run only when the signed-in user approves them
-- on /approve/<id>; the AI holds token_hash's plaintext and can only read the outcome.
CREATE TABLE IF NOT EXISTS mcp_pending_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  token_hash text PRIMARY KEY,
  user_id text NOT NULL,
  action text NOT NULL,
  scope text NOT NULL,
  params jsonb NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  decision text,
  consumed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Columns added after the first deploy of this table.
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS decision text;
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS error text;
-- Who asked: the OAuth app name or the API key prefix.
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS requested_via text;
CREATE INDEX IF NOT EXISTS mcp_pending_actions_user_idx ON mcp_pending_actions (user_id, created_at DESC);

-- Transactional emails: one row per send attempt. Also the de-duplication record (welcome once,
-- Meta reconnect once a day, one email per approval request). No addresses are stored here.
CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  kind text NOT NULL,
  ref text,
  provider_id text,
  ok boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_user_kind_idx ON email_log (user_id, kind, created_at DESC);

-- Per ad account: the owner's goals and the hard limits every AI request must respect. NULL = no limit.
CREATE TABLE IF NOT EXISTS ad_account_settings (
  user_id text NOT NULL,
  account_id text NOT NULL,
  target_cpr_cents bigint CHECK (target_cpr_cents > 0),
  monthly_budget_cents bigint CHECK (monthly_budget_cents > 0),
  cycle_start_day int NOT NULL DEFAULT 1 CHECK (cycle_start_day BETWEEN 1 AND 28),
  notes text,
  max_daily_budget_cents bigint CHECK (max_daily_budget_cents > 0),
  max_raise_pct int CHECK (max_raise_pct BETWEEN 1 AND 1000),
  max_changes_per_day int CHECK (max_changes_per_day BETWEEN 1 AND 100),
  protected_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id)
);

-- Pending actions: which ad account, the owner's note, and the state before the change (for undo).
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS decision_note text;
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS before_state jsonb;
ALTER TABLE mcp_pending_actions ADD COLUMN IF NOT EXISTS undone_at timestamptz;

-- AI changes per ad account per UTC day, for max_changes_per_day; taken atomically before a change runs.
CREATE TABLE IF NOT EXISTS ai_change_counts (
  user_id text NOT NULL,
  account_id text NOT NULL,
  day date NOT NULL,
  n int NOT NULL,
  PRIMARY KEY (user_id, account_id, day)
);

-- Account alerts: what the daily account check after a sync found (spend, results, CTR, ads,
-- account status, monthly budget). account_checks holds one row per ad account per day the check
-- ran (the account's own calendar day), so it runs once a day even when it finds nothing.
CREATE TABLE IF NOT EXISTS account_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  account_id text NOT NULL,
  kind text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_alerts_user_created_idx ON account_alerts (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS account_checks (
  user_id text NOT NULL,
  account_id text NOT NULL,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, day)
);

-- Outgoing webhooks: the owner's own endpoints (Slack, Discord, n8n, Zapier, Make, a server) that
-- get signed event messages. secret is the HMAC-SHA256 signing key. After 20 failed deliveries in a
-- row (failure_count) the endpoint is paused (active = false).
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_status int,
  last_error text,
  last_delivery_at timestamptz,
  failure_count int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_user_idx ON webhook_endpoints (user_id);

-- "Notify me" on the public source pages, for platforms that are not live yet. One row per
-- signed-in user and source. Demand: SELECT source, count(*) FROM source_requests GROUP BY 1;
CREATE TABLE IF NOT EXISTS source_requests (
  user_id text NOT NULL,
  source text NOT NULL CHECK (char_length(source) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source)
);

-- updated_at triggers. DROP + CREATE keeps this file idempotent on PostgreSQL 13.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','campaigns','posts','meta_connections','meta_ad_accounts',
                           'meta_pages','saved_ads','api_keys','meta_sync_retries','meta_app_settings',
                           'ad_account_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

