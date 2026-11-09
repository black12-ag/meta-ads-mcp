/** campaigns and posts: the local workspace tables used by the generic MCP tools. Server-only. */
import { maybeOne, one, q } from "./pool.server";

export interface CampaignRow {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  budget_cents: number;
  spend_cents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function insertCampaign(row: {
  user_id: string;
  name: string;
  platform: string;
  objective: string;
  budget_cents: number;
}) {
  return one<CampaignRow>(
    `INSERT INTO campaigns (user_id, name, platform, objective, budget_cents)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [row.user_id, row.name, row.platform, row.objective, row.budget_cents],
  );
}

function filters(userId: string, opts: { status?: string; platform?: string }) {
  const where = ["user_id = $1"];
  const params: unknown[] = [userId];
  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  if (opts.platform) {
    params.push(opts.platform);
    where.push(`platform = $${params.length}`);
  }
  return { where: where.join(" AND "), params };
}

export async function listCampaigns(
  userId: string,
  opts: { status?: string; platform?: string; limit: number },
) {
  const { where, params } = filters(userId, opts);
  params.push(opts.limit);
  return q<
    Pick<CampaignRow, "id" | "name" | "platform" | "objective" | "status" | "budget_cents" | "spend_cents" | "impressions" | "clicks" | "conversions">
  >(
    `SELECT id, name, platform, objective, status, budget_cents, spend_cents, impressions, clicks, conversions
     FROM campaigns WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
}

export async function campaignSummaryRows(userId: string, platform?: string) {
  const { where, params } = filters(userId, { platform });
  return q<Pick<CampaignRow, "platform" | "status" | "spend_cents" | "impressions" | "clicks" | "conversions">>(
    `SELECT platform, status, spend_cents, impressions, clicks, conversions FROM campaigns WHERE ${where}`,
    params,
  );
}

export async function updateCampaignStatus(userId: string, id: string, status: string) {
  return maybeOne<CampaignRow>(
    `UPDATE campaigns SET status = $3 WHERE user_id = $1 AND id = $2 RETURNING *`,
    [userId, id, status],
  );
}

export interface PostRow {
  id: string;
  user_id: string;
  content: string;
  platform: string;
  status: string;
  scheduled_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  created_at: string;
  updated_at: string;
}

export async function insertPost(row: {
  user_id: string;
  content: string;
  platform: string;
  status: string;
  scheduled_at: string | null;
}) {
  return one<PostRow>(
    `INSERT INTO posts (user_id, content, platform, status, scheduled_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [row.user_id, row.content, row.platform, row.status, row.scheduled_at],
  );
}

export async function listPosts(userId: string, opts: { status?: string; platform?: string; limit: number }) {
  const { where, params } = filters(userId, opts);
  params.push(opts.limit);
  return q<Pick<PostRow, "id" | "content" | "platform" | "status" | "scheduled_at" | "likes" | "comments" | "shares">>(
    `SELECT id, content, platform, status, scheduled_at, likes, comments, shares
     FROM posts WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
}
