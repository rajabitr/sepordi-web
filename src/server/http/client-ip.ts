import "server-only";

import { headers } from "next/headers";

/**
 * The visitor's IP. Requests reach the app through the CDN and a NAT router, so the socket address is always
 * the router: the client is the FIRST hop of X-Forwarded-For. Use it for rate limits and logs only, never for
 * authorisation (a client can prepend its own X-Forwarded-For value).
 */
export function clientIpFrom(h: Headers): string {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** clientIpFrom() for Server Components and Server Actions. */
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
