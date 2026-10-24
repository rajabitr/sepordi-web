import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX, Undo2 } from "lucide-react";

import { isNotEntitled } from "@/components/panel/orders/entitlement";
import { LoadError } from "@/components/panel/orders/load-error";
import { NotEntitled } from "@/components/panel/orders/not-entitled";
import { OrdersListSkeleton } from "@/components/panel/orders/skeletons";
import { CursorPager } from "@/components/panel/orders/orders-table";
import { CasesFilters } from "@/components/panel/returns/cases-filters";
import { CasesTable } from "@/components/panel/returns/cases-table";
import { casesHref, nextCasesHref, parseCaseFilters, prevCasesHref } from "@/components/panel/returns/model";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCapability } from "@/server/auth/session";
import { listCases } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";

export const metadata: Metadata = { title: "مرجوعی‌ها" };

const PAGE_SIZE = 20;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ReturnsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight">مرجوعی‌ها و شکایت‌ها</h1>
        <p className="text-sm text-muted-foreground">
          درخواست‌هایی که مشتری‌ها در گفت‌وگو ثبت کرده‌اند. دستیار هیچ درخواستی را نمی‌پذیرد یا رد نمی‌کند؛ تصمیم با شماست.
        </p>
      </header>
      <Suspense fallback={<OrdersListSkeleton />}>
        <CasesSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CasesSection({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { shop, role } = await requireCapability("returns.view");
  const filters = parseCaseFilters(sp);
  const filtered = Boolean(filters.state || filters.kind);

  let page;
  try {
    page = await listCases(shop.external_business_id, {
      limit: PAGE_SIZE,
      state: filters.state,
      kind: filters.kind,
      cursor: filters.cursor,
    });
  } catch (e) {
    // While returns are off for the business every case route answers a bare 404 not_found.
    if (isBizinError(e) && e.status === 404 && e.code === "not_found") {
      return (
        <EmptyState
          icon={Undo2}
          className="min-h-80 justify-center"
          title="بخش مرجوعی برای فروشگاه شما فعال نیست"
          description="وقتی فعال شود، درخواست‌های مرجوعی، تعویض و شکایت مشتری‌ها همین‌جا برای تصمیم شما می‌آیند. برای فعال‌سازی با پشتیبانی تماس بگیرید."
        />
      );
    }
    if (isNotEntitled(e)) {
      return <NotEntitled description="وقتی فعال شود، درخواست‌های مرجوعی، تعویض و شکایت مشتری‌ها همین‌جا برای تصمیم شما می‌آیند." />;
    }
    const f = toFarsiError(e);
    const cursorBroken = f.field === "cursor";
    return (
      <LoadError
        title="فهرست درخواست‌ها بارگذاری نشد"
        message={cursorBroken ? "این صفحه دیگر معتبر نیست. از صفحه‌ی اول شروع کنید." : f.message}
        requestId={f.requestId}
        retryHref={cursorBroken ? casesHref({ ...filters, cursor: undefined }) : casesHref(filters)}
        retryLabel={cursorBroken ? "صفحه‌ی اول" : "تلاش دوباره"}
      />
    );
  }

  if (page.cases.length === 0 && !filtered && !filters.cursor) {
    return (
      <EmptyState
        icon={Undo2}
        className="min-h-80 justify-center"
        title="هنوز درخواست مرجوعی یا شکایتی نرسیده است"
        description="اگر مشتری در گفت‌وگو بخواهد کالایی را پس بدهد، عوض کند یا شکایتی داشته باشد، دستیار درخواست را ثبت می‌کند و این‌جا می‌آید."
        action={
          role === "owner" ? (
            <Link href="/panel/assistant" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              تنظیم قانون مرجوعی
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <CasesFilters filters={filters}>
      {page.cases.length === 0 ? (
        <EmptyState
          icon={SearchX}
          className="min-h-64 justify-center"
          title={filters.cursor ? "درخواست دیگری نیست" : "با این فیلترها درخواستی پیدا نشد"}
          action={
            <Link href={filters.cursor ? casesHref({ ...filters, cursor: undefined }) : "/panel/returns"} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              {filters.cursor ? "صفحه‌ی اول" : "همه‌ی درخواست‌ها"}
            </Link>
          }
        />
      ) : (
        <>
          <CasesTable cases={page.cases} />
          <CursorPager prevHref={prevCasesHref(filters)} nextHref={page.next_cursor ? nextCasesHref(filters, page.next_cursor) : undefined} />
        </>
      )}
    </CasesFilters>
  );
}
