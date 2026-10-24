"use client";

import * as React from "react";

import { Bot, Hand, MessagesSquare, ShoppingBag, type LucideIcon } from "lucide-react";

import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Stat } from "@/components/ui/stat";
import { formatDateShort } from "@/lib/date";
import { cn, faNumber } from "@/lib/utils";

export interface StatsDay {
  date: string;
  conversations_started: number;
  automated_replies: number;
  handoffs: number;
  orders_created: number;
}

type Key = Exclude<keyof StatsDay, "date">;

/** Each card's chip is tinted like its chart series, so a number and its line read as one. */
const CARDS: { key: Key; label: string; series: string; icon: LucideIcon; chip: string; color: string }[] = [
  { key: "conversations_started", label: "گفت‌وگوهای جدید", series: "گفت‌وگوی جدید", icon: MessagesSquare, chip: "border border-border bg-surface-cream text-surface-cream-foreground", color: "var(--chart-1)" },
  { key: "automated_replies", label: "پاسخ‌های خودکار", series: "پاسخ خودکار", icon: Bot, chip: "bg-accent-rose-soft text-accent-rose-ink", color: "var(--chart-2)" },
  { key: "handoffs", label: "تحویل به شما", series: "تحویل به شما", icon: Hand, chip: "bg-accent-peach-soft text-accent-peach-ink", color: "var(--chart-4)" },
  { key: "orders_created", label: "سفارش‌های ثبت‌شده", series: "سفارش", icon: ShoppingBag, chip: "bg-surface-lavender text-brand-ink", color: "var(--chart-3)" },
];

const seriesOf = (...keys: Key[]) => keys.flatMap((k) => CARDS.filter((c) => c.key === k).map((c) => ({ key: c.key, label: c.series, color: c.color })));

const sum = (days: StatsDay[], k: Key) => days.reduce((n, d) => n + (Number(d[k]) || 0), 0);

/** A stats day is a UTC calendar date; noon keeps it on the same Tehran date. */
const dayLabel = (date: unknown) => formatDateShort(`${String(date)}T12:00:00Z`);

/**
 * `days` is the last 60 days, oldest first: the chosen window is the tail, the window before it gives the change.
 */
export function StatsView({ days }: { days: StatsDay[] }) {
  const [range, setRange] = React.useState<"7" | "30">("7");
  const n = Number(range);
  const current = days.slice(-n);
  const previous = days.slice(-2 * n, -n);
  const quiet = current.every((d) => CARDS.every((c) => !d[c.key]));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="stats-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stats-title" className="text-lg font-semibold leading-tight">
          عملکرد دستیار
        </h2>
        <SegmentedControl
          aria-label="بازه‌ی آمار"
          value={range}
          onChange={(v) => setRange(v === "30" ? "30" : "7")}
          options={[
            { value: "7", label: "۷ روز اخیر" },
            { value: "30", label: "۳۰ روز اخیر" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {CARDS.map((c) => {
          const now = sum(current, c.key);
          const before = sum(previous, c.key);
          const delta = previous.length === n && before > 0 ? ((now - before) / before) * 100 : undefined;
          const label = (
            <span className="flex items-center gap-2">
              <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", c.chip)}>
                <c.icon className="size-4" strokeWidth={2} />
              </span>
              {c.label}
            </span>
          );
          return <Stat key={c.key} label={label} value={faNumber(now)} delta={delta} deltaLabel={`نسبت به ${range === "7" ? "۷" : "۳۰"} روز قبل`} />;
        })}
      </div>

      {quiet ? (
        <p className="rounded-surface border border-dashed border-border p-6 text-center text-muted-foreground">
          در این بازه هنوز گفت‌وگویی نبوده است. وقتی مشتری‌ها پیام بدهند، نمودارها اینجا پر می‌شوند.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-surface border border-border bg-card p-4 lg:col-span-3">
            <AreaChart
              title="گفت‌وگوها و پاسخ‌های خودکار"
              description="تعداد روزانه"
              data={current as unknown as Record<string, unknown>[]}
              x="date"
              xFormat={dayLabel}
              format={(v) => faNumber(v)}
              height={240}
              series={seriesOf("conversations_started", "automated_replies")}
            />
          </div>
          <div className="rounded-surface border border-border bg-card p-4 lg:col-span-2">
            <BarChart
              title="سفارش‌ها و تحویل به شما"
              description="تعداد روزانه"
              data={current as unknown as Record<string, unknown>[]}
              x="date"
              xFormat={dayLabel}
              format={(v) => faNumber(v)}
              height={240}
              series={seriesOf("orders_created", "handoffs")}
            />
          </div>
        </div>
      )}
    </section>
  );
}
