import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX } from "lucide-react";

import { OrdersFilters } from "@/components/panel/orders/orders-filters";
import { CursorPager, OrdersTable } from "@/components/panel/orders/orders-table";
import { LoadError } from "@/components/panel/orders/load-error";
import { NoOrdersYet } from "@/components/panel/orders/no-orders";
import { OrdersListSkeleton } from "@/components/panel/orders/skeletons";
import {
  nextPageHref,
  ordersHref,
  parseOrderFilters,
  prevPageHref,
  tehranDayStart,
} from "@/components/panel/orders/model";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";
import { fa } from "@/lib/utils";
import { requireCapability } from "@/server/auth/session";
import { listOrders } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";

import { getOrderStats, type Counter } from "./_lib/stats";

export const metadata: Metadata = { title: "سفارش‌ها" };

const PAGE_SIZE = 20;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight">سفارش‌ها</h1>
        <p className="text-sm text-muted-foreground">
          سفارش‌هایی که دستیار در گفت‌وگو نوشته است. پرداخت را شما تأیید می‌کنید؛ هیچ سفارشی خودکار پرداخت‌شده نمی‌شود.
        </p>
      </header>
      <Suspense fallback={<OrdersListSkeleton />}>
        <OrdersSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const show = (c: Counter | null) => (c ? (c.more ? `بیش از ${fa(c.count)}` : fa(c.count)) : "—");

async function OrdersSection({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { shop, role } = await requireCapability("orders.view");
  const ext = shop.external_business_id;
  const filters = parseOrderFilters(sp);

  const [statsResult, listResult] = await Promise.allSettled([
    getOrderStats(ext),
    listOrders(ext, {
      limit: PAGE_SIZE,
      status: filters.status,
      payment_status: filters.payment,
      since: filters.from ? tehranDayStart(filters.from).toISOString() : undefined,
      cursor: filters.cursor,
    }),
  ]);
  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const filtered = Boolean(filters.status || filters.payment || filters.from);

  if (listResult.status === "fulfilled" && listResult.value.orders.length === 0 && !filtered && !filters.cursor) {
    return <NoOrdersYet canConnect={role === "owner"} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="خلاصه‌ی سفارش‌ها" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat size="sm" label="سفارش‌های امروز" value={show(stats?.today ?? null)} />
        <Stat size="sm" label="رسید در انتظار بررسی" value={show(stats?.pendingReceipts ?? null)} />
        <Stat size="sm" label="آماده‌ی ارسال" value={show(stats?.readyToShip ?? null)} />
        <Stat size="sm" label="تحویل‌شده در این هفته" value={show(stats?.deliveredThisWeek ?? null)} />
      </section>

      <OrdersFilters filters={filters} pendingCount={stats?.pendingReceipts ?? null}>
        {listResult.status === "rejected" ? (
          <ListError
            error={listResult.reason}
            currentHref={ordersHref(filters)}
            firstPageHref={ordersHref({ ...filters, cursor: undefined, back: [] })}
          />
        ) : listResult.value.orders.length === 0 ? (
          <EmptyState
            icon={SearchX}
            className="min-h-64 justify-center"
            title={filters.cursor ? "سفارش دیگری نیست" : "با این فیلترها سفارشی پیدا نشد"}
            description={filters.cursor ? "به صفحه‌ی اول برگردید." : "فیلترها را عوض کنید یا همه‌ی سفارش‌ها را ببینید."}
            action={
              <Link href={filters.cursor ? ordersHref({ ...filters, cursor: undefined }) : "/panel/orders"} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
                {filters.cursor ? "صفحه‌ی اول" : "همه‌ی سفارش‌ها"}
              </Link>
            }
          />
        ) : (
          <>
            <OrdersTable orders={listResult.value.orders} />
            <CursorPager
              prevHref={prevPageHref(filters)}
              nextHref={listResult.value.next_cursor ? nextPageHref(filters, listResult.value.next_cursor) : undefined}
            />
          </>
        )}
      </OrdersFilters>
    </div>
  );
}

function ListError({ error, currentHref, firstPageHref }: { error: unknown; currentHref: string; firstPageHref: string }) {
  const f = toFarsiError(error);
  const cursorBroken = f.field === "cursor";
  return (
    <LoadError
      title="فهرست سفارش‌ها بارگذاری نشد"
      message={cursorBroken ? "این صفحه دیگر معتبر نیست. از صفحه‌ی اول شروع کنید." : f.message}
      requestId={f.requestId}
      retryHref={cursorBroken ? firstPageHref : currentHref}
      retryLabel={cursorBroken ? "صفحه‌ی اول" : "تلاش دوباره"}
    />
  );
}
