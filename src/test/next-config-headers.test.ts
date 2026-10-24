import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

type Rule = { source: string; headers: { key: string; value: string }[] };

// The options Next's router builds header matchers with (server/lib/router-utils/filesystem.js, buildCustomRoute).
const matches = (source: string, pathname: string) =>
  getPathMatch(source, { strict: true, removeUnnamedParams: true, regexModifier: (r) => modifyRouteRegex(r) })(pathname) !== false;

async function headersFor(pathname: string): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers!()) as Rule[];
  const out = new Map<string, string>();
  for (const rule of rules) if (matches(rule.source, pathname)) for (const h of rule.headers) out.set(h.key.toLowerCase(), h.value);
  return out;
}

const byteRoutes = [
  "/panel/media/7f0c2a52-0000-4000-8000-000000000001",
  "/panel/evidence/ord_1/ev_1",
  "/panel/case-photos/case_1/photo_1",
  "/panel/booking/receipts/bk_1/media_1",
  "/p/img/11111111-1111-4111-8111-111111111111.jpg",
];
const pages = ["/", "/panel", "/panel/inbox", "/panel/booking", "/panel/orders/ord_1", "/panel/mediafoo", "/login", "/p", "/api/notifications"];
const global = ["x-frame-options", "x-content-type-options", "permissions-policy"];

describe("next.config headers", () => {
  it.each(byteRoutes)("leaves the handler's sandbox CSP and no-referrer alone on %s", async (p) => {
    const h = await headersFor(p);
    expect(h.has("content-security-policy")).toBe(false);
    expect(h.has("referrer-policy")).toBe(false);
    for (const k of global) expect(h.has(k), k).toBe(true);
  });

  it.each(pages)("sends the page CSP and the global headers on %s", async (p) => {
    const h = await headersFor(p);
    expect(h.get("content-security-policy")).toContain("default-src 'self'");
    expect(h.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    for (const k of global) expect(h.has(k), k).toBe(true);
  });
});
