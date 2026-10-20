import { describe, expect, it } from "vitest";

import { allowedCaseActions, casesHref, filteredCasesHref, isFinalCaseState, nextCasesHref, parseCaseFilters, prevCasesHref } from "./model";

describe("allowedCaseActions", () => {
  it("follows the Partner API's case moves", () => {
    expect(allowedCaseActions("open")).toEqual(["accept", "reject", "request_info", "close"]);
    expect(allowedCaseActions("awaiting_customer")).toEqual(["accept", "reject", "close"]);
    expect(allowedCaseActions("accepted")).toEqual(["mark_refunded", "mark_exchanged", "close"]);
  });

  it("offers nothing in a final or unknown state", () => {
    for (const s of ["rejected", "refunded", "exchanged", "closed", "escalated"]) {
      expect(allowedCaseActions(s)).toEqual([]);
      expect(isFinalCaseState(s)).toBe(true);
    }
    expect(isFinalCaseState("open")).toBe(false);
  });

  it("only refunds or exchanges an accepted case", () => {
    expect(allowedCaseActions("open")).not.toContain("mark_refunded");
    expect(allowedCaseActions("awaiting_customer")).not.toContain("mark_exchanged");
    expect(allowedCaseActions("accepted")).not.toContain("request_info");
  });
});

describe("case list URL", () => {
  it("drops unknown filters and keeps the page trail", () => {
    const f = parseCaseFilters({ state: "open", kind: "nonsense" });
    expect(f).toEqual({ state: "open", kind: undefined, cursor: undefined, back: [] });
    const next = nextCasesHref(f, "k2");
    expect(next).toBe("/panel/returns?state=open&cursor=k2&back=");
    const f2 = parseCaseFilters({ state: "open", cursor: "k2", back: "" });
    expect(prevCasesHref(f2)).toBe("/panel/returns?state=open");
    expect(casesHref({})).toBe("/panel/returns");
    expect(filteredCasesHref(parseCaseFilters({ state: "open", cursor: "k9", back: "k8" }), { kind: "return" })).toBe(
      "/panel/returns?state=open&kind=return",
    );
  });
});
