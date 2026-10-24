import { describe, expect, it } from "vitest";

import type { ProductView, VariantView } from "./catalog";
import { categoryOptions, DEFAULT_FILTERS, filterProducts, filtersToSearch, isFiltered, normalizeSearch, parseFilters } from "./filter";
import { collectPages, LOAD_ALL_CAP } from "./paging";

const v = (stock: number | null, active = true): VariantView => ({ id: "v", external_id: "v", title: "", price: 1, stock, active });
const p = (id: string, over: Partial<ProductView> = {}): ProductView => ({
  id,
  external_id: id,
  title: id,
  description: "",
  category: "",
  sku: "",
  active: true,
  variants: [v(null)],
  ...over,
});

const CATALOG = [
  p("tee", { title: "تی‌شرت نخی کلاسیک", sku: "TS-۱۰۱", category: "پوشاک > تی‌شرت", variants: [v(12)] }),
  p("cap", { title: "كلاه بافتنی", sku: "CP-7", category: "پوشاک", variants: [v(0)] }),
  p("ring", { title: "انگشتر نقره", sku: "RG-3", category: "زیورآلات", variants: [v(3)] }),
  p("old", { title: "شال قدیمی", category: "پوشاک", active: false }),
];
const titles = (f: Partial<typeof DEFAULT_FILTERS>) => filterProducts(CATALOG, { ...DEFAULT_FILTERS, ...f }).map((x) => x.id);

describe("normalizeSearch", () => {
  it("meets Arabic letters, Persian and Arabic-Indic digits, ZWNJ and spaces", () => {
    expect(normalizeSearch("تيشرت")).toBe(normalizeSearch("تی‌شرت"));
    expect(normalizeSearch("تی شرت")).toBe(normalizeSearch("تی‌شرت"));
    expect(normalizeSearch("كلاه")).toBe(normalizeSearch("کلاه"));
    expect(normalizeSearch("TS-١٠١")).toBe("ts-101");
    expect(normalizeSearch("آب")).toBe(normalizeSearch("اب"));
  });
});

describe("filterProducts", () => {
  it("searches title and sku across spellings", () => {
    expect(titles({ q: "تيشرت" })).toEqual(["tee"]);
    expect(titles({ q: "ts-101" })).toEqual(["tee"]);
    expect(titles({ q: "کلاه" })).toEqual(["cap"]);
    expect(titles({ q: "rg" })).toEqual(["ring"]);
    expect(titles({ q: "هیچ" })).toEqual([]);
  });

  it("filters by status, category with its subcategories, and stock state", () => {
    expect(titles({})).toEqual(["tee", "cap", "ring"]);
    expect(titles({ status: "archived" })).toEqual(["old"]);
    expect(titles({ status: "all", category: "پوشاک" })).toEqual(["tee", "cap", "old"]);
    expect(titles({ category: "پوشاک > تی‌شرت" })).toEqual(["tee"]);
    expect(titles({ stock: "out" })).toEqual(["cap"]);
    expect(titles({ stock: "low" })).toEqual(["ring"]);
    expect(titles({ stock: "in" })).toEqual(["tee"]);
    expect(titles({ status: "all", stock: "unlimited" })).toEqual(["old"]);
  });
});

describe("filters in the URL", () => {
  it("round-trips, drops defaults and keeps other params", () => {
    const f = { q: "تی شرت", category: "پوشاک", status: "all" as const, stock: "low" as const };
    const search = filtersToSearch(f, "cursor=abc");
    expect(parseFilters(new URLSearchParams(search))).toEqual(f);
    expect(new URLSearchParams(search).get("cursor")).toBe("abc");
    expect(filtersToSearch(DEFAULT_FILTERS, "q=x&all=1")).toBe("?all=1");
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, stock: "out" })).toBe(true);
  });

  it("ignores unknown values", () => {
    expect(parseFilters({ status: "deleted", stock: ["x"], q: ["a", "b"] })).toEqual({ ...DEFAULT_FILTERS, q: "a" });
  });

  it("offers every category and its parents once", () => {
    expect(categoryOptions(CATALOG)).toEqual(["پوشاک", "پوشاک > تی‌شرت", "زیورآلات"]);
  });
});

describe("collectPages", () => {
  const pages = (n: number, size = 100) => async (cursor: string | undefined) => {
    const i = cursor ? Number(cursor) : 0;
    return { products: Array.from({ length: size }, (_, k) => i * size + k), next_cursor: i + 1 < n ? String(i + 1) : null };
  };

  it("follows cursors to the end", async () => {
    const r = await collectPages(pages(3));
    expect(r.products).toHaveLength(300);
    expect(r.nextCursor).toBeNull();
  });

  it("stops at the cap and says where", async () => {
    let calls = 0;
    const fetch = pages(9);
    const r = await collectPages(async (c) => (calls++, fetch(c)));
    expect(r.products).toHaveLength(LOAD_ALL_CAP);
    expect(calls).toBe(5);
    expect(r.nextCursor).toBe("5");
  });

  it("does not loop on empty pages that keep a cursor", async () => {
    let calls = 0;
    const r = await collectPages(async () => {
      if (++calls > 20) throw new Error("runaway cursor loop");
      return { products: [], next_cursor: "same" };
    });
    expect(calls).toBe(5);
    expect(r.nextCursor).toBe("same");
  });
});
