import { rialToToman, tomanToRial } from "@/lib/money";
import { en, fa } from "@/lib/utils";

/*
 * The catalogue as the seller panel holds it. Pure and client-safe: the pages map the Partner API's objects onto
 * these shapes server-side, and the server actions run the same validation before anything is written.
 * Money: Rial in these shapes and in every payload, Toman only in form fields and on screen.
 */

export interface VariantView {
  id: string;
  external_id: string | null;
  title: string;
  price: number;
  stock: number | null;
  active: boolean;
}

export interface ProductView {
  id: string;
  external_id: string | null;
  title: string;
  description: string;
  category: string;
  sku: string;
  active: boolean;
  variants: VariantView[];
}

/** One row of the variants editor. `ext` is assigned on the first save and then reused, so a retry is the same PUT. */
export interface VariantDraft {
  key: string;
  ext: string | null;
  title: string;
  /** Toman as typed; Persian, Arabic-Indic and Latin digits and separators are all accepted. */
  price: string;
  /** Empty while «نامحدود» is on. */
  stock: string;
  unlimited: boolean;
  /** The level the form loaded, null on a row the seller added. A save keeps the live level of an unchanged row. */
  base: { stock: number | null } | null;
}

export interface ProductDraft {
  title: string;
  description: string;
  category: string;
  sku: string;
  active: boolean;
  variants: VariantDraft[];
}

export interface VariantPutBody {
  external_id: string;
  title?: string;
  price: number;
  stock: number | null;
}

export interface ProductPutBody {
  title: string;
  description: string;
  category: string;
  sku: string;
  active: boolean;
  variants: VariantPutBody[];
}

export const LIMITS = {
  title: 200,
  description: 4000,
  sku: 64,
  variantTitle: 120,
  variantsMin: 1,
  variantsMax: 200,
  stockMax: 100_000_000,
  /** Toman: ×10 must stay a safe integer in Rial. */
  priceMaxToman: Math.floor(Number.MAX_SAFE_INTEGER / 10),
  bodyBytes: 256 * 1024,
} as const;

/** At or below this many counted units a product is «کم». */
export const LOW_STOCK = 5;

/** Partner ids travel in URL paths: unreserved characters only, 1–128. */
const EXT_RE = /^[A-Za-z0-9._~-]{1,128}$/;

export function isValidExt(ext: string): boolean {
  return EXT_RE.test(ext);
}

export function newProductExt(): string {
  return `p_${crypto.randomUUID()}`;
}

export function newVariantExt(): string {
  return `v_${crypto.randomUUID()}`;
}

/**
 * A whole non-negative number typed by a seller: «۱٬۲۵۰٬۰۰۰», «1,250,000», «١٢٥٠» → 1250000. null when the text is
 * not one (a decimal point, a minus, letters).
 */
