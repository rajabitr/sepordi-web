import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb, setDbForTests } from "@/server/db";
import { webhookEvents } from "@/server/db/repo";

import { POST } from "./route";

const SECRET = "whsec_route";

function request(body: string, headers: Record<string, string> = {}) {
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.`).update(body).digest("hex")}`;
  return new Request("https://sepordi.ir/api/bizin/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "bizin-signature": sig, "bizin-event-id": "evt_r1", ...headers },
    body,
  });
}

const BODY = JSON.stringify({ id: "evt_r1", type: "order.created", tenant: { id: "t", external_business_id: "biz-r" }, data: { code: "A-1" } });

beforeEach(() => {
  setDbForTests(openDb(":memory:"));
  vi.stubEnv("BIZIN_WEBHOOK_SECRETS", `whsec_new, ${SECRET}`);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  setDbForTests(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/bizin/webhook", () => {
  it("stores a signed delivery and answers 200 to its repeat", async () => {
    expect((await POST(request(BODY))).status).toBe(200);
    expect((await POST(request(BODY))).status).toBe(200);
    expect(webhookEvents.recentForExt("biz-r")).toHaveLength(1);
  });

  it("answers 400 to a forged signature and logs no body", async () => {
    const res = await POST(request(BODY, { "bizin-signature": "t=1,v1=00", "x-request-id": "req-9" }));
    expect(res.status).toBe(400);
    expect(webhookEvents.recentForExt("biz-r")).toHaveLength(0);
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).toContain("req-9");
    expect(logged).not.toContain("A-1");
  });

  it("refuses a declared oversized body without reading it", async () => {
    const res = await POST(request(BODY, { "content-length": String(10 * 1024 * 1024) }));
    expect(res.status).toBe(413);
  });
});
