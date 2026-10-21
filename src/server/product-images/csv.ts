import type { Schemas } from "@/server/bizin/schema";

/*
 * A catalogue import file that writes a product exactly as it is and adds pictures. A file import writes the
 * product as a PUT does (variants authoritative, stock set to the number sent), so every active variant goes in
 * with its current price and stock, and only the template's columns plus `status`, `track_stock` and `image_urls`
 * appear: any other column would become a line of the product's knowledge sheet.
 */

export const IMAGE_IMPORT_COLUMNS = [
  "external_id",
  "variant_external_id",
  "title",
  "sku",
  "description",
  "category",
  "variant_name",
  "price",
  "stock_qty",
  "track_stock",
  "status",
  "image_urls",
] as const;

function cell(v: string): string {
  return /[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A price in the market's storage unit as the file's `price` column reads it: the display unit (Rial for IRR). */
export function displayPrice(price: number, exponent: number): string {
  if (exponent <= 0) return String(price);
  const unit = 10 ** exponent;
  return `${Math.trunc(price / unit)}.${String(price % unit).padStart(exponent, "0")}`;
}

export function buildImageImportCsv(
  product: Schemas["Product"],
  imageUrls: readonly string[],
): { ok: true; csv: string } | { ok: false; message: string } {
  if (!product.external_id) return { ok: false, message: "این محصول از راه دیگری ساخته شده و این‌جا فقط قابل مشاهده است." };
  const active = product.variants.filter((v) => v.active);
  if (active.some((v) => !v.external_id)) {
    return { ok: false, message: "این محصول تنوعی دارد که از راه دیگری ساخته شده است؛ فرستادن عکس آن تنوع را غیرفعال می‌کرد و انجام نشد." };
  }
  if (!active.length) return { ok: false, message: "این محصول تنوع فعالی ندارد. اول یک تنوع با قیمت ثبت کنید." };
  if (!imageUrls.length) return { ok: false, message: "عکس تازه‌ای برای فرستادن نیست." };

  const lines = [IMAGE_IMPORT_COLUMNS.join(",")];
  active.forEach((v, i) => {
    const first = i === 0;
    const row: Record<(typeof IMAGE_IMPORT_COLUMNS)[number], string> = {
      external_id: product.external_id!,
      variant_external_id: v.external_id!,
      title: product.title,
      sku: product.sku,
      description: first ? product.description : "",
      category: first ? product.category : "",
      variant_name: v.title,
      price: displayPrice(v.price, product.price_exponent),
      stock_qty: v.stock === null ? "" : String(v.stock),
      track_stock: v.stock === null ? "false" : "",
      status: product.active ? "active" : "archived",
      image_urls: first ? imageUrls.join("|") : "",
    };
    lines.push(IMAGE_IMPORT_COLUMNS.map((c) => cell(row[c])).join(","));
  });
  return { ok: true, csv: lines.join("\r\n") + "\r\n" };
}
