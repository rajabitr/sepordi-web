import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { IMAGE_FILE_RE, MAX_IMAGE_BYTES, sniffImage } from "./magic";

/*
 * Product pictures sepordi hosts so Bizin can fetch them: the Partner API sets a product's pictures only from a
 * catalogue import file's `image_urls`. Files are public by name (random UUIDs) under `products/`; which file
 * belongs to which shop and product lives only in `shops/<shop id>.json`, and every change goes through it.
 */

export const MAX_IMAGES_PER_PRODUCT = 8;

export interface ProductImage {
  file: string;
  mime: string;
  bytes: number;
  sha256: string;
  created_at: string;
  /** When a job that fetched it finished cleanly. Bizin only appends pictures, so a sent one is fixed there. */
  sent_at: string | null;
}

export interface ProductImages {
  images: ProductImage[];
  /** The job that is fetching these files now; nothing of the product changes until it settles. */
  pending: { job_id: string; files: string[] } | null;
}

interface ShopRecord {
  products: Record<string, ProductImages>;
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

const SHOP_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function mediaDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.SEPORDI_MEDIA_DIR || (process.env.NODE_ENV === "production" ? "/var/lib/sepordi/media" : "./data/media"));
}

/** The absolute path of a stored picture, or null for any name that is not one. */
export function imagePath(file: string): string | null {
  return IMAGE_FILE_RE.test(file) ? path.join(mediaDir(), "products", file) : null;
}

export function publicImagePath(file: string): string {
  return `/p/img/${file}`;
}

function recordPath(shopId: string): string {
  if (!SHOP_ID_RE.test(shopId)) throw new Error("product-images: invalid shop id");
  return path.join(mediaDir(), "shops", `${shopId}.json`);
}

async function readRecord(shopId: string): Promise<ShopRecord> {
  let raw: string;
  try {
    raw = await readFile(recordPath(shopId), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { products: {} };
    throw e;
  }
  const parsed = JSON.parse(raw) as Partial<ShopRecord>;
  return { products: parsed.products && typeof parsed.products === "object" ? parsed.products : {} };
}

async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

const locks = new Map<string, Promise<unknown>>();

/** One read-modify-write of a shop's record at a time; the service is a single process. */
function withShop<T>(shopId: string, fn: (rec: ShopRecord) => Promise<{ value: T; changed: boolean }>): Promise<T> {
  const prev = locks.get(shopId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const rec = await readRecord(shopId);
    const { value, changed } = await fn(rec);
    if (changed) await writeAtomic(recordPath(shopId), JSON.stringify(rec));
    return value;
  });
  const tail = run.catch(() => undefined);
  locks.set(shopId, tail);
  void tail.then(() => {
    if (locks.get(shopId) === tail) locks.delete(shopId);
  });
  return run;
}

const entryOf = (rec: ShopRecord, productExt: string): ProductImages =>
  (rec.products[productExt] ??= { images: [], pending: null });

const fail = (status: number, message: string) => ({ ok: false as const, status, message });

export async function getProductImages(shopId: string, productExt: string): Promise<ProductImages> {
  const rec = await readRecord(shopId);
  return rec.products[productExt] ?? { images: [], pending: null };
}

/** The first picture of every product of the shop that has one, by product ext. */
export async function firstImages(shopId: string): Promise<Record<string, string>> {
  const rec = await readRecord(shopId);
  const out: Record<string, string> = {};
  for (const [ext, p] of Object.entries(rec.products)) if (p.images[0]) out[ext] = p.images[0].file;
  return out;
}

