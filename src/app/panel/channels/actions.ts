"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { isTelegramToken, normalizeTelegramToken, pendingWhatsApp } from "@/components/panel/channels/channel-meta";
import { requireSeller } from "@/server/auth/session";
import { connectTelegram, connectWhatsApp, createConnectLink, disconnectChannel, getTenantChannels } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";

export type ChannelActionFailure = { ok: false; message: string; requestId?: string };

function failure(e: unknown): ChannelActionFailure {
  const f = toFarsiError(e);
  return { ok: false, message: f.message, requestId: f.requestId };
}

/**
 * Starts a WhatsApp pairing, or picks up the one already waiting for its scan: Bizin allows one per business and
 * answers a second start with 409 `whatsapp_pairing_in_progress`.
 */
export async function startWhatsAppAction(): Promise<{ ok: true; channelId: string } | ChannelActionFailure> {
  const ext = (await requireSeller()).shop.external_business_id;
  try {
    const started = await connectWhatsApp(ext, {});
    return { ok: true, channelId: started.channel_id };
  } catch (e) {
    if (!isBizinError(e) || e.code !== "whatsapp_pairing_in_progress") return failure(e);
    try {
      const existing = pendingWhatsApp((await getTenantChannels(ext)).channels);
      return existing ? { ok: true, channelId: existing } : failure(e);
    } catch (e2) {
      return failure(e2);
    }
  }
}

/** A failed or expired pairing leaves its channel behind: remove it, then start a new one. */
export async function restartWhatsAppAction(channelId: string): Promise<{ ok: true; channelId: string } | ChannelActionFailure> {
  const ext = (await requireSeller()).shop.external_business_id;
  try {
    await disconnectChannel(ext, String(channelId));
  } catch (e) {
    if (!isBizinError(e) || e.code !== "channel_account_not_found") return failure(e);
  }
  return startWhatsAppAction();
}

export async function disconnectChannelAction(channelId: string): Promise<{ ok: true } | ChannelActionFailure> {
  const ext = (await requireSeller()).shop.external_business_id;
  try {
    await disconnectChannel(ext, String(channelId));
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** The token goes to Bizin once and is never sent back to the browser, not even inside an error. */
export async function connectTelegramAction(token: string): Promise<{ ok: true } | ChannelActionFailure> {
  const ext = (await requireSeller()).shop.external_business_id;
  if (typeof token !== "string" || !isTelegramToken(token)) {
    return { ok: false, message: "این توکن ربات تلگرام نیست. توکن را کامل از BotFather کپی کنید." };
  }
  try {
    await connectTelegram(ext, { bot_token: normalizeTelegramToken(token) });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Sends the browser to Bizin's hosted Instagram login; Bizin brings it back to /panel/channels/instagram/return. */
export async function connectInstagramAction(): Promise<ChannelActionFailure> {
  const ext = (await requireSeller()).shop.external_business_id;
  const base = (process.env.PUBLIC_BASE_URL || "https://sepordi.ir").replace(/\/+$/, "");
  let url: string | null;
  try {
    const link = await createConnectLink(ext, { channel: "instagram", return_url: `${base}/panel/channels/instagram/return`, replace: false });
    url = link.url;
  } catch (e) {
    return failure(e);
  }
  if (!url) return { ok: false, message: "لینک اتصال ساخته نشد. صفحه را تازه کنید و دوباره امتحان کنید." };
  redirect(url);
}
