"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { History } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/date";
import { toGregorian, toJalali } from "@/lib/jalali";
import { fa } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

export interface ActivityQueryView {
  member?: string;
  group?: string;
  from?: string;
  to?: string;
}

const toParam = (d: Date | null) => {
  if (!d) return undefined;
  const j = toJalali(d);
  return `${j.jy}-${j.jm}-${j.jd}`;
};
const fromParam = (s: string | undefined) => {
  const m = (s ?? "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? toGregorian(Number(m[1]), Number(m[2]), Number(m[3])) : null;
};

/** Member, action type and a Jalali date range; each change rewrites the URL and the server re-reads the log. */
export function ActivityFilters({ query, members, groups }: { query: ActivityQueryView; members: Option[]; groups: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, start] = React.useTransition();
  const push = (next: ActivityQueryView) => {
    const p = new URLSearchParams();
    if (next.member) p.set("member", next.member);
    if (next.group) p.set("type", next.group);
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
    const qs = p.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const range: DateRange = { from: fromParam(query.from), to: fromParam(query.to) };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="عضو تیم" htmlFor="activity-member">
        <Select
          id="activity-member"
          options={[{ value: "", label: "همه" }, ...members]}
          value={query.member ?? ""}
          onChange={(e) => push({ ...query, member: e.target.value || undefined })}
        />
      </Field>
      <Field label="نوع کار" htmlFor="activity-type">
        <Select
          id="activity-type"
          options={[{ value: "", label: "همه" }, ...groups]}
          value={query.group ?? ""}
          onChange={(e) => push({ ...query, group: e.target.value || undefined })}
        />
      </Field>
      <Field label="بازه‌ی تاریخ" htmlFor="activity-range">
        <DateRangePicker value={range} max={new Date()} onChange={(r) => push({ ...query, from: toParam(r.from), to: toParam(r.to ?? r.from) })} />
      </Field>
    </div>
  );
}

export interface ActivityRowView {
  id: string;
  label: string;
  who: string;
  target: string | null;
  at: string;
}

export function ActivityList({ rows, capped }: { rows: ActivityRowView[]; capped: boolean }) {
  if (rows.length === 0) {
    return <EmptyState icon={History} title="فعالیتی پیدا نشد" description="کارهای اعضای تیم، مثل پاسخ به گفت‌وگو یا تأیید رسید، این‌جا ثبت می‌شود." />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex min-h-16 flex-col justify-center gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-col">
                <span className="font-semibold">{r.label}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {r.who}
                  {r.target && (
                    <>
                      {" · "}
                      <bdi dir="ltr">{fa(r.target.length > 12 ? `${r.target.slice(0, 8)}…` : r.target)}</bdi>
                    </>
                  )}
                </span>
              </div>
              <time dateTime={r.at} className="shrink-0 text-sm text-muted-foreground">
                {formatDateTime(r.at)}
              </time>
            </li>
          ))}
        </ul>
        {capped && (
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            فقط {fa(rows.length)} مورد تازه‌تر نشان داده شده؛ برای موارد قدیمی‌تر بازه‌ی تاریخ را کوتاه‌تر کنید.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