export async function addProductImage(shopId: string, productExt: string, bytes: Uint8Array): Promise<StoreResult<ProductImage>> {
  if (bytes.byteLength === 0) return fail(400, "فایل عکس خالی است.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) return fail(413, "حجم هر عکس باید کمتر از ۵ مگابایت باشد.");
  const kind = sniffImage(bytes);
  if (!kind) return fail(415, "فقط عکس JPEG، PNG یا WebP قبول می‌شود.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return withShop<StoreResult<ProductImage>>(shopId, async (rec) => {
    const entry = entryOf(rec, productExt);
    if (entry.pending) return { value: fail(409, "عکس‌های این محصول در حال فرستادن است. چند لحظه بعد دوباره امتحان کنید."), changed: false };
    if (entry.images.length >= MAX_IMAGES_PER_PRODUCT) return { value: fail(409, "هر محصول حداکثر هشت عکس دارد."), changed: false };
    if (entry.images.some((i) => i.sha256 === sha256)) return { value: fail(409, "این عکس قبلاً برای همین محصول اضافه شده است."), changed: false };
    const file = `${randomUUID()}.${kind.ext}`;
    await writeAtomic(imagePath(file)!, bytes);
    const image: ProductImage = { file, mime: kind.mime, bytes: bytes.byteLength, sha256, created_at: new Date().toISOString(), sent_at: null };
    entry.images.push(image);
    return { value: { ok: true as const, value: image }, changed: true };
  });
}

/** Only a picture not yet sent: Bizin keeps every picture it fetched, so dropping a sent one here would lie. */
export async function removeProductImage(shopId: string, productExt: string, file: string): Promise<StoreResult<null>> {
  const removed = await withShop<StoreResult<null>>(shopId, async (rec) => {
    const entry = rec.products[productExt];
    const image = entry?.images.find((i) => i.file === file);
    if (!entry || !image) return { value: fail(404, "این عکس پیدا نشد."), changed: false };
    if (image.sent_at) return { value: fail(409, "عکسی که به دستیار فرستاده شده، از این‌جا پاک نمی‌شود."), changed: false };
    if (entry.pending?.files.includes(file)) return { value: fail(409, "این عکس در حال فرستادن است."), changed: false };
    entry.images = entry.images.filter((i) => i !== image);
    return { value: { ok: true as const, value: null }, changed: true };
  });
  if (removed.ok) await unlink(imagePath(file)!).catch(() => undefined);
  return removed;
}

/**
 * Starts a send: puts the unsent pictures in `order` (exactly the unsent files, in any order) after the sent ones
 * and returns them. `start` creates the job; the files are marked pending only if it answers.
 */
export async function beginSend(
  shopId: string,
  productExt: string,
  order: readonly string[],
  start: (files: ProductImage[]) => Promise<string>,
): Promise<StoreResult<{ jobId: string; files: ProductImage[] }>> {
  return withShop<StoreResult<{ jobId: string; files: ProductImage[] }>>(shopId, async (rec) => {
    const entry = entryOf(rec, productExt);
    if (entry.pending) return { value: fail(409, "عکس‌های این محصول در حال فرستادن است."), changed: false };
    const sent = entry.images.filter((i) => i.sent_at);
    const unsent = entry.images.filter((i) => !i.sent_at);
    if (!unsent.length) return { value: fail(400, "عکس تازه‌ای برای فرستادن نیست."), changed: false };
    const byFile = new Map(unsent.map((i) => [i.file, i]));
    if (order.length !== unsent.length || new Set(order).size !== order.length || !order.every((f) => byFile.has(f))) {
      return { value: fail(409, "فهرست عکس‌ها عوض شده است. صفحه را تازه کنید."), changed: false };
    }
    const files = order.map((f) => byFile.get(f)!);
    const jobId = await start(files);
    entry.images = [...sent, ...files];
    entry.pending = { job_id: jobId, files: files.map((i) => i.file) };
    return { value: { ok: true as const, value: { jobId, files } }, changed: true };
  });
}

/** Ends the pending send of `jobId`; `sent` marks its files fixed. A different or no pending job is a no-op. */
export async function settleSend(shopId: string, productExt: string, jobId: string, sent: boolean): Promise<void> {
  await withShop(shopId, async (rec) => {
    const entry = rec.products[productExt];
    if (!entry?.pending || entry.pending.job_id !== jobId) return { value: undefined, changed: false };
    if (sent) {
      const at = new Date().toISOString();
      for (const i of entry.images) if (entry.pending.files.includes(i.file)) i.sent_at = at;
    }
    entry.pending = null;
    return { value: undefined, changed: true };
  });
}
