"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilterX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, fa } from "@/lib/utils";

import {
  ORDER_STATUSES,
  ORDER_TABS,
  PAYMENT_STATUSES,
  activeTab,
  dayToPicker,
  orderStatusMeta,
  filteredOrdersHref,
  paymentStatusMeta,
  pickedDay,
  type OrderFilters,
  type OrderStatus,
  type OrderTab,
  type PaymentStatus,
} from "./model";

const STATUS_OPTIONS = [{ value: "", label: "همه‌ی وضعیت‌ها" }, ...ORDER_STATUSES.map((s) => ({ value: s, label: orderStatusMeta(s).label }))];
const PAYMENT_OPTIONS = [{ value: "", label: "همه‌ی پرداخت‌ها" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: paymentStatusMeta(s).label }))];

/**
 * Tabs and filters of the orders list. Every change is a new URL (a fresh first page): the list itself is rendered on
 * the server, so a filter is one Partner API call and nothing polls.
 */
export function OrdersFilters({
  filters,
  pendingCount,
  children,
}: {
  filters: Pick<OrderFilters, "status" | "payment" | "from">;
  /** Receipts waiting for a decision; null when the counter could not be read. */
  pendingCount: { count: number; more: boolean } | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const tab = activeTab(filters);
  const go = (next: Partial<OrderFilters>) => startTransition(() => router.push(filteredOrdersHref(filters, next)));
  const filtered = Boolean(filters.status || filters.payment || filters.from);

  return (
    <Tabs
      variant="underline"
      value={tab || "custom"}
      defaultValue="all"
      onValueChange={(v) => {
        const t = ORDER_TABS.find((x) => x.value === v);
        if (t) go({ status: t.status, payment: t.payment });
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList aria-label="دسته‌بندی سفارش‌ها" className="min-w-max">
          {ORDER_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-h-11">
              <TabLabel tab={t.value} label={t.label} pendingCount={pendingCount} />
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="orders-status">وضعیت سفارش</Label>
          <Select
            id="orders-status"
           
            value={filters.status ?? ""}
            options={STATUS_OPTIONS}
            onChange={(e) => go({ status: (e.target.value || undefined) as OrderStatus | undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="orders-payment">وضعیت پرداخت</Label>
          <Select
            id="orders-payment"
           
            value={filters.payment ?? ""}
            options={PAYMENT_OPTIONS}
            onChange={(e) => go({ payment: (e.target.value || undefined) as PaymentStatus | undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground/90">ثبت‌شده از تاریخ</span>
          <DatePicker
            value={dayToPicker(filters.from)}
            onChange={(d) => go({ from: d ? pickedDay(d) : undefined })}
            placeholder="از تاریخ"
            compact
          />
        </div>
        <div className="flex items-end">
          {filtered && (
            <Button variant="ghost" className="min-h-11" onClick={() => go({ status: undefined, payment: undefined, from: undefined })}>
              <FilterX className="size-4" strokeWidth={1.5} />
              پاک کردن فیلترها
            </Button>
          )}
        </div>
      </div>

      <TabsContent value={tab || "custom"} className={cn("mt-6 transition-opacity duration-200", pending && "opacity-60")}>
        <div aria-busy={pending}>{children}</div>
      </TabsContent>
    </Tabs>
  );
}

function TabLabel({ tab, label, pendingCount }: { tab: OrderTab; label: string; pendingCount: { count: number; more: boolean } | null }) {
  if (tab !== "pending" || !pendingCount || pendingCount.count === 0) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-2">
      {label}
      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-warning/15 px-2 text-xs font-semibold leading-6 text-warning tabular-nums">
        {fa(pendingCount.count)}
        {pendingCount.more ? "+" : ""}
      </span>
    </span>
  );
}
