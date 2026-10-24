import { readFile } from "node:fs/promises";

import { MIME_BY_EXT, type ImageKind } from "@/server/product-images/magic";
import { imagePath } from "@/server/product-images/store";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" } });

/**
 * A product picture, public: Bizin's servers fetch it from an import file and customers may see it. Names are
 * random UUIDs that never change content, so the answer is cacheable for good.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const p = imagePath(file);
  if (!p) return notFound();
  let data: Buffer;
  try {
    data = await readFile(p);
  } catch {
    return notFound();
  }
  const ext = file.slice(file.lastIndexOf(".") + 1) as ImageKind["ext"];
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext],
      "Content-Length": String(data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
