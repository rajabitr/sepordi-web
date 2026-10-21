import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { checkBusiness, normalizeEmail, normalizeInstagram, type BusinessErrors, type BusinessFields } from "@/components/auth/rules";
import { mobileToE164 } from "@/lib/phone";
import { createTenant } from "@/server/bizin/client";
import { isBizinError, type BizinError } from "@/server/bizin/error";
import { bizinErrorMessage, toFarsiError } from "@/server/bizin/errors-fa";
import { getDb, tx } from "@/server/db";
import { members, shops, users, type ShopRow } from "@/server/db/repo";
import { hit } from "@/server/auth/rate-limit";

export const EMAIL_IN_USE_FA = "این ایمیل قبلاً در سامانه ثبت شده؛ لطفاً ایمیل دیگری وارد کنید.";
export const REMOVED_FROM_SHOP_FA = "دسترسی شما به فروشگاهتان برداشته شده است. از مالک فروشگاه بخواهید دوباره شما را به تیم دعوت کند.";

export interface SignupError {
  message: string;
  /** The form field the message belongs under; absent = a form-level alert. */
  field?: keyof BusinessFields;
  requestId?: string;
  retryAfterSeconds?: number;
  /** The same submit may succeed later (network, limits); false = the seller must change something or call support. */
  retryable: boolean;
}

export type ProvisionResult =
  | { ok: true; shop: ShopRow; created: boolean }
  | { ok: false; error: SignupError; fieldErrors?: BusinessErrors };

/**
 * One signup in flight, kept per user in `settings` BEFORE Bizin is called, so a retry after a timeout or a crash
 * reuses the same `external_business_id` (POST /tenants is idempotent per ext) and the same Idempotency-Key while
 * the body is unchanged. Gateway keys are bound to the body, so a changed body takes a fresh key.
 */
interface PendingSignup {
  ext: string;
  idempotencyKey: string;
  fingerprint: string;
  /** Owner emails sent in attempts whose outcome is unknown (no answer, 5xx): Bizin may hold any of them. */
  uncertainEmails: string[];
}

const pendingKey = (userId: string) => `signup:pending:${userId}`;

export function readPending(userId: string): PendingSignup | undefined {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(pendingKey(userId)) as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as PendingSignup) : undefined;
}

function writePending(userId: string, p: PendingSignup): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(pendingKey(userId), JSON.stringify(p));
}

function emailTakenByOther(email: string, userId: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM users WHERE email = ? AND id <> ?").get(email, userId));
}

/** The ext for this user's business: an existing shop row's, the pending one, or a fresh `sp_<uuid>`. */
function businessIdFor(userId: string): string {
  return shops.byUserId(userId)?.external_business_id ?? readPending(userId)?.ext ?? `sp_${randomUUID()}`;
}

