import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BizinError } from "./error";
import { bizinErrorMessage, toFarsiError } from "./errors-fa";

const doc = readFileSync(path.resolve(__dirname, "../../../docs/bizin/partner-api.md"), "utf8");

/** Every code in the §4 error table, including the `a` / `b` / `c` rows that list several. */
function documentedCodes(): string[] {
  const start = doc.indexOf("| Code | Status | Where |");
  const table = doc.slice(start, doc.indexOf("\n\n", start));
  const codes = new Set<string>();
  for (const line of table.split("\n").slice(2)) {
    const first = line.split("|")[1] ?? "";
    for (const m of first.matchAll(/`([a-z_]+)`/g)) codes.add(m[1]);
  }
  return [...codes];
}

describe("errors-fa", () => {
  it("has a Farsi message for every code in the contract's error table", () => {
    const codes = documentedCodes();
    expect(codes.length).toBeGreaterThan(60);
    const missing = codes.filter((c) => !bizinErrorMessage(c));
    expect(missing).toEqual([]);
  });

  it("fills params in Persian digits", () => {
    expect(bizinErrorMessage("rate_limited", { retry_after_seconds: 12 })).toContain("۱۲");
    expect(bizinErrorMessage("file_too_large", { max_mb: 8 })).toContain("۸");
  });

  it("falls back to a generic line that carries the request id", () => {
    const e = new BizinError({ status: 418, code: "brand_new_code", requestId: "req-abc" });
    expect(toFarsiError(e)).toMatchObject({ code: "brand_new_code", requestId: "req-abc" });
    expect(toFarsiError(e).message).toContain("req-abc");
    expect(toFarsiError(new Error("x")).message).toBe("کار انجام نشد. دوباره امتحان کنید.");
  });
});
