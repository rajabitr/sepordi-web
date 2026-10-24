import { toGregorian } from "@/lib/jalali";

import { isActivityGroup, type ActivityGroup } from "./labels";

/** Tehran has kept UTC+03:30 all year since 2022. */
const TEHRAN_OFFSET_MS = 3.5 * 3600_000;

/** «1403-08-01» (Latin digits, from the URL) → the UTC instant of that day's midnight in Tehran; null if malformed. */
export function jalaliDayStart(text: string | undefined, plusDays = 0): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text ?? "");
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31 || jy < 1300 || jy > 1500) return null;
  const g = toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.getFullYear(), g.getMonth(), g.getDate() + plusDays) - TEHRAN_OFFSET_MS).toISOString();
}

export interface ActivityQuery {
  member?: string;
  group?: ActivityGroup;
  from?: string;
  to?: string;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64);

/** The page's search params, each dropped when malformed. `to` is inclusive: the whole day counts. */
export function parseActivityQuery(q: Record<string, string | string[] | undefined>): { query: ActivityQuery; from?: string; to?: string } {
  const member = one(q.member) || undefined;
  const group = isActivityGroup(one(q.type)) ? (one(q.type) as ActivityGroup) : undefined;
  const fromDay = one(q.from);
  const toDay = one(q.to);
  const from = jalaliDayStart(fromDay) ?? undefined;
  const to = jalaliDayStart(toDay, 1) ?? undefined;
  return { query: { member, group, from: from ? fromDay : undefined, to: to ? toDay : undefined }, from, to };
}
