import { describe, expect, it } from "vitest";

import type { Schemas } from "@/server/bizin/schema";

import {
  bodyTooLarge,
  buildProductPut,
  draftFromProduct,
  IMPORT_ROW_ERROR_FA,
  isProductDraft,
  LIMITS,
  parseWholeNumber,
  priceRange,
  reapplyStock,
  reconcileStock,
  resolveStockConflicts,
  stockChanged,
  stockConflictLine,
  stockLevel,
  type ProductDraft,
  type ProductView,
  type VariantView,
} from "./catalog";
import { jalaliDate, jalaliDateTime } from "./format";

const variant = (over: Partial<VariantView> = {}): VariantView => ({
  id: "v",
  external_id: "v1",
  title: "",
  price: 125_000_000,
  stock: null,
  active: true,
  ...over,
});

const product = (variants: VariantView[], over: Partial<ProductView> = {}): ProductView => ({
  id: "p",
  external_id: "p_1",
  title: "تی‌شرت",
  description: "",
  category: "",
  sku: "",
  active: true,
  variants,
  ...over,
});

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
  title: "تی‌شرت نخی",
  description: "پنبه",
  category: "پوشاک",
  sku: "TS-1",
  active: true,
  variants: [{ key: "a", ext: "v_a", title: "", price: "۱۲٬۵۰۰٬۰۰۰", stock: "", unlimited: true, base: null }],
  ...over,
});

describe("parseWholeNumber", () => {
  it("reads Persian, Arabic-Indic and Latin digits with separators", () => {
    expect(parseWholeNumber("۱۲٬۵۰۰٬۰۰۰")).toBe(12_500_000);
    expect(parseWholeNumber("١٢٥٠")).toBe(1250);
    expect(parseWholeNumber(" 1,250,000 ")).toBe(1_250_000);
  });
  it("refuses decimals, negatives and text", () => {
    expect(parseWholeNumber("12.5")).toBeNull();
    expect(parseWholeNumber("-3")).toBeNull();
    expect(parseWholeNumber("ده")).toBeNull();
    expect(parseWholeNumber("")).toBeNull();
  });
});

describe("buildProductPut", () => {
  it("converts Toman to Rial and sends only documented fields", () => {
    const r = buildProductPut(draft());
    expect(r.errors).toBeNull();
    expect(r.body).toEqual({
      title: "تی‌شرت نخی",
      description: "پنبه",
      category: "پوشاک",
      sku: "TS-1",
      active: true,
      variants: [{ external_id: "v_a", price: 125_000_000, stock: null }],
    });
  });

  it("sends a counted stock and a variant title only when set", () => {
    const r = buildProductPut(
      draft({
        variants: [
          { key: "a", ext: "v_a", title: "M", price: "100", stock: "۱۴", unlimited: false, base: null },
          { key: "b", ext: "v_b", title: "L", price: "200", stock: "", unlimited: true, base: null },
        ],
      }),
    );
    expect(r.body?.variants).toEqual([
      { external_id: "v_a", title: "M", price: 1000, stock: 14 },
      { external_id: "v_b", title: "L", price: 2000, stock: null },
    ]);
  });

  it("puts each error under its field", () => {
    const r = buildProductPut(
      draft({
        title: " ",
        variants: [
          { key: "a", ext: "v_a", title: "", price: "12.5", stock: "", unlimited: false, base: null },
          { key: "b", ext: "v_b", title: "", price: "", stock: "", unlimited: true, base: null },
        ],
      }),
    );
    expect(r.body).toBeNull();
    expect(r.errors?.title).toBeTruthy();
    expect(r.errors?.rows?.a?.price).toContain("عدد صحیح");
    expect(r.errors?.rows?.a?.stock).toBeTruthy();
    expect(r.errors?.rows?.a?.title).toBeTruthy();
    expect(r.errors?.rows?.b?.price).toBeTruthy();
  });

  it("holds the variant count to 1–200 and stock to 100,000,000", () => {
    expect(buildProductPut(draft({ variants: [] })).errors?.variants).toBeTruthy();
    const many = Array.from({ length: LIMITS.variantsMax + 1 }, (_, i) => ({ key: `k${i}`, ext: `v${i}`, title: `t${i}`, price: "1", stock: "", unlimited: true, base: null }));
    expect(buildProductPut(draft({ variants: many })).errors?.variants).toBeTruthy();
    const r = buildProductPut(draft({ variants: [{ key: "a", ext: "v_a", title: "", price: "1", stock: "100000001", unlimited: false, base: null }] }));
    expect(r.errors?.rows?.a?.stock).toBeTruthy();
  });

  it("measures the 256 KiB cap in UTF-8 bytes", () => {
    expect(bodyTooLarge({ d: "ب".repeat(131_060) })).toBe(false);
    expect(bodyTooLarge({ d: "ب".repeat(131_070) })).toBe(true);
  });

  it("refuses a variant that has no id yet", () => {
    expect(buildProductPut(draft({ variants: [{ key: "a", ext: null, title: "", price: "1", stock: "", unlimited: true, base: null }] })).body).toBeNull();
  });
});

