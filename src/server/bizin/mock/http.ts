import "server-only";

import type { MockTenant, MockWorld } from "./state";

/* The mock gateway's primitives, shared by the route tables (router.ts, booking.ts). */

export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly field?: string,
    readonly params?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const fail = (status: number, code: string, field?: string, params?: Record<string, unknown>): never => {
  throw new MockHttpError(status, code, field, params);
};

export interface Ctx {
  world: MockWorld;
  params: string[];
  query: URLSearchParams;
  body: unknown;
  form?: FormData;
  now: number;
}

export type Result = { status: number; json?: unknown; bytes?: { mime: string; data: Buffer } };
export type Handler = (c: Ctx) => Result | Promise<Result>;

export const ok = (json: unknown, status = 200): Result => ({ status, json });
export const noContent = (): Result => ({ status: 204 });
export const iso = (ms: number) => new Date(ms).toISOString();

export function tenant(c: Ctx): MockTenant {
  return c.world.tenants.get(c.params[0]) ?? fail(404, "tenant_not_found");
}

export function obj(c: Ctx): Record<string, unknown> {
  if (c.body === undefined || c.body === null) return {};
  if (typeof c.body !== "object" || Array.isArray(c.body)) fail(400, "bad_request_body");
  return c.body as Record<string, unknown>;
}

export function page<T>(c: Ctx, items: T[], max = 100): { items: T[]; next_cursor: string | null } {
  const limit = c.query.has("limit") ? Number(c.query.get("limit")) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > max) fail(400, "limit_invalid", undefined, { max });
  const cursor = c.query.get("cursor");
  const offset = cursor ? Number(Buffer.from(cursor, "base64url").toString()) : 0;
  if (!Number.isInteger(offset) || offset < 0) fail(400, "invalid_value", "cursor");
  const next = offset + limit < items.length ? Buffer.from(String(offset + limit)).toString("base64url") : null;
  return { items: items.slice(offset, offset + limit), next_cursor: next };
}
