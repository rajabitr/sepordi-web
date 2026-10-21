/** The kinds a product picture may be. Bizin re-hosts all three; a WebP is kept as a JPEG there. */
export type ImageKind = { mime: "image/jpeg"; ext: "jpg" } | { mime: "image/png"; ext: "png" } | { mime: "image/webp"; ext: "webp" };

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The one shape a stored picture's name has: a random UUID and the extension its bytes earned. */
export const IMAGE_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const MIME_BY_EXT: Record<ImageKind["ext"], ImageKind["mime"]> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);

/** The kind the bytes are, never the name or the declared type; null for anything else. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  return null;
}
