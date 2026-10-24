import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductDraft } from "@/components/panel/products/catalog";

const api = { getProduct: vi.fn(), putProduct: vi.fn() };
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/server/auth/session", () => {
  const seller = async () => ({ user: { id: "u1" }, shop: { id: "s1", external_business_id: "shop-1" }, role: "owner" });
  return { requireSeller: seller, requireCapability: seller };
});
vi.mock("@/server/audit", () => ({ recordActivity: vi.fn() }));
vi.mock("@/server/bizin/client", () => ({
  getProduct: (...a: unknown[]) => api.getProduct(...a),
  putProduct: (...a: unknown[]) => api.putProduct(...a),
  deleteProduct: vi.fn(),
  commitCatalogImportJob: vi.fn(),
  cancelCatalogImportJob: vi.fn(),
}));

const { saveProductAction } = await import("./actions");

const draft = (stockA: string): ProductDraft => ({
  title: "تی‌شرت",
  description: "",
  category: "",
  sku: "",
  active: true,
  variants: [
    { key: "a", ext: "v_a", title: "M", price: "100", stock: stockA, unlimited: false, base: { stock: 10 } },
    { key: "b", ext: "v_b", title: "L", price: "100", stock: "۴", unlimited: false, base: { stock: 4 } },
  ],
});
const live = (a: number, b: number) => ({
  external_id: "tee",
  variants: [
    { external_id: "v_a", stock: a, active: true },
    { external_id: "v_b", stock: b, active: true },
  ],
});

beforeEach(() => {
  api.getProduct.mockReset();
  api.putProduct.mockReset();
  api.putProduct.mockResolvedValue({ created: false });
});

describe("saveProductAction stock (S2)", () => {
  it("reads the product right before the PUT and sends the live level of untouched variants", async () => {
    api.getProduct.mockResolvedValue(live(8, 3));
    const r = await saveProductAction("tee", draft("۱۰"));
    expect(r).toMatchObject({ ok: true, stocks: { v_a: 8, v_b: 3 } });
    expect(api.getProduct).toHaveBeenCalledWith("shop-1", "tee");
    expect(api.putProduct.mock.calls[0][2].variants.map((v: { stock: number }) => v.stock)).toEqual([8, 3]);
  });

  it("refuses to overwrite a level that moved under the seller's change", async () => {
    api.getProduct.mockResolvedValue(live(8, 4));
    const r = await saveProductAction("tee", draft("۱۵"));
    expect(r).toMatchObject({ ok: false, code: "stock_conflict", conflicts: [{ key: "a", base: 10, live: 8, mine: 15 }] });
    expect(api.putProduct).not.toHaveBeenCalled();
  });

  it("creates a new product without a read", async () => {
    const d = draft("۱۰");
    d.variants = d.variants.map((v) => ({ ...v, base: null }));
    await saveProductAction("tee", d);
    expect(api.getProduct).not.toHaveBeenCalled();
    expect(api.putProduct.mock.calls[0][2].variants.map((v: { stock: number }) => v.stock)).toEqual([10, 4]);
  });
});