describe("isProductDraft", () => {
  it("accepts a draft and refuses a malformed one", () => {
    expect(isProductDraft(draft())).toBe(true);
    expect(isProductDraft({ ...draft(), active: "yes" })).toBe(false);
    expect(isProductDraft({ ...draft(), variants: [{ key: "a" }] })).toBe(false);
    expect(isProductDraft(null)).toBe(false);
  });
});

describe("draftFromProduct", () => {
  it("edits only active partner variants and shows Toman", () => {
    const { draft: d, panelOnlyVariants } = draftFromProduct(
      product([
        variant({ external_id: "a", title: "M", price: 125_000_000, stock: 3 }),
        variant({ external_id: "b", active: false }),
        variant({ external_id: null, title: "هدیه" }),
      ]),
    );
    expect(d.variants).toHaveLength(1);
    expect(d.variants[0]).toMatchObject({ ext: "a", title: "M", price: "۱۲٬۵۰۰٬۰۰۰", stock: "۳", unlimited: false, base: { stock: 3 } });
    expect(panelOnlyVariants).toEqual(["هدیه"]);
  });

  it("round-trips through buildProductPut to the same Rial price", () => {
    const { draft: d } = draftFromProduct(product([variant({ external_id: "a", price: 125_000_000, stock: 3 })]));
    expect(buildProductPut(d).body?.variants).toEqual([{ external_id: "a", price: 125_000_000, stock: 3 }]);
  });
});

describe("priceRange and stockLevel", () => {
  it("spans active variants only", () => {
    expect(priceRange(product([variant({ price: 10 }), variant({ price: 30 }), variant({ price: 1, active: false })]))).toEqual({ min: 10, max: 30 });
    expect(priceRange(product([variant({ active: false })]))).toBeNull();
  });

  it("names the stock level", () => {
    expect(stockLevel(product([variant({ stock: null })])).level).toBe("unlimited");
    expect(stockLevel(product([variant({ stock: 0 }), variant({ stock: 0 })])).level).toBe("out");
    expect(stockLevel(product([variant({ stock: 2 }), variant({ stock: 3 })]))).toEqual({ level: "low", counted: 5 });
    expect(stockLevel(product([variant({ stock: 6 })])).level).toBe("in");
    expect(stockLevel(product([variant({ stock: 0 }), variant({ stock: null })])).level).toBe("in");
    expect(stockLevel(product([variant({ stock: 9, active: false })])).level).toBe("out");
  });
});

describe("import row errors", () => {
  it("has Farsi for every code Bizin documents", () => {
    const codes: Record<Schemas["CatalogImportRowError"]["code"], true> = {
      required_missing: true,
      too_long: true,
      invalid_value: true,
      external_id_invalid: true,
      duplicate_in_file: true,
      entitlement_exceeded: true,
      id_precision_lost: true,
      formula_no_value: true,
      price_invalid: true,
      price_not_integral: true,
      price_negative: true,
      stock_invalid: true,
      variant_external_id_taken: true,
      title_missing: true,
      row_unreadable: true,
      write_failed: true,
    };
    for (const code of Object.keys(codes)) expect(IMPORT_ROW_ERROR_FA[code], code).toBeTypeOf("function");
  });
});

