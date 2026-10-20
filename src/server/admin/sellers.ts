import "server-only";

import { normalizeMobile } from "@/lib/phone";
import { en } from "@/lib/utils";
import { getDb } from "@/server/db";

/** A sepordi shop with its owner's account, as the staff screens join it to a Bizin tenant by `ext`. */
export interface LocalSeller {
  shop_id: string;
  ext: string;
  shop_name: string;
  tenant_id: string | null;
  shop_created_at: string;
  user_id: string;
  phone: string;
  display_name: string;
  user_created_at: string;
}

const SELECT = `
  SELECT s.id AS shop_id, s.external_business_id AS ext, s.name AS shop_name, s.bizin_tenant_id AS tenant_id,
         s.created_at AS shop_created_at, u.id AS user_id, u.phone AS phone, u.display_name AS display_name,
         u.created_at AS user_created_at
  FROM shops s JOIN users u ON u.id = s.user_id`;

export function localSellersByExt(exts: string[]): Map<string, LocalSeller> {
  if (exts.length === 0) return new Map();
  const rows = getDb()
    .prepare(`${SELECT} WHERE s.external_business_id IN (${exts.map(() => "?").join(",")})`)
    .all(...exts) as unknown as LocalSeller[];
  return new Map(rows.map((r) => [r.ext, r]));
}

export function localSeller(ext: string): LocalSeller | undefined {
  return getDb().prepare(`${SELECT} WHERE s.external_business_id = ?`).get(ext) as LocalSeller | undefined;
}

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Name, shop name, ext or phone (any digit script; a full mobile in any shape matches exactly). */
export function searchLocalSellers(query: string, limit = 50): LocalSeller[] {
  const q = en(query).trim();
  if (!q) return [];
  const mobile = normalizeMobile(q);
  const digits = q.replace(/\D/g, "");
  const like = `%${likeEscape(q)}%`;
  const phoneLike = digits.length >= 3 ? `%${likeEscape(digits)}%` : null;
  return getDb()
    .prepare(
      `${SELECT}
       WHERE s.name LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' OR s.external_business_id LIKE ? ESCAPE '\\'
          OR u.phone = ? OR (? IS NOT NULL AND u.phone LIKE ? ESCAPE '\\')
       ORDER BY s.created_at DESC LIMIT ?`,
    )
    .all(like, like, like, mobile ?? "", phoneLike, phoneLike, limit) as unknown as LocalSeller[];
}

export function recentLocalSellers(limit = 8): LocalSeller[] {
  return getDb().prepare(`${SELECT} ORDER BY s.created_at DESC LIMIT ?`).all(limit) as unknown as LocalSeller[];
}

export function localShopCount(): number {
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM shops").get() as { n: number };
  return Number(r.n);
}
