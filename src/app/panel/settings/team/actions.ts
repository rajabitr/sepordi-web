"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { requireCapability, type SellerContext } from "@/server/auth/session";
import { recordActivity, type ActivityAction } from "@/server/audit";
import { cancelInvite, changeMemberRole, inviteMember, removeMember } from "@/server/team/team";

/* Owner-only. The shop is the session's; member and invite ids from the browser only ever match inside it. */

const TEAM_PATH = "/panel/settings/team";

function done<T>(r: ActionResult<T>, ctx: SellerContext, action: ActivityAction, target: { type: string; id?: string }, meta?: Record<string, unknown>): ActionResult<T> {
  if (r.ok) {
    recordActivity(ctx, action, target, meta);
    revalidatePath(TEAM_PATH);
  }
  return r;
}

export async function inviteMemberAction(input: { phone: string; role: string }): Promise<ActionResult> {
  const ctx = await requireCapability("team.manage");
  const r = inviteMember(ctx.shop.id, ctx.user.id, input?.phone, input?.role);
  return done(r.ok ? { ok: true, data: null } : r, ctx, "team.invite", { type: "invite", id: r.ok ? r.data.id : undefined }, r.ok ? { role: r.data.role } : undefined);
}

export async function cancelInviteAction(inviteId: string): Promise<ActionResult> {
  const ctx = await requireCapability("team.manage");
  return done(cancelInvite(ctx.shop.id, inviteId), ctx, "team.invite_cancel", { type: "invite", id: String(inviteId) });
}

export async function changeMemberRoleAction(userId: string, role: string): Promise<ActionResult> {
  const ctx = await requireCapability("team.manage");
  return done(changeMemberRole(ctx.shop.id, ctx.user.id, userId, role), ctx, "team.role", { type: "user", id: String(userId) }, { role });
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const ctx = await requireCapability("team.manage");
  return done(removeMember(ctx.shop.id, ctx.user.id, userId), ctx, "team.remove", { type: "user", id: String(userId) });
}
