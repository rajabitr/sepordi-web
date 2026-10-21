"use server";

import { redirect } from "next/navigation";

import { safeNextPath, type BusinessErrors, type BusinessFields } from "@/components/auth/rules";
import { createSession, getSession, isAdminUser } from "@/server/auth/session";
import { members } from "@/server/db/repo";
import { clientIp } from "@/server/http/client-ip";
import { acceptPendingInvite } from "@/server/team/team";

import { provisionShop, type SignupError } from "./provision";
import { registerWithPassword, sendCode, signInWithCode, signInWithPassword, type AuthError } from "./sign-in";

/*
 * Every export here is a public endpoint: arguments arrive untyped from the network, so each one is coerced and
 * capped before use. Seller scope comes only from the session cookie.
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export type CodeSent = { ok: true; resendAfterSeconds: number } | { ok: false; error: AuthError };
export type StepResult = { ok: true } | { ok: false; error: AuthError };
export type SignupResult = { ok: false; error: SignupError; fieldErrors?: BusinessErrors };

/** Joins the user to a shop that invited their number, then tells whether they have a shop to land in. */
function hasShop(userId: string): boolean {
  acceptPendingInvite(userId);
  return Boolean(members.shopFor(userId)?.shop.bizin_tenant_id);
}

export async function sendCodeAction(phone: unknown): Promise<CodeSent> {
  return sendCode(str(phone, 32), await clientIp());
}

/** Login by SMS code. A verified number without a shop continues at the shop step of signup. */
export async function loginWithCodeAction(phone: unknown, code: unknown, next: unknown): Promise<StepResult> {
  const r = signInWithCode(str(phone, 32), str(code, 16), await clientIp());
  if (!r.ok) return r;
  await createSession(r.userId);
  redirect(hasShop(r.userId) ? safeNextPath(next) : "/register?step=shop");
}

export async function loginWithPasswordAction(phone: unknown, password: unknown, next: unknown): Promise<StepResult> {
  const r = await signInWithPassword(str(phone, 32), str(password, 512), await clientIp());
  if (!r.ok) return r;
  await createSession(r.userId);
  redirect(hasShop(r.userId) ? safeNextPath(next) : "/register?step=shop");
}

/** Signup step 2 by SMS code. A number that already has a shop, or an invite to one, is simply signed in. */
export async function verifySignupCodeAction(phone: unknown, code: unknown): Promise<StepResult> {
  const r = signInWithCode(str(phone, 32), str(code, 16), await clientIp());
  if (!r.ok) return r;
  await createSession(r.userId);
  if (hasShop(r.userId)) redirect("/panel");
  return { ok: true };
}

export async function setSignupPasswordAction(phone: unknown, password: unknown): Promise<StepResult> {
  const r = await registerWithPassword(str(phone, 32), str(password, 512), await clientIp());
  if (!r.ok) return r;
  await createSession(r.userId);
  if (hasShop(r.userId)) redirect("/panel");
  return { ok: true };
}

/** Signup step 3: the Bizin business and the shop row. Redirects into the panel on success. */
export async function completeSignupAction(input: unknown): Promise<SignupResult> {
  const session = await getSession();
  if (!session) redirect("/register");
  if (isAdminUser(session.user)) redirect("/admin");
  if (hasShop(session.user.id)) redirect("/panel");
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const fields: BusinessFields = {
    shopName: str(raw.shopName, 200),
    ownerName: str(raw.ownerName, 200),
    email: str(raw.email, 320),
    instagram: str(raw.instagram, 200),
    category: str(raw.category, 32),
  };
  const r = await provisionShop(session.user.id, fields);
  if (!r.ok) return r;
  redirect("/panel?welcome=1");
}
