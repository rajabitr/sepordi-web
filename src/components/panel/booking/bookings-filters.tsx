"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilterX } from "lucide-react";

import { dayToPicker, pickedDay } from "@/components/panel/orders/model";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Label } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { BOOKING_TABS, bookingsHref, type BookingFilters, type BookingTab, type BookingView } from "./model";

const VIEWS = [
  { value: "list", label: "فهرست" },
  { value: "day", label: "روز" },
  { value: "week", label: "هفته" },
];

/**
 * Tabs, filters and the view switch of the bookings page. Every change is a new URL (a fresh first page): the list and
 * the calendar are rendered on the server, one Partner API read per change.
 */
export function BookingsFilters({
  filters,
  services,
  resources,
  children,
}: {
  filters: BookingFilters;
  services: { value: string; label: string }[];
  resources: { value: string; label: string }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const go = (next: Partial<BookingFilters>) => startTransition(() => router.push(bookingsHref({ ...filters, cursor: undefined, ...next })));
  const filtered = Boolean(filters.service || filters.resource || filters.from || filters.to);
  const list = filters.view === "list";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {list ? (
          <Tabs variant="underline" value={filters.tab} defaultValue="pending" onValueChange={(v) => go({ tab: v as BookingTab })}>
            <TabsList aria-label="دسته‌ی نوبت‌ها" className="max-w-full overflow-x-auto">
              {BOOKING_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="min-h-11">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span />
        )}
        <SegmentedControl aria-label="نمای نوبت‌ها" options={VIEWS} value={filters.view} onChange={(v) => go({ view: v as BookingView, date: undefined })} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bk-service">خدمت</Label>
          <Select id="bk-service" className="min-h-11" options={[{ value: "", label: "همه‌ی خدمت‌ها" }, ...services]} value={filters.service ?? ""} onChange={(e) => go({ service: e.target.value || undefined })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bk-resource">پرسنل یا اتاق</Label>
          <Select id="bk-resource" className="min-h-11" options={[{ value: "", label: "همه" }, ...resources]} value={filters.resource ?? ""} onChange={(e) => go({ resource: e.target.value || undefined })} />
        </div>
        {list && (
          <div className="flex flex-col gap-1.5">
            <Label>بازه‌ی تاریخ</Label>
            <DateRangePicker
              className="min-h-11"
              value={{ from: dayToPicker(filters.from), to: dayToPicker(filters.to) }}
              onChange={(r) => {
                if (r.from && !r.to) return;
                go({ from: r.from ? pickedDay(r.from) : undefined, to: r.to ? pickedDay(r.to) : undefined });
              }}
            />
          </div>
        )}
        {filtered && (
          <div className="flex items-end">
            <Button variant="ghost" className="min-h-11" onClick={() => go({ service: undefined, resource: undefined, from: undefined, to: undefined })}>
              <FilterX className="size-4" strokeWidth={1.5} />
              حذف فیلترها
            </Button>
          </div>
        )}
      </div>

      <div className={cn("transition-opacity duration-200", pending && "opacity-60")} aria-busy={pending}>
        {children}
      </div>
    </div>
  );
}
