"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { requireShopOwner } from "@/server/auth/session";
import { cancelInvite, changeMemberRole, inviteMember, removeMember } from "@/server/team/team";

/* Owner-only. The shop is the session's; member and invite ids from the browser only ever match inside it. */

const TEAM_PATH = "/panel/settings/team";

function done<T>(r: ActionResult<T>): ActionResult<T> {
  if (r.ok) revalidatePath(TEAM_PATH);
  return r;
}

export async function inviteMemberAction(input: { phone: string; role: string }): Promise<ActionResult> {
  const { user, shop } = await requireShopOwner();
  const r = inviteMember(shop.id, user.id, input?.phone, input?.role);
  return done(r.ok ? { ok: true, data: null } : r);
}

export async function cancelInviteAction(inviteId: string): Promise<ActionResult> {
  const { shop } = await requireShopOwner();
  return done(cancelInvite(shop.id, inviteId));
}

export async function changeMemberRoleAction(userId: string, role: string): Promise<ActionResult> {
  const { user, shop } = await requireShopOwner();
  return done(changeMemberRole(shop.id, user.id, userId, role));
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const { user, shop } = await requireShopOwner();
  return done(removeMember(shop.id, user.id, userId));
}
