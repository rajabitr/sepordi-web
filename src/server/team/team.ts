import "server-only";

import { FIELD_MESSAGES } from "@/components/auth/rules";
import type { ActionFailure } from "@/components/panel/overview/action-result";
import { normalizeMobile } from "@/lib/phone";
import { hit } from "@/server/auth/rate-limit";
import { isAdminUser } from "@/server/auth/session";
import { getDb, tx } from "@/server/db";
import { invites, members, users, type MemberRole, type ShopInviteRow, type TeamMember } from "@/server/db/repo";

import { isMemberRole } from "./roles";

/*
 * Every function takes the acting shop's id from the caller's session; ids of members and invites arrive from the
 * browser and are only ever matched together with that shop id.
 */

export const LAST_OWNER_FA = "فروشگاه دست‌کم یک مالک لازم دارد؛ اول یک نفر دیگر را مالک کنید.";

type Done<T = null> = { ok: true; data: T } | ActionFailure;

export function parseRole(v: unknown): MemberRole | null {
  return isMemberRole(v) ? v : null;
}

export function teamOf(shopId: string): { members: TeamMember[]; invites: ShopInviteRow[] } {
  return { members: members.list(shopId), invites: invites.pendingForShop(shopId) };
}

export function inviteMember(shopId: string, invitedBy: string, rawPhone: unknown, rawRole: unknown): Done<ShopInviteRow> {
  const phone = normalizeMobile(typeof rawPhone === "string" ? rawPhone.slice(0, 32) : "");
  if (!phone) return { ok: false, field: "phone", message: FIELD_MESSAGES.phone };
  const role = parseRole(rawRole);
  if (!role) return { ok: false, field: "role", message: "نقش را انتخاب کنید." };
  const limited = hit(`team:invite:${shopId}`, { max: 30, windowMs: 60 * 60_000 });
  if (!limited.ok) return { ok: false, message: "دعوت‌ها زیاد شد. کمی بعد دوباره امتحان کنید." };

  return tx(getDb(), (): Done<ShopInviteRow> => {
    const user = users.byPhone(phone);
    if (user) {
      if (isAdminUser(user)) return { ok: false, field: "phone", message: "این شماره برای پشتیبانی سپردی است و نمی‌تواند عضو تیم شود." };
      if (members.get(shopId, user.id)) return { ok: false, field: "phone", message: "این شماره همین حالا عضو تیم شماست." };
    }
    if (invites.pendingFor(shopId, phone)) return { ok: false, field: "phone", message: "برای این شماره یک دعوت باز دارید." };
    return { ok: true, data: invites.create({ shopId, phone, role, invitedBy }) };
  });
}

export function cancelInvite(shopId: string, inviteId: unknown): Done {
  if (typeof inviteId !== "string" || inviteId.length > 64 || !invites.cancel(shopId, inviteId)) {
    return { ok: false, message: "این دعوت پیدا نشد؛ شاید پذیرفته یا لغو شده باشد." };
  }
  return { ok: true, data: null };
}

export function changeMemberRole(shopId: string, actorId: string, memberId: unknown, rawRole: unknown): Done {
  const role = parseRole(rawRole);
  if (!role) return { ok: false, message: "نقش را انتخاب کنید." };
  if (memberId === actorId) return { ok: false, message: "نقش خودتان را نمی‌توانید عوض کنید." };
  return tx(getDb(), (): Done => {
    const m = typeof memberId === "string" ? members.get(shopId, memberId) : undefined;
    if (!m) return { ok: false, message: "این عضو در تیم شما پیدا نشد." };
    if (m.role === role) return { ok: true, data: null };
    if (m.role === "owner" && members.ownerCount(shopId) <= 1) return { ok: false, message: LAST_OWNER_FA };
    members.setRole(shopId, m.user_id, role);
    return { ok: true, data: null };
  });
}

export function removeMember(shopId: string, actorId: string, memberId: unknown): Done {
  if (memberId === actorId) return { ok: false, message: "خودتان را نمی‌توانید از تیم بردارید." };
  return tx(getDb(), (): Done => {
    const m = typeof memberId === "string" ? members.get(shopId, memberId) : undefined;
    if (!m) return { ok: false, message: "این عضو در تیم شما پیدا نشد." };
    if (m.role === "owner" && members.ownerCount(shopId) <= 1) return { ok: false, message: LAST_OWNER_FA };
    members.remove(shopId, m.user_id);
    return { ok: true, data: null };
  });
}

/**
 * Called on every sign-in and signup step: every open invite for the user's number makes them a member of that
 * shop, alongside any shop they already have.
 */
export function acceptPendingInvite(userId: string): "joined" | "none" {
  return tx(getDb(), () => {
    const user = users.byId(userId);
    if (!user || isAdminUser(user)) return "none";
    let joined = false;
    for (const invite of invites.pendingForPhone(user.phone)) {
      if (!members.get(invite.shop_id, user.id)) {
        members.add(invite.shop_id, user.id, invite.role);
        joined = true;
      }
      invites.markAccepted(invite.id);
    }
    return joined ? "joined" : "none";
  });
}
