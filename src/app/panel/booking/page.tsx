import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarX2, SearchX } from "lucide-react";

import { BookingCalendar } from "@/components/panel/booking/booking-calendar";
import { BookingNav } from "@/components/panel/booking/booking-nav";
import { BookingsFilters } from "@/components/panel/booking/bookings-filters";
import { BookingsList } from "@/components/panel/booking/bookings-list";
import { BookingGateState } from "@/components/panel/booking/gate-state";
import { BookingListSkeleton } from "@/components/panel/booking/skeletons";
import { bookingsHref, calendarWindow, listQueryFor, parseBookingFilters, type BookingFilters } from "@/components/panel/booking/model";
import { tehranDay } from "@/components/panel/orders/model";
import { LoadError } from "@/components/panel/orders/load-error";
import { CursorPager } from "@/components/panel/orders/orders-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listBookingDays, listBookingResources, listBookingServices, listBookings } from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";
import type { Booking } from "@/server/bizin/booking/types";

import { attempt, openBooking } from "./_lib/open";

export const metadata: Metadata = { title: "نوبت‌ها" };

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function BookingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight">نوبت‌ها</h1>
        <p className="text-sm text-muted-foreground">نوبت‌هایی که دستیار در گفت‌وگو گرفته یا شما ثبت کرده‌اید. تأیید، رد و تغییر زمان با شماست.</p>
      </header>
      <Suspense fallback={<BookingListSkeleton />}>
        <BookingSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BookingSection({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { ctx, gate } = await openBooking("desk");
  if (gate.state !== "ready") return <BookingGateState gate={gate} />;
  const ext = ctx.shop.external_business_id;
  const filters = parseBookingFilters(sp);

  const [services, resources] = await Promise.allSettled([listBookingServices(ext, { limit: 100 }), listBookingResources(ext, { limit: 100 })]);
  const serviceRows = services.status === "fulfilled" ? services.value.services.filter((s) => !s.archived_at) : [];
  const resourceRows = resources.status === "fulfilled" ? resources.value.resources : [];
  const resourceTitle = Object.fromEntries(resourceRows.map((r) => [r.id, r.title]));

  const body = filters.view === "list" ? await listBody(ext, filters, resourceTitle) : await calendarBody(ext, filters, gate.settings.timezone);

  return (
    <div className="flex flex-col gap-6">
      <BookingNav isOwner={ctx.role === "owner"} />
      <BookingsFilters
        filters={filters}
        services={serviceRows.map((s) => ({ value: s.id, label: s.title }))}
        resources={resourceRows.filter((r) => !r.archived_at).map((r) => ({ value: r.id, label: r.title }))}
      >
        {body}
      </BookingsFilters>
    </div>
  );
}

async function listBody(ext: string, filters: BookingFilters, resourceTitle: Record<string, string>) {
  const r = await attempt(listBookings(ext, { ...listQueryFor(filters), limit: PAGE_SIZE }));
  if (!r.ok) {
    const f = toBookingFarsiError(r.error);
    return (
      <LoadError
        title="فهرست نوبت‌ها بارگذاری نشد"
        message={f.field === "cursor" ? "این صفحه دیگر معتبر نیست. از صفحه‌ی اول شروع کنید." : f.message}
        requestId={f.requestId}
        retryHref={bookingsHref({ ...filters, cursor: undefined })}
      />
    );
  }
  const page = r.value;
  if (page.bookings.length === 0) {
    return (
      <EmptyState
        icon={filters.cursor ? SearchX : CalendarX2}
        className="min-h-64 justify-center"
        title={filters.cursor ? "نوبت دیگری نیست" : "در این بخش نوبتی نیست"}
        description={filters.tab === "pending" ? "درخواست تازه‌ای منتظر تأیید شما نیست." : "فیلترها یا بخش دیگری را امتحان کنید."}
        action={
          filters.cursor ? (
            <Link href={bookingsHref({ ...filters, cursor: undefined })} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              صفحه‌ی اول
            </Link>
          ) : undefined
        }
      />
    );
  }
  return (
    <>
      <BookingsList bookings={page.bookings} resourceTitle={resourceTitle} />
      <CursorPager
        prevHref={filters.cursor ? bookingsHref({ ...filters, cursor: undefined }) : undefined}
        nextHref={page.next_cursor ? bookingsHref({ ...filters, cursor: page.next_cursor }) : undefined}
      />
    </>
  );
}

async function calendarBody(ext: string, filters: BookingFilters, timezone: string) {
  const win = calendarWindow(filters);
  const r = await attempt(
    Promise.all([
      collect(ext, { from: win.from, to: win.to, service_id: filters.service, resource_id: filters.resource }),
      listBookingDays(ext, { from: win.days[0], to: win.days[win.days.length - 1] }),
    ]),
  );
  if (!r.ok) {
    const f = toBookingFarsiError(r.error);
    return <LoadError title="تقویم نوبت‌ها بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref={bookingsHref(filters)} />;
  }
  const [rows, days] = r.value;
  return <BookingCalendar filters={filters} anchor={filters.date ?? tehranDay(new Date())} bookings={rows} days={days.days} timezone={timezone} />;
}

/** Every booking of a calendar window: a week of a busy shop can pass one page. */
async function collect(ext: string, q: { from: string; to: string; service_id?: string; resource_id?: string }): Promise<Booking[]> {
  const out: Booking[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const page = await listBookings(ext, { ...q, sort: "starts_at", limit: 100, cursor });
    out.push(...page.bookings);
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return out;
}
