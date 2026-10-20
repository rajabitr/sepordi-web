import { describe, expect, it } from "vitest";

import type { Schemas } from "@/server/bizin/schema";

import {
  HEALTH_LABEL,
  HEALTH_REASON_FA,
  INSTAGRAM_REASON_FA,
  instagramReasonFa,
  isTelegramToken,
  normalizeTelegramToken,
  PAIRING_MAX_MS,
  pairingNext,
  pendingWhatsApp,
  STATUS_LABEL,
  type ChannelView,
} from "./channel-meta";

const ch = (over: Partial<ChannelView>): ChannelView => ({ channel_id: "c", kind: "whatsapp", status: "connected", connected_at: null, ...over });

describe("pairingNext", () => {
  it("keeps polling while pending or showing a QR, within three minutes", () => {
    expect(pairingNext("pending", 0)).toBe("poll");
    expect(pairingNext("qr", PAIRING_MAX_MS - 1)).toBe("poll");
  });
  it("stops after three minutes", () => {
    expect(pairingNext("qr", PAIRING_MAX_MS)).toBe("timeout");
  });
  it("stops on the terminal states", () => {
    expect(pairingNext("connected", 1)).toBe("connected");
    expect(pairingNext("failed", 1)).toBe("restart");
    expect(pairingNext("expired", 1)).toBe("restart");
  });
});

describe("pendingWhatsApp", () => {
  it("picks the newest WhatsApp account still pairing", () => {
    const list = [
      ch({ channel_id: "a", status: "pairing" }),
      ch({ channel_id: "t", kind: "telegram", status: "pairing" }),
      ch({ channel_id: "b", status: "pairing" }),
      ch({ channel_id: "c", status: "connected" }),
    ];
    expect(pendingWhatsApp(list)).toBe("b");
    expect(pendingWhatsApp([ch({ status: "error" })])).toBeNull();
  });
});

describe("Telegram token", () => {
  const good = "7012345678:AAH" + "x".repeat(32);
  it("accepts a BotFather token, also with Persian digits and stray spaces", () => {
    expect(isTelegramToken(good)).toBe(true);
    expect(isTelegramToken(` ۷۰۱۲۳۴۵۶۷۸:AAH${"x".repeat(32)}\n`)).toBe(true);
    expect(normalizeTelegramToken(" ۷۰۱:ab ")).toBe("701:ab");
  });
  it("refuses anything else", () => {
    expect(isTelegramToken("7012345678")).toBe(false);
    expect(isTelegramToken("abc:" + "x".repeat(32))).toBe(false);
    expect(isTelegramToken("7012345678:short")).toBe(false);
  });
});

describe("Farsi labels", () => {
  it("cover every status, health state and health reason Bizin sends", () => {
    const statuses: Record<Schemas["Channel"]["status"], true> = { disconnected: true, pairing: true, connected: true, banned: true, error: true };
    for (const s of Object.keys(statuses)) expect(STATUS_LABEL[s as keyof typeof STATUS_LABEL], s).toBeTruthy();
    const states: Record<Schemas["ChannelHealthState"], true> = { ok: true, quiet: true, degraded: true, broken: true, unknown: true };
    for (const s of Object.keys(states)) expect(HEALTH_LABEL[s as keyof typeof HEALTH_LABEL], s).toBeTruthy();
    const reasons: Record<Schemas["ChannelHealthReason"], true> = {
      none: true,
      idle: true,
      unusual_silence: true,
      wa_socket_down: true,
      wa_session_missing: true,
      tg_webhook_empty: true,
      tg_webhook_foreign: true,
      tg_delivery_failing: true,
      tg_updates_incomplete: true,
      tg_token_rejected: true,
      ig_subscription_missing: true,
      ig_token_rejected: true,
      ig_token_expiring: true,
      ig_scope_missing: true,
      probe_unreachable: true,
    };
    for (const r of Object.keys(reasons)) expect(r in HEALTH_REASON_FA, r).toBe(true);
  });

  it("explains every Instagram return reason and falls back for an unknown one", () => {
    for (const r of ["denied", "state", "browser", "exchange", "scope", "profile", "taken", "config", "server"]) {
      expect(INSTAGRAM_REASON_FA[r], r).toBeTruthy();
    }
    expect(instagramReasonFa("something_new")).toContain("کامل نشد");
    expect(instagramReasonFa(undefined)).toContain("کامل نشد");
  });
});
