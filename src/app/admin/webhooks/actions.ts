"use server";

import { revalidatePath } from "next/cache";

import { EVENT_TYPE_FA } from "@/components/admin/model/labels";
import type { ActionResult } from "@/components/admin/model/result";
import { failed } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";
import type { Schemas } from "@/server/bizin/schema";

/*
 * Secrets pass through these actions to the one browser that asked and are never logged or stored: Bizin shows
 * them once, and only the server env BIZIN_WEBHOOK_SECRETS keeps them.
 */

type Subscription = Schemas["EventSubscription"];

const SUBSCRIPTIONS = new Set(Object.keys(EVENT_TYPE_FA).filter((k) => k !== "ping"));

const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

function revalidate() {
  revalidatePath("/admin/webhooks");
  revalidatePath("/admin/webhooks/[id]", "page");
}

export async function createWebhookAction(input: {
  url: string;
  eventTypes: string[];
  description: string;
}): Promise<ActionResult<{ secret: string | null }>> {
  await requireAdmin();
  const url = String(input?.url ?? "").trim();
  if (!/^https:\/\/[^\s/]+/i.test(url) || url.length > 2048) {
    return { ok: false, message: "آدرس باید با https:// شروع شود.", fields: { url: "آدرس باید با https:// شروع شود." } };
  }
  const types = (Array.isArray(input?.eventTypes) ? input.eventTypes : []).filter((t) => SUBSCRIPTIONS.has(t)) as Subscription[];
  const event_types: Subscription[] = types.length === 0 || types.includes("*") ? ["*"] : types;
  try {
    const r = await bizin.createWebhook({ url, event_types, description: String(input?.description ?? "").trim().slice(0, 200) });
    revalidate();
    return { ok: true, data: { secret: r.secret } };
  } catch (e) {
    return failed(e);
  }
}

export async function pingWebhookAction(id: string): Promise<ActionResult<{ eventId: string }>> {
  await requireAdmin();
  if (!validId(id)) return { ok: false, message: "این وب‌هوک پیدا نشد." };
  try {
    const r = await bizin.pingWebhook(id);
    revalidate();
    return { ok: true, data: { eventId: r.event_id } };
  } catch (e) {
    return failed(e);
  }
}

export async function rotateWebhookSecretAction(id: string): Promise<ActionResult<{ secret: string | null; previousValidUntil: string | null }>> {
  await requireAdmin();
  if (!validId(id)) return { ok: false, message: "این وب‌هوک پیدا نشد." };
  try {
    const r = await bizin.rotateWebhookSecret(id);
    return { ok: true, data: { secret: r.secret, previousValidUntil: r.previous_secret_valid_until ?? null } };
  } catch (e) {
    return failed(e);
  }
}

export async function setWebhookStatusAction(id: string, status: "active" | "disabled"): Promise<ActionResult> {
  await requireAdmin();
  if (!validId(id) || (status !== "active" && status !== "disabled")) return { ok: false, message: "این وب‌هوک پیدا نشد." };
  try {
    await bizin.updateWebhook(id, { status });
    revalidate();
    return { ok: true, data: undefined };
  } catch (e) {
    return failed(e);
  }
}

export async function deleteWebhookAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!validId(id)) return { ok: false, message: "این وب‌هوک پیدا نشد." };
  try {
    await bizin.deleteWebhook(id);
    revalidatePath("/admin/webhooks");
    return { ok: true, data: undefined };
  } catch (e) {
    return failed(e);
  }
}
