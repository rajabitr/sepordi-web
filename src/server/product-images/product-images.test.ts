import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/p/img/[file]/route";
import type { Schemas } from "@/server/bizin/schema";

import { buildImageImportCsv, IMAGE_IMPORT_COLUMNS } from "./csv";
import { MAX_IMAGE_BYTES, sniffImage } from "./magic";
import { addProductImage, beginSend, firstImages, getProductImages, imagePath, removeProductImage, settleSend } from "./store";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const bytes = (s: string) => new TextEncoder().encode(s);

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sepordi-img-"));
  process.env.SEPORDI_MEDIA_DIR = dir;
});
afterAll(async () => {
  delete process.env.SEPORDI_MEDIA_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("sniffImage", () => {
  it("reads the kind from the bytes", () => {
    expect(sniffImage(JPEG)).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffImage(PNG)).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImage(WEBP)).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("refuses anything else, however it is named", () => {
    expect(sniffImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(bytes("<!doctype html><html>"))).toBeNull();
    expect(sniffImage(bytes("GIF89a......"))).toBeNull();
    expect(sniffImage(bytes("RIFF$\0\0\0WAVEfmt "))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("is what an upload is judged by", async () => {
    const svg = await addProductImage("shop-sniff", "p1", bytes("<svg onload='alert(1)'/>"));
    expect(svg).toMatchObject({ ok: false, status: 415 });
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(await addProductImage("shop-sniff", "p1", big)).toMatchObject({ ok: false, status: 413 });
    expect((await getProductImages("shop-sniff", "p1")).images).toEqual([]);
  });
});

describe("GET /p/img/[file]", () => {
  const get = (file: string) => GET(new Request(`http://localhost/p/img/${encodeURIComponent(file)}`), { params: Promise.resolve({ file }) });

  it("serves a stored picture with its type, nosniff and an immutable cache", async () => {
    const added = await addProductImage("shop-serve", "p1", PNG);
    if (!added.ok) throw new Error(added.message);
    const res = await get(added.value.file);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it("refuses every name that is not a stored picture's, traversal included", async () => {
    await writeFile(path.join(dir, "secret.txt"), "secret");
    const record = await addProductImage("shop-trav", "p1", JPEG);
    if (!record.ok) throw new Error(record.message);
    const uuid = record.value.file.replace(/\.jpg$/, "");
    for (const file of [
      "../secret.txt",
      "..%2Fsecret.txt",
      "../shops/shop-trav.json",
      `../products/${record.value.file}`,
      `${uuid}.jpg/../../secret.txt`,
      `/${record.value.file}`,
      path.join(dir, "secret.txt"),
      `${uuid}.svg`,
      `${uuid}.JPG`,
      `${uuid}.jpg\0.png`,
      "shop-trav.json",
    ]) {
      const res = await get(file);
      expect(res.status, file).toBe(404);
      expect(await res.text(), file).not.toContain("secret");
    }
    expect(imagePath("../secret.txt")).toBeNull();
  });

  it("answers 404 for a well-formed name that was never stored", async () => {
    const res = await get("00000000-0000-4000-8000-000000000000.png");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("buildImageImportCsv", () => {
  const product: Schemas["Product"] = {
    id: "4c8e1a27-9b3d-4f60-a5e2-1d7c9f3b8e04",
    external_id: "tee-classic",
    title: "تی‌شرت «کلاسیک»",
    description: 'نخ پنبه، "سنگین"\nشست‌وشو با آب سرد',
    category: "پوشاک > تی‌شرت",
    sku: "TS-001",
    active: true,
    currency: "IRR",
    price_exponent: 0,
    variants: [
      { id: "v1", external_id: "tee-m", title: "M", price: 12500000, stock: 14, active: true },
      { id: "v2", external_id: "tee-l", title: "L", price: 13500000, stock: null, active: true },
      { id: "v3", external_id: "tee-xl", title: "XL", price: 1, stock: 0, active: false },
    ],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  const urls = ["https://sepordi.ir/p/img/a.jpg", "https://sepordi.ir/p/img/b.png"];

  /** The reading Bizin does: RFC 4180 with quoted commas, quotes and newlines. */
  function parse(csv: string): Record<string, string>[] {
    const rows: string[][] = [[]];
    let field = "";
    let quoted = false;
    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i];
      if (quoted) {
        if (ch === '"' && csv[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === "," || (ch === "\r" && csv[i + 1] === "\n")) {
        rows[rows.length - 1].push(field);
        field = "";
        if (ch === "\r") {
          rows.push([]);
          i++;
        }
      } else field += ch;
    }
    const [header, ...body] = rows.filter((r) => r.length > 1);
    return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  }

  it("writes the product as it stands, every active variant, plus image_urls", () => {
    const built = buildImageImportCsv(product, urls);
    if (!built.ok) throw new Error(built.message);
    expect(built.csv.split("\r\n")[0]).toBe(IMAGE_IMPORT_COLUMNS.join(","));
    const rows = parse(built.csv);
    expect(rows).toEqual([
      {
        external_id: "tee-classic",
        variant_external_id: "tee-m",
        title: "تی‌شرت «کلاسیک»",
        sku: "TS-001",
        description: 'نخ پنبه، "سنگین"\nشست‌وشو با آب سرد',
        category: "پوشاک > تی‌شرت",
        variant_name: "M",
        price: "12500000",
        stock_qty: "14",
        track_stock: "",
        status: "active",
        image_urls: urls.join("|"),
      },
      {
        external_id: "tee-classic",
        variant_external_id: "tee-l",
        title: "تی‌شرت «کلاسیک»",
        sku: "TS-001",
        description: "",
        category: "",
        variant_name: "L",
        price: "13500000",
        stock_qty: "",
        track_stock: "false",
        status: "active",
        image_urls: "",
      },
    ]);
  });

  it("keeps an archived product archived and prices in the display unit", () => {
    const built = buildImageImportCsv({ ...product, active: false, currency: "AED", price_exponent: 2, variants: [{ ...product.variants[0], price: 1205 }] }, urls);
    if (!built.ok) throw new Error(built.message);
    expect(parse(built.csv)[0]).toMatchObject({ status: "archived", price: "12.05" });
  });

  it("refuses a product a file would change: a panel-made variant, none active, no partner id", () => {
    const panelVariant = { ...product, variants: [...product.variants, { id: "v4", external_id: null, title: "S", price: 1, stock: 1, active: true }] };
    expect(buildImageImportCsv(panelVariant, urls).ok).toBe(false);
    expect(buildImageImportCsv({ ...product, variants: [product.variants[2]] }, urls).ok).toBe(false);
    expect(buildImageImportCsv({ ...product, external_id: null }, urls).ok).toBe(false);
    expect(buildImageImportCsv(product, []).ok).toBe(false);
  });
});

describe("image records are per shop", () => {
  it("never lets one shop see, remove or send another shop's picture", async () => {
    const a = await addProductImage("shop-a", "shared-ext", PNG);
    if (!a.ok) throw new Error(a.message);
    const file = a.value.file;

    expect((await getProductImages("shop-b", "shared-ext")).images).toEqual([]);
    expect(await firstImages("shop-b")).toEqual({});
    expect(await removeProductImage("shop-b", "shared-ext", file)).toMatchObject({ ok: false, status: 404 });
    expect(existsSync(imagePath(file)!)).toBe(true);

    let started = false;
    const send = await beginSend("shop-b", "shared-ext", [file], async () => {
      started = true;
      return "job-b";
    });
    expect(send.ok).toBe(false);
    expect(started).toBe(false);

    expect(await removeProductImage("shop-a", "other-ext", file)).toMatchObject({ ok: false, status: 404 });
    expect(await firstImages("shop-a")).toEqual({ "shared-ext": file });
    const recordA = JSON.parse(await readFile(path.join(dir, "shops", "shop-a.json"), "utf8"));
    expect(Object.keys(recordA.products)).toEqual(["shared-ext"]);
  });

  it("refuses a shop id that could leave the records directory", async () => {
    await expect(getProductImages("../shop-a", "shared-ext")).rejects.toThrow();
  });

  it("locks a sent picture and frees the rest", async () => {
    const one = await addProductImage("shop-c", "p", PNG);
    const two = await addProductImage("shop-c", "p", JPEG);
    if (!one.ok || !two.ok) throw new Error("upload");
    expect(await addProductImage("shop-c", "p", PNG)).toMatchObject({ ok: false, status: 409 });

    const sent = await beginSend("shop-c", "p", [two.value.file, one.value.file], async () => "job-1");
    expect(sent.ok).toBe(true);
    expect((await getProductImages("shop-c", "p")).images.map((i) => i.file)).toEqual([two.value.file, one.value.file]);
    expect(await removeProductImage("shop-c", "p", one.value.file)).toMatchObject({ ok: false, status: 409 });

    await settleSend("shop-c", "p", "job-other", true);
    expect((await getProductImages("shop-c", "p")).pending?.job_id).toBe("job-1");
    await settleSend("shop-c", "p", "job-1", true);
    const after = await getProductImages("shop-c", "p");
    expect(after.pending).toBeNull();
    expect(after.images.every((i) => i.sent_at)).toBe(true);
    expect(await removeProductImage("shop-c", "p", one.value.file)).toMatchObject({ ok: false, status: 409 });

    const three = await addProductImage("shop-c", "p", WEBP);
    if (!three.ok) throw new Error(three.message);
    expect(await removeProductImage("shop-c", "p", three.value.file)).toMatchObject({ ok: true });
    expect(existsSync(imagePath(three.value.file)!)).toBe(false);
  });
});