export function parseWholeNumber(input: string): number | null {
  const s = en(input.trim()).replace(/[\s,٬،_‌]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Thousands-grouped Persian digits for a field value as the seller types. */
export function groupDigits(input: string): string {
  const n = parseWholeNumber(input);
  if (n === null) return input;
  return fa(n.toLocaleString("en-US")).replace(/,/g, "٬");
}

const isStr = (v: unknown): v is string => typeof v === "string";

function isBase(b: unknown): boolean {
  if (b === null) return true;
  if (!b || typeof b !== "object") return false;
  const s = (b as Record<string, unknown>).stock;
  return s === null || (typeof s === "number" && Number.isSafeInteger(s) && s >= 0);
}

/** A Server Action argument is whatever the client sent: check the shape before reading it. */
export function isProductDraft(x: unknown): x is ProductDraft {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return (
    isStr(d.title) && isStr(d.description) && isStr(d.category) && isStr(d.sku) && typeof d.active === "boolean" &&
    Array.isArray(d.variants) &&
    d.variants.length <= LIMITS.variantsMax &&
    d.variants.every((v: unknown) => {
      if (!v || typeof v !== "object") return false;
      const r = v as Record<string, unknown>;
      return (
        isStr(r.key) && (r.ext === null || isStr(r.ext)) && isStr(r.title) && isStr(r.price) && isStr(r.stock) && typeof r.unlimited === "boolean" &&
        isBase(r.base)
      );
    })
  );
}

export type DraftErrors = Partial<Record<"title" | "description" | "sku" | "variants", string>> & {
  rows?: Record<string, Partial<Record<"title" | "price" | "stock", string>>>;
};

export function hasErrors(e: DraftErrors): boolean {
  return Boolean(e.title || e.description || e.sku || e.variants || (e.rows && Object.keys(e.rows).length));
}

/** Bizin refuses a product PUT over 256 KiB as `bad_request_body`. */
export function bodyTooLarge(body: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(body)).length > LIMITS.bodyBytes;
}

/**
 * The PUT body for a draft, or the field errors that stop it. Every variant must already carry its `ext`.
 * Strict: only the documented fields, so Bizin's strict decoder never sees an unknown one.
 */
export function buildProductPut(draft: ProductDraft): { body: ProductPutBody; errors: null } | { body: null; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "نام محصول را وارد کنید.";
  else if (title.length > LIMITS.title) errors.title = `نام محصول حداکثر ${fa(LIMITS.title)} نویسه است.`;
  const description = draft.description.trim();
  if (description.length > LIMITS.description) errors.description = `توضیحات حداکثر ${fa(LIMITS.description)} نویسه است.`;
  const sku = draft.sku.trim();
  if (sku.length > LIMITS.sku) errors.sku = `کد کالا حداکثر ${fa(LIMITS.sku)} نویسه است.`;

  const n = draft.variants.length;
  if (n < LIMITS.variantsMin) errors.variants = "دست‌کم یک تنوع با قیمت لازم است.";
  else if (n > LIMITS.variantsMax) errors.variants = `حداکثر ${fa(LIMITS.variantsMax)} تنوع مجاز است.`;

  const rows: NonNullable<DraftErrors["rows"]> = {};
  const seenTitles = new Set<string>();
  const variants: VariantPutBody[] = [];
  for (const v of draft.variants) {
    const rowErr: Partial<Record<"title" | "price" | "stock", string>> = {};
    const vTitle = v.title.trim();
    if (n > 1 && !vTitle) rowErr.title = "وقتی چند تنوع دارید، هر کدام نام لازم دارد.";
    else if (vTitle.length > LIMITS.variantTitle) rowErr.title = `نام تنوع حداکثر ${fa(LIMITS.variantTitle)} نویسه است.`;
    else if (vTitle && seenTitles.has(vTitle)) rowErr.title = "این نام برای تنوع دیگری هم آمده است.";
    if (vTitle) seenTitles.add(vTitle);

    const toman = parseWholeNumber(v.price);
    if (!v.price.trim()) rowErr.price = "قیمت را به تومان وارد کنید.";
    else if (toman === null) rowErr.price = "قیمت باید عدد صحیح و بدون اعشار باشد.";
    else if (toman > LIMITS.priceMaxToman) rowErr.price = "این قیمت بیش از حد بزرگ است.";

    let stock: number | null = null;
    if (!v.unlimited) {
      const s = parseWholeNumber(v.stock);
      if (!v.stock.trim()) rowErr.stock = "موجودی را وارد کنید یا «نامحدود» را روشن کنید.";
      else if (s === null) rowErr.stock = "موجودی باید عدد صحیح و بدون اعشار باشد.";
      else if (s > LIMITS.stockMax) rowErr.stock = `موجودی حداکثر ${fa("100,000,000").replace(/,/g, "٬")} است.`;
      else stock = s;
    }

    if (Object.keys(rowErr).length) rows[v.key] = rowErr;
    else if (v.ext && toman !== null) {
      variants.push({ external_id: v.ext, ...(vTitle ? { title: vTitle } : {}), price: tomanToRial(toman), stock });
    }
  }
  if (Object.keys(rows).length) errors.rows = rows;
  if (hasErrors(errors)) return { body: null, errors };
  if (variants.length !== n) return { body: null, errors: { variants: "تنوع‌ها کامل نیستند. دوباره ذخیره کنید." } };

  const body: ProductPutBody = { title, description, category: draft.category.trim(), sku, active: draft.active, variants };
  if (bodyTooLarge(body)) {
    return { body: null, errors: { variants: "این محصول بیش از حد بزرگ است. توضیحات یا تعداد تنوع‌ها را کم کنید." } };
  }
  return { body, errors: null };
}

/**
 * The draft of a stored product. Only active variants that carry a partner id are editable: a PUT that leaves a
 * variant out deactivates it, and a panel-made variant (no `external_id`) cannot be named in a PUT at all.
 */
export function draftFromProduct(p: ProductView): { draft: ProductDraft; panelOnlyVariants: string[] } {
  const editable = p.variants.filter((v) => v.active && v.external_id);
  const panelOnlyVariants = p.variants.filter((v) => v.active && !v.external_id).map((v) => v.title || "بدون نام");
  return {
    draft: {
      title: p.title,
      description: p.description,
      category: p.category,
      sku: p.sku,
      active: p.active,
      variants: editable.length
        ? editable.map((v, i) => ({
            key: `v${i}`,
            ext: v.external_id,
            title: v.title,
            price: groupDigits(String(rialToToman(v.price))),
            stock: v.stock === null ? "" : groupDigits(String(v.stock)),
            unlimited: v.stock === null,
            base: { stock: v.stock },
          }))
        : [{ key: "v0", ext: null, title: "", price: "", stock: "", unlimited: true, base: null }],
    },
    panelOnlyVariants,
  };
}

/** True when the row's stock differs from the level the form loaded; a new row always counts as changed. */
export function stockChanged(v: VariantDraft): boolean {
  if (!v.base) return true;
  return (v.unlimited ? null : parseWholeNumber(v.stock)) !== v.base.stock;
}

export interface StockConflict {
  key: string;
  ext: string;
  title: string;
  /** What the form loaded, what Bizin holds now, and what the seller typed; null is «نامحدود». */
  base: number | null;
  live: number | null;
  mine: number | null;
}

/**
 * A PUT sets stock to exactly the number it carries, so a body built from what the form loaded would undo every sale
 * since. An unchanged row takes the live level; a changed row whose live level moved since the load is a conflict
 * the seller decides. `live` is null when the product does not exist yet.
 */
export function reconcileStock(
  draft: ProductDraft,
  body: ProductPutBody,
  live: readonly Pick<VariantView, "external_id" | "stock">[] | null,
): { body: ProductPutBody; conflicts: null } | { body: null; conflicts: StockConflict[] } {
  if (!live) return { body, conflicts: null };
  const liveByExt = new Map(live.filter((v) => v.external_id).map((v) => [v.external_id as string, v.stock]));
  const rowByExt = new Map(draft.variants.filter((v) => v.ext).map((v) => [v.ext as string, v]));
  const conflicts: StockConflict[] = [];
  const variants = body.variants.map((bv) => {
    const row = rowByExt.get(bv.external_id);
    if (!row?.base || !liveByExt.has(bv.external_id)) return bv;
    const now = liveByExt.get(bv.external_id) as number | null;
    if (!stockChanged(row)) return { ...bv, stock: now };
    if (now !== row.base.stock) {
      conflicts.push({ key: row.key, ext: bv.external_id, title: row.title.trim(), base: row.base.stock, live: now, mine: bv.stock });
    }
    return bv;
  });
  if (conflicts.length) return { body: null, conflicts };
  return { body: { ...body, variants }, conflicts: null };
}

/** The seller's change carried onto the live level: a restock of +5 stays +5 after the sales in between. */
export function reapplyStock(c: StockConflict): number | null {
  if (c.mine === null || c.base === null || c.live === null) return c.mine;
  return Math.min(LIMITS.stockMax, Math.max(0, c.live + (c.mine - c.base)));
}

/**
 * The draft after the seller resolved the conflicts: «mine» keeps the typed numbers, «reapply» moves each by the
 * seller's change. Either way the baseline becomes the live level, so the next save checks against it.
 */
export function resolveStockConflicts(draft: ProductDraft, conflicts: readonly StockConflict[], mode: "mine" | "reapply"): ProductDraft {
  const byKey = new Map(conflicts.map((c) => [c.key, c]));
  return {
    ...draft,
    variants: draft.variants.map((v) => {
      const c = byKey.get(v.key);
      if (!c) return v;
      const target = mode === "mine" ? c.mine : reapplyStock(c);
      return { ...v, base: { stock: c.live }, unlimited: target === null, stock: target === null ? "" : groupDigits(String(target)) };
    }),
  };
}

const stockFa = (n: number | null) => (n === null ? "نامحدود" : fa(n.toLocaleString("en-US")).replace(/,/g, "٬"));

export function stockConflictLine(c: StockConflict, index: number): string {
  const name = c.title ? `«${c.title}»` : `تنوع ${fa(index + 1)}`;
  return `${name}: وقتی فرم را باز کردید ${stockFa(c.base)} بود و الان ${stockFa(c.live)} است؛ عدد شما ${stockFa(c.mine)}.`;
}

/** Min and max price of the active variants, in Rial; null when none is active. */
export function priceRange(p: ProductView): { min: number; max: number } | null {
  const prices = p.variants.filter((v) => v.active).map((v) => v.price);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export type StockLevel = "out" | "low" | "in" | "unlimited";

/**
 * Over the active variants: «نامحدود» when none is counted; otherwise by the counted total («ناموجود» at 0, «کم»
 * at LOW_STOCK or below). A mix of counted and uncounted variants can always sell, so it is never «ناموجود».
 */
export function stockLevel(p: ProductView): { level: StockLevel; counted: number | null } {
  const active = p.variants.filter((v) => v.active);
  if (!active.length) return { level: "out", counted: 0 };
  const counted = active.filter((v) => v.stock !== null);
  if (!counted.length) return { level: "unlimited", counted: null };
  const total = counted.reduce((s, v) => s + (v.stock ?? 0), 0);
  const someUncounted = counted.length < active.length;
  if (total === 0) return { level: someUncounted ? "in" : "out", counted: total };
  if (total <= LOW_STOCK && !someUncounted) return { level: "low", counted: total };
  return { level: "in", counted: total };
}

export const STOCK_LABEL: Record<StockLevel, string> = {
  out: "ناموجود",
  low: "کم",
  in: "موجود",
  unlimited: "نامحدود",
};

// ---- bulk import ------------------------------------------------------------------------------------------

export type ImportJobStatus = "ready" | "committing" | "done" | "error" | "expired" | "cancelled";

export interface ImportJobView {
  id: string;
  status: ImportJobStatus;
  format: string;
  filename: string;
  counts: { rows: number; valid: number; will_create: number; will_update: number; unchanged: number; failed: number };
  result: { created: number; updated: number; unchanged: number; failed: number; not_attempted: number } | null;
  error: string | null;
  warnings: { code: string; line: number; params: Record<string, unknown> }[];
  created_at: string;
  expires_at: string;
}

export interface ImportRowErrorView {
  line?: number;
  code: string;
  column?: string;
  field?: string;
  params: Record<string, unknown>;
}

export interface ImportRowView {
  line: number;
  external_id: string;
  title: string;
  action: string;
  errors: ImportRowErrorView[];
}

export const JOB_STATUS_LABEL: Record<ImportJobStatus, string> = {
  ready: "آماده‌ی ثبت",
  committing: "در حال ثبت",
  done: "ثبت شد",
  error: "خطا",
  expired: "منقضی شد",
  cancelled: "لغو شد",
};

const pLine = (p: Record<string, unknown>) => (typeof p.line === "number" ? ` (سطر ${fa(p.line)})` : "");

/** Every CatalogImportRowError code in Farsi. */
export const IMPORT_ROW_ERROR_FA: Record<string, (p: Record<string, unknown>) => string> = {
  required_missing: () => "این خانه خالی است و پر کردنش لازم است.",
  too_long: () => "متن این خانه بیش از حد طولانی است.",
  invalid_value: () => "مقدار این خانه درست نیست.",
  external_id_invalid: () => "شناسه فقط می‌تواند حروف و ارقام انگلیسی، خط تیره، زیرخط و نقطه باشد (حداکثر ۱۲۸ نویسه).",
  duplicate_in_file: (p) => `این شناسه قبلاً در همین فایل آمده است${pLine(p)}.`,
  entitlement_exceeded: () => "سقف تعداد محصولات طرح شما پر شده است.",
  id_precision_lost: () => "اکسل این شناسه را عدد خوانده و رقم‌هایش را از دست داده است. ستون را «متن» کنید.",
  formula_no_value: () => "این خانه فرمول بدون مقدار ذخیره‌شده است. فایل را در اکسل باز و دوباره ذخیره کنید.",
  price_invalid: () => "قیمت درست نیست.",
  price_not_integral: () => "قیمت باید عدد صحیح و بدون اعشار باشد.",
  price_negative: () => "قیمت نمی‌تواند منفی باشد.",
  stock_invalid: () => "موجودی درست نیست.",
  variant_external_id_taken: () => "محصول دیگری تنوعی با همین شناسه دارد.",
  title_missing: () => "نام محصول خالی است.",
  row_unreadable: () => "این سطر خوانده نشد.",
  write_failed: (p) => (p.reason === "sku_in_use" ? "محصول دیگری همین کد کالا (SKU) را دارد." : "ثبت این محصول انجام نشد."),
};

export function importRowErrorFa(e: ImportRowErrorView): string {
  return IMPORT_ROW_ERROR_FA[e.code]?.(e.params ?? {}) ?? "این سطر خطا دارد.";
}

/** File-wide warnings of a job. */
export const IMPORT_WARNING_FA: Record<string, string> = {
  sheet_ignored: "فقط اولین برگه‌ی اکسل خوانده شد؛ برگه‌های دیگر نادیده گرفته شدند.",
  formula_cached_value: "برای خانه‌های فرمول‌دار، مقدار ذخیره‌شده در اکسل خوانده شد.",
  merged_cells: "فایل خانه‌ی ادغام‌شده دارد؛ مقدارها را بررسی کنید.",
  rows_truncated: "فایل بیش از سقف ردیف‌ها بود و بقیه‌ی ردیف‌ها خوانده نشد.",
  image_skipped: "بعضی عکس‌ها از سقف هشت عکس هر محصول بیشتر بود و رد شد.",
  price_unit_mismatch: "واحد ستون قیمت با بازار فروشگاه نمی‌خواند و آن ستون خوانده نشد؛ قیمت را به ریال یا با ستون «قیمت (تومان)» بنویسید.",
};

export function importWarningFa(code: string): string {
  return IMPORT_WARNING_FA[code] ?? "نکته‌ای درباره‌ی فایل وجود دارد.";
}

export function isJobRunning(status: ImportJobStatus): boolean {
  return status === "committing";
}