describe("Jalali dates", () => {
  it("formats in Asia/Tehran with Persian digits", () => {
    expect(jalaliDateTime("2026-10-20T10:05:00Z")).toBe("۲۸ مهر ۱۴۰۵ ساعت ۱۳:۳۵");
    expect(jalaliDate("2026-10-20T22:05:00Z")).toBe("۲۹ مهر ۱۴۰۵");
    expect(jalaliDateTime(null)).toBe("");
  });
});

describe("stock against the live level (S2)", () => {
  const loaded = (stock: string, base: number | null, ext = "v_a", key = "a"): ProductDraft["variants"][number] => ({
    key,
    ext,
    title: key === "a" ? "M" : "L",
    price: "100",
    stock,
    unlimited: base === null && stock === "",
    base: { stock: base },
  });
  const put = (d: ProductDraft) => buildProductPut(d).body!;

  it("keeps a sale made after the form loaded when the seller did not touch stock", () => {
    const d = draft({ variants: [loaded("۱۰", 10), loaded("۴", 4, "v_b", "b")] });
    const r = reconcileStock(d, put(d), [
      { external_id: "v_a", stock: 8 },
      { external_id: "v_b", stock: 4 },
    ]);
    expect(r.conflicts).toBeNull();
    expect(r.body?.variants.map((v) => v.stock)).toEqual([8, 4]);
  });

  it("writes a changed level when nothing moved since the load", () => {
    const d = draft({ variants: [loaded("۱۵", 10)] });
    const r = reconcileStock(d, put(d), [{ external_id: "v_a", stock: 10 }]);
    expect(r.body?.variants[0].stock).toBe(15);
  });

  it("refuses a changed level whose live level moved, with both numbers", () => {
    const d = draft({ variants: [loaded("۱۵", 10)] });
    const r = reconcileStock(d, put(d), [{ external_id: "v_a", stock: 8 }]);
    expect(r.body).toBeNull();
    expect(r.conflicts).toEqual([{ key: "a", ext: "v_a", title: "M", base: 10, live: 8, mine: 15 }]);
    expect(stockConflictLine(r.conflicts![0], 0)).toBe("«M»: وقتی فرم را باز کردید ۱۰ بود و الان ۸ است؛ عدد شما ۱۵.");
  });

  it("treats turning counting on or off as a change and a new row as the seller's own", () => {
    expect(stockChanged(loaded("", null))).toBe(false);
    expect(stockChanged({ ...loaded("", null), unlimited: false, stock: "3" })).toBe(true);
    expect(stockChanged({ ...loaded("۵", 5), unlimited: true, stock: "" })).toBe(true);
    const fresh = { ...loaded("۷", 0, "v_n", "n"), base: null };
    const d = draft({ variants: [fresh] });
    expect(reconcileStock(d, put(d), []).body?.variants[0].stock).toBe(7);
    expect(reconcileStock(d, put(d), null).body?.variants[0].stock).toBe(7);
  });

  it("re-applies the seller's change onto the live level, or keeps the typed number", () => {
    const c = { key: "a", ext: "v_a", title: "M", base: 10, live: 8, mine: 15 };
    expect(reapplyStock(c)).toBe(13);
    expect(reapplyStock({ ...c, mine: 2 })).toBe(0);
    expect(reapplyStock({ ...c, mine: null })).toBeNull();
    const d = draft({ variants: [loaded("۱۵", 10)] });
    const re = resolveStockConflicts(d, [c], "reapply");
    expect(re.variants[0]).toMatchObject({ stock: "۱۳", unlimited: false, base: { stock: 8 } });
    expect(reconcileStock(re, put(re), [{ external_id: "v_a", stock: 8 }]).body?.variants[0].stock).toBe(13);
    const mine = resolveStockConflicts(d, [c], "mine");
    expect(reconcileStock(mine, put(mine), [{ external_id: "v_a", stock: 8 }]).body?.variants[0].stock).toBe(15);
    expect(reconcileStock(mine, put(mine), [{ external_id: "v_a", stock: 6 }]).conflicts).toHaveLength(1);
  });

  it("refuses a draft whose baseline is not a whole level", () => {
    expect(isProductDraft(draft({ variants: [{ ...loaded("1", 1), base: { stock: -1 } }] }))).toBe(false);
    expect(isProductDraft({ ...draft(), variants: [{ ...loaded("1", 1), base: undefined }] })).toBe(false);
  });
});