/** Creates the seller's Bizin business and the local shop row. Safe to call again after any failure. */
export async function provisionShop(userId: string, fields: BusinessFields): Promise<ProvisionResult> {
  const user = users.byId(userId);
  if (!user) return { ok: false, error: { message: "حساب شما پیدا نشد. دوباره وارد شوید.", retryable: false } };

  const joined = members.shopFor(userId);
  if (joined?.shop.bizin_tenant_id) return { ok: true, shop: joined.shop, created: false };
  const existing = shops.byUserId(userId);
  if (existing?.bizin_tenant_id) {
    // The creator was removed from their own shop's team; a second business would break one-shop-per-user.
    return { ok: false, error: { message: REMOVED_FROM_SHOP_FA, retryable: false } };
  }

  const fieldErrors = checkBusiness(fields);
  if (Object.keys(fieldErrors).length) {
    const [field, message] = Object.entries(fieldErrors)[0] as [keyof BusinessFields, string];
    return { ok: false, error: { message, field, retryable: false }, fieldErrors };
  }

  const email = normalizeEmail(fields.email);
  if (emailTakenByOther(email, userId)) {
    return { ok: false, error: { message: EMAIL_IN_USE_FA, field: "email", retryable: false }, fieldErrors: { email: EMAIL_IN_USE_FA } };
  }

  const limited = hit(`signup:provision:${userId}`, { max: 10, windowMs: 10 * 60_000 });
  if (!limited.ok) {
    return {
      ok: false,
      error: { message: bizinErrorMessage("rate_limited", { retry_after_seconds: limited.retryAfterSeconds })!, retryAfterSeconds: limited.retryAfterSeconds, retryable: true },
    };
  }

  const shopName = fields.shopName.trim();
  const ownerName = fields.ownerName.trim();
  const instagram = normalizeInstagram(fields.instagram);
  const metadata: Record<string, string> = { source: "sepordi-web" };
  if (instagram) metadata.instagram = instagram;
  if (fields.category) metadata.category = fields.category;

  const ext = businessIdFor(userId);
  const body = {
    external_business_id: ext,
    name: shopName,
    market_profile: "ir" as const,
    reply_language: "fa",
    // The generated schema types metadata as an empty record; the contract takes any JSON object up to 8 KiB.
    metadata: metadata as unknown as Record<string, never>,
    owner: { external_user_id: user.id, email, display_name: ownerName, locale: "fa" as const, phone: mobileToE164(user.phone) },
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const prev = readPending(userId);
  const pending: PendingSignup = {
    ext,
    idempotencyKey: prev && prev.ext === ext && prev.fingerprint === fingerprint ? prev.idempotencyKey : randomUUID(),
    fingerprint,
    uncertainEmails: prev?.uncertainEmails ?? [],
  };
  writePending(userId, pending);

  let tenantId: string;
  let created: boolean;
  try {
    const res = await createTenant(body, { idempotencyKey: pending.idempotencyKey });
    tenantId = res.tenant.id;
    created = res.created !== false;
  } catch (e) {
    return { ok: false, ...describeFailure(e, userId, pending, email) };
  }

  const shop = tx(getDb(), () => {
    const row = shops.byUserId(userId);
    let out: ShopRow;
    if (row) {
      shops.setTenantId(row.id, tenantId);
      out = { ...row, bizin_tenant_id: tenantId };
    } else {
      out = shops.create({ userId, externalBusinessId: ext, name: shopName, bizinTenantId: tenantId });
    }
    // The email check above ran before the await; a seller who took the address since keeps it.
    getDb()
      .prepare(
        "UPDATE users SET display_name = ?, email = CASE WHEN EXISTS (SELECT 1 FROM users WHERE email = ? AND id <> ?) THEN email ELSE ? END WHERE id = ?",
      )
      .run(ownerName, email, userId, email, userId);
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(pendingKey(userId));
    return out;
  });
  return { ok: true, shop, created };
}

function describeFailure(e: unknown, userId: string, pending: PendingSignup, email: string): { error: SignupError; fieldErrors?: BusinessErrors } {
  if (!isBizinError(e)) {
    console.error("[sepordi signup] createTenant failed", e instanceof Error ? e.message : e);
    return { error: { message: toFarsiError(e).message, retryable: true } };
  }
  const err: BizinError = e;
  const requestId = err.requestId;
  const uncertain = err.status === 0 || err.status >= 500 || err.code === "idempotency_request_in_progress";
  if (uncertain && !pending.uncertainEmails.includes(email)) {
    writePending(userId, { ...pending, uncertainEmails: [...pending.uncertainEmails, email] });
  }

  switch (err.code) {
    case "owner_email_in_use":
      return { error: { message: EMAIL_IN_USE_FA, field: "email", requestId, retryable: false }, fieldErrors: { email: EMAIL_IN_USE_FA } };
    case "owner_mismatch": {
      // Ours by construction (a fresh ext per user): an earlier attempt that timed out reached Bizin with another email.
      const earlier = pending.uncertainEmails.find((m) => m !== email);
      if (earlier) {
        const message = `فروشگاه شما در تلاش قبلی با ایمیل «${earlier}» ساخته شده است؛ همان ایمیل را وارد کنید.`;
        return { error: { message, field: "email", requestId, retryable: false }, fieldErrors: { email: message } };
      }
      return { error: { message: bizinErrorMessage("owner_mismatch")!, requestId, retryable: false } };
    }
    case "rate_limited":
      return {
        error: {
          message: bizinErrorMessage("rate_limited", { retry_after_seconds: err.retryAfterSeconds })!,
          requestId,
          retryAfterSeconds: err.retryAfterSeconds,
          retryable: true,
        },
      };
  }
  const fa = toFarsiError(err);
  const field = bizinField(err.field);
  const retryable =
    uncertain ||
    err.code === "quota_exceeded" ||
    err.code === "unexpected_response" ||
    err.code.startsWith("idempotency_");
  if (!uncertain) console.error("[sepordi signup] createTenant refused", err.status, err.code, requestId);
  return {
    error: { message: fa.message, field, requestId, retryAfterSeconds: err.retryAfterSeconds, retryable },
    fieldErrors: field ? { [field]: fa.message } : undefined,
  };
}

function bizinField(field: string | undefined): keyof BusinessFields | undefined {
  switch (field) {
    case "name":
      return "shopName";
    case "owner.email":
      return "email";
    case "owner.display_name":
      return "ownerName";
    default:
      return undefined;
  }
}
