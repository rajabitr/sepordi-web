import { describe, expect, it } from "vitest";

import { isOwnerOnlyHref } from "@/components/panel/shell/nav";

import { setupSteps, type SetupReads } from "./setup-steps";

const reads = (business_profile: string): SetupReads => ({
  channels: { ok: true, data: { channels: [] } } as unknown as SetupReads["channels"],
  products: { ok: true, data: { products: [] } } as unknown as SetupReads["products"],
  payment: { ok: true, data: { configured: false } } as unknown as SetupReads["payment"],
  assistant: {
    ok: true,
    data: { enabled: true, auto_reply: true, reply_language: "fa", persona_name: "", business_profile, updated_at: "2026-10-21T00:00:00Z" },
  },
});

const profile = (r: SetupReads) => setupSteps(r, "owner").find((s) => s.key === "profile");

describe("setup checklist: business profile", () => {
  it("is a step linking to the assistant page, counted with the others", () => {
    const steps = setupSteps(reads("ساعت کاری ۱۰ تا ۲۰"), "owner");
    expect(steps).toHaveLength(5);
    expect(profile(reads(""))).toMatchObject({ title: "معرفی کسب‌وکار نوشته شده؟", href: "/panel/assistant" });
    expect(steps.filter((s) => s.state === "done").map((s) => s.key)).toEqual(["assistant", "profile"]);
  });

  it("is todo while the profile is empty or only whitespace", () => {
    expect(profile(reads(""))?.state).toBe("todo");
    expect(profile(reads("  \n "))?.state).toBe("todo");
  });

  it("is unknown, not todo, when the assistant read failed", () => {
    const r = { ...reads(""), assistant: { ok: false as const, message: "خطا", code: "x", status: 500 } };
    expect(profile(r)).toMatchObject({ state: "unknown", error: "خطا" });
  });

  it("keeps step keys unique", () => {
    const keys = setupSteps(reads(""), "owner").map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("setup checklist: role", () => {
  it("gives an agent no link to an owner-only page, but keeps every step and its state", () => {
    const owner = setupSteps(reads(""), "owner");
    const agent = setupSteps(reads(""), "agent");
    expect(agent.map((s) => [s.key, s.state])).toEqual(owner.map((s) => [s.key, s.state]));
    for (const s of agent) expect(s.href === undefined || !isOwnerOnlyHref(s.href)).toBe(true);
    expect(agent.find((s) => s.key === "product")?.href).toBe("/panel/products");
    expect(agent.filter((s) => s.href === undefined).map((s) => s.key)).toEqual(["channel", "payment", "assistant", "profile"]);
  });

  it("gives the owner every link", () => {
    expect(setupSteps(reads(""), "owner").every((s) => s.href !== undefined)).toBe(true);
  });
});

describe("isOwnerOnlyHref", () => {
  it("covers the owner-only sections and their subpages, not the agent's", () => {
    for (const h of ["/panel/channels", "/panel/payments", "/panel/credit", "/panel/shipping", "/panel/assistant", "/panel/channels/instagram/return"])
      expect(isOwnerOnlyHref(h)).toBe(true);
    for (const h of ["/panel", "/panel/inbox", "/panel/orders", "/panel/products", "/panel/returns", "/panel/settings"]) expect(isOwnerOnlyHref(h)).toBe(false);
  });
});
