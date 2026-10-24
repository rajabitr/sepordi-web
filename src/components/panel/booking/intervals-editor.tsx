"use client";

import * as React from "react";
import { Copy, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import type { BookingInterval } from "@/server/bizin/booking/types";

import { MAX_INTERVALS, UI_WEEKDAYS, minToHm, rowToInterval, validateIntervals, type IntervalProblem } from "./model";

export interface IntervalRow {
  key: string;
  weekday: number;
  start: string | null;
  end: string | null;
}

let seq = 0;
const newKey = () => `iv-${++seq}`;

export function rowsFromIntervals(intervals: readonly BookingInterval[]): IntervalRow[] {
  return intervals.map((iv) => ({ key: newKey(), weekday: iv.weekday, start: minToHm(iv.start_min), end: minToHm(iv.end_min) }));
}

/** Rows as contract intervals, with the problems of each row by its key; an unfinished time is a problem too. */
export function readRows(rows: readonly IntervalRow[]): { intervals: BookingInterval[]; problems: Map<string, string>; week?: string } {
  const problems = new Map<string, string>();
  const intervals: BookingInterval[] = [];
  const keys: string[] = [];
  for (const r of rows) {
    const iv = r.start && r.end ? rowToInterval(r.weekday, r.start, r.end) : null;
    if (!iv) problems.set(r.key, "ساعت شروع و پایان را کامل کنید.");
    else {
      intervals.push(iv);
      keys.push(r.key);
    }
  }
  let week: string | undefined;
  for (const p of validateIntervals(intervals) as IntervalProblem[]) {
    if (p.index < 0) week = p.message;
    else problems.set(keys[p.index], p.message);
  }
  return { intervals, problems, week };
}

/**
 * The week, Saturday first, each day with any number of open intervals. An end at or before the start runs past
 * midnight into the next morning (end_min > 1440), which the row says in words.
 */
export function IntervalsEditor({ rows, onChange, problems }: { rows: IntervalRow[]; onChange: (rows: IntervalRow[]) => void; problems: Map<string, string> }) {
  const set = (key: string, patch: Partial<IntervalRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const full = rows.length >= MAX_INTERVALS;

  function copyToAll(weekday: number) {
    const source = rows.filter((r) => r.weekday === weekday);
    const others = UI_WEEKDAYS.map((d) => d.weekday).filter((w) => w !== weekday && w !== 5);
    const next = [...rows.filter((r) => r.weekday === weekday || r.weekday === 5), ...others.flatMap((w) => source.map((r) => ({ ...r, key: newKey(), weekday: w })))];
    onChange(next.slice(0, MAX_INTERVALS));
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {UI_WEEKDAYS.map((d) => {
        const mine = rows.filter((r) => r.weekday === d.weekday);
        return (
          <div key={d.weekday} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <div className="flex w-28 shrink-0 items-center justify-between gap-2 sm:min-h-11">
              <span className="font-medium">{d.label}</span>
              {mine.length === 0 && <span className="text-xs text-muted-foreground">تعطیل</span>}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {mine.map((r) => {
                const overnight = r.start && r.end && r.end <= r.start;
                const problem = problems.get(r.key);
                return (
                  <div key={r.key} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TimePicker value={r.start} onChange={(v) => set(r.key, { start: v })} step={15} clearable={false} className="w-32" />
                      <span className="text-sm text-muted-foreground">تا</span>
                      <TimePicker value={r.end} onChange={(v) => set(r.key, { end: v })} step={15} clearable={false} className="w-32" />
                      <Button variant="ghost" size="icon" className="size-11" aria-label={`حذف بازه‌ی ${d.label}`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </Button>
                    </div>
                    {overnight && !problem && <p className="text-xs text-muted-foreground">تا بامداد روز بعد ادامه دارد.</p>}
                    {problem && <p className={cn("text-xs text-destructive")}>{problem}</p>}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={full}
                  onClick={() => {
                    const last = mine[mine.length - 1];
                    onChange([...rows, { key: newKey(), weekday: d.weekday, start: last?.end ?? "10:00", end: last ? null : "14:00" }]);
                  }}
                >
                  <Plus className="size-4" strokeWidth={1.5} />
                  افزودن بازه
                </Button>
                {mine.length > 0 && d.weekday !== 5 && (
                  <Button variant="ghost" className="min-h-11" onClick={() => copyToAll(d.weekday)}>
                    <Copy className="size-4" strokeWidth={1.5} />
                    همین برای روزهای دیگر
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
