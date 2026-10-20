import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";

import { OrderStatusBadge, PaymentStatusBadge } from "./badges";
import { channelLabel, type Order } from "./model";

const customerName = (o: Order) => o.customer.name?.trim() || "مشتری بی‌نام";

/** The orders page: a table from md up, one card per order below it. Each row opens the order. */
export function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>کد سفارش</TableHead>
              <TableHead>مشتری</TableHead>
              <TableHead>کانال</TableHead>
              <TableHead className="text-end">مبلغ</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>پرداخت</TableHead>
              <TableHead>تاریخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id} className="relative h-14">
                <TableCell numeric>
                  <Link
                    href={`/panel/orders/${o.id}`}
                    className="font-semibold text-brand-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    {fa(o.code)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-48 truncate">{customerName(o)}</TableCell>
                <TableCell className="text-muted-foreground">{channelLabel(o.customer.channel)}</TableCell>
                <TableCell numeric className="text-end font-medium whitespace-nowrap">
                  {formatToman(o.totals.total)}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={o.payment.status} />
                </TableCell>
                <TableCell numeric className="whitespace-nowrap text-muted-foreground">
                  {formatDate(o.created_at)}
                  <span className="ms-2 text-xs">{formatTime(o.created_at)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {orders.map((o) => (
          <li key={o.id}>
            <Link
              href={`/panel/orders/${o.id}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors duration-200 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold tabular-nums">سفارش {fa(o.code)}</span>
                <OrderStatusBadge status={o.status} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{customerName(o)}</span>
                <span className="shrink-0 font-medium tabular-nums">{formatToman(o.totals.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {channelLabel(o.customer.channel)}، {formatDate(o.created_at)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <PaymentStatusBadge status={o.payment.status} />
                  <ChevronLeft className="size-4" strokeWidth={1.5} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Cursor pages: there is no total, so only «قبلی» and «بعدی». */
export function CursorPager({ prevHref, nextHref }: { prevHref?: string; nextHref?: string }) {
  if (!prevHref && !nextHref) return null;
  const cls = buttonVariants({ variant: "outline", size: "md", className: "min-h-11" });
  return (
    <nav aria-label="صفحه‌بندی" className="mt-4 flex items-center justify-between gap-3">
      {prevHref ? (
        <Link href={prevHref} className={cls}>
          <ArrowRight className="size-4" strokeWidth={1.5} />
          صفحه‌ی قبل
        </Link>
      ) : (
        <span />
      )}
      {nextHref && (
        <Link href={nextHref} className={cls}>
          صفحه‌ی بعد
          <ArrowLeft className="size-4" strokeWidth={1.5} />
        </Link>
      )}
    </nav>
  );
}
