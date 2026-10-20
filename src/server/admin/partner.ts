import "server-only";

import * as bizin from "@/server/bizin/client";

const PAGE = 100;
const MAX_PAGES = 20;

/** Businesses the partner key sees, counted page by page; `capped` when there are more than the pages read. */
export async function countTenants(): Promise<{ count: number; capped: boolean }> {
  let count = 0;
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await bizin.listTenants({ limit: PAGE, cursor });
    count += page.tenants.length;
    if (!page.next_cursor) return { count, capped: false };
    cursor = page.next_cursor;
  }
  return { count, capped: true };
}

/** The public URL Bizin posts sepordi's events to (src/app/api/bizin/webhook). */
export function defaultWebhookUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || "https://sepordi.ir").replace(/\/+$/, "");
  return `${base}/api/bizin/webhook`;
}
