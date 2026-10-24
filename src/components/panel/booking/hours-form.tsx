"use client";

import * as React from "react";
import { Save } from "lucide-react";

import { saveHoursAction } from "@/app/panel/booking/setup-actions";
import { useIntent } from "@/components/panel/orders/use-intent";
import { Button } from "@/components/ui/button";
import type { BookingInterval } from "@/server/bizin/booking/types";

import { IntervalsEditor, readRows, rowsFromIntervals, type IntervalRow } from "./intervals-editor";

/** The shop's weekly hours, saved as one whole week (`PUT …/hours`). */
export function HoursForm({ intervals }: { intervals: BookingInterval[] }) {
  const [rows, setRows] = React.useState<IntervalRow[]>(() => rowsFromIntervals(intervals));
  const [tried, setTried] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { begin, run } = useIntent();
  const read = readRows(rows);

  return (
    <div className="flex flex-col gap-4">
      <IntervalsEditor rows={rows} onChange={setRows} problems={tried ? read.problems : new Map()} />
      {tried && read.week && <p className="text-sm text-destructive">{read.week}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="min-h-11"
          disabled={saving}
          onClick={async () => {
            setTried(true);
            if (read.problems.size > 0 || read.week) return;
            setSaving(true);
            begin();
            await run(() => saveHoursAction(read.intervals), "ساعات کاری ذخیره شد");
            setSaving(false);
          }}
        >
          <Save className="size-4" strokeWidth={2} />
          ذخیره‌ی ساعات کاری
        </Button>
        <p className="text-xs text-muted-foreground">نوبت‌هایی که بیرون از ساعات تازه بیفتند، در فهرست با هشدار «خارج از ساعت کاری» دیده می‌شوند.</p>
      </div>
    </div>
  );
}
