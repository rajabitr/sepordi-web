import { en } from "@/lib/utils";

import { stockLevel, type ProductView, type StockLevel } from "./catalog";

/*
 * Search and filters over the products the page has loaded. The Partner API's list takes no query, so this never
 * reaches past what was fetched; the page says so and offers to load the rest.
 */

export type StatusFilter = "active" | "archived" | "all";
export type StockFilter = StockLevel | "all";

export interface ProductFilters {
  q: string;
  category: string;
  status: StatusFilter;
  stock: StockFilter;
}

export const DEFAULT_FILTERS: ProductFilters = { q: "", category: "", status: "active", stock: "all" };

const STATUSES: readonly StatusFilter[] = ["active", "archived", "all"];
const STOCKS: readonly StockFilter[] = ["all", "out", "low", "in", "unlimited"];
const MAX_PARAM = 200;

/**
 * Folds the spellings one word arrives in: Arabic ي ك ة and hamza forms, Persian, Arabic-Indic or Latin digits,
 * diacritics and tatweel, case, and every space or ZWNJ, so «تی شرت», «تيشرت» and «تی‌شرت» meet.
 */
export function normalizeSearch(input: string): string {
  return en(input)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[يىئ]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ةۀ]/g, "ه")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[\s‌‍‎‏]+/g, "");
}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function param(p: Params, key: string): string {
  const v = p instanceof URLSearchParams ? p.get(key) : p[key];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.slice(0, MAX_PARAM) : "";
}

export function parseFilters(p: Params): ProductFilters {
  const status = param(p, "status") as StatusFilter;
  const stock = param(p, "stock") as StockFilter;
  return {
    q: param(p, "q"),
    category: param(p, "category"),
    status: STATUSES.includes(status) ? status : DEFAULT_FILTERS.status,
    stock: STOCKS.includes(stock) ? stock : DEFAULT_FILTERS.stock,
  };
}

/** The filters onto `base`, defaults left out so a clean list has a clean URL; other params (cursor, all) stay. */
export function filtersToSearch(f: ProductFilters, base: URLSearchParams | string = ""): string {
  const out = new URLSearchParams(base);
  const set = (key: keyof ProductFilters, value: string) => {
    if (value && value !== DEFAULT_FILTERS[key]) out.set(key, value);
    else out.delete(key);
  };
  set("q", f.q.trim());
  set("category", f.category);
  set("status", f.status);
  set("stock", f.stock);
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** Anything narrower than the default view: what turns an empty list into «نتیجه‌ای پیدا نشد». */
export function isFiltered(f: ProductFilters): boolean {
  return Boolean(f.q.trim()) || Boolean(f.category) || f.status !== DEFAULT_FILTERS.status || f.stock !== DEFAULT_FILTERS.stock;
}

/** A category matches itself and its subcategories («پوشاک» covers «پوشاک > تی‌شرت»). */
function inCategory(category: string, wanted: string): boolean {
  const c = normalizeSearch(category);
  const w = normalizeSearch(wanted);
  return c === w || c.startsWith(`${w}>`);
}

export function filterProducts(products: readonly ProductView[], f: ProductFilters): ProductView[] {
  const q = normalizeSearch(f.q);
  return products.filter(
    (p) =>
      (f.status === "all" || (f.status === "active" ? p.active : !p.active)) &&
      (!f.category || inCategory(p.category, f.category)) &&
      (f.stock === "all" || stockLevel(p).level === f.stock) &&
      (!q || normalizeSearch(p.title).includes(q) || normalizeSearch(p.sku).includes(q)),
  );
}

/** The loaded products' categories and every parent of each, in Persian order. */
export function categoryOptions(products: readonly ProductView[]): string[] {
  const seen = new Map<string, string>();
  for (const p of products) {
    const parts = p.category.split(">").map((s) => s.trim()).filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const label = parts.slice(0, i).join(" > ");
      const key = normalizeSearch(label);
      if (!seen.has(key)) seen.set(key, label);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fa"));
}
