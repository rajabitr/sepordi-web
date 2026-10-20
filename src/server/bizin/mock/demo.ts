import "server-only";

import { mulberry32 } from "@/lib/utils";

/**
 * The mock world's demo shops and the ids derived from them. Kept apart from `fixtures.ts` because
 * `src/server/db/seed.ts` links the demo seller to the first shop and must not pull the whole mock into the database
 * module.
 */
export const DEMO_SHOPS = [
  { ext: "demo-nila", name: "گالری نیلا", flavor: "jewelry", ownerEmail: "owner1@demo.sepordi.ir" },
  { ext: "demo-rasta", name: "قهوه‌ی رستا", flavor: "coffee", ownerEmail: "owner2@demo.sepordi.ir" },
] as const;

export type Rand = () => number;

export function uuidFrom(rand: Rand): string {
  const h = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16)).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A tenant's whole fixture stream; its first draw is the tenant id. */
export function tenantRand(ext: string): Rand {
  return mulberry32(hash(ext));
}

export function mockTenantId(ext: string): string {
  return uuidFrom(tenantRand(ext));
}

/** The demo owner's `external_user_id`, which Sepordi sends as its own user id. */
export function demoOwnerId(ext: string): string {
  return uuidFrom(mulberry32(hash(`owner:${ext}`)));
}
