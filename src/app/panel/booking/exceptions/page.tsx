import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { BookingNav } from "@/components/panel/booking/booking-nav";
import { ExceptionsManager } from "@/components/panel/booking/exceptions-manager";
import { BookingGateState } from "@/components/panel/booking/gate-state";
import { BookingFormSkeleton } from "@/components/panel/booking/skeletons";
import { DAY_RE, addDay } from "@/components/panel/booking/model";
import { tehranDay } from "@/components/panel/orders/model";
import { LoadError } from "@/components/panel/orders/load-error";
import { buttonVariants } from "@/components/ui/button";
import { formatDateShort } from "@/lib/date";
import { listBookingDays, listBookingExceptions, listBookingResources, listBookingServices } from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";

import { attempt, openBooking } from "../_lib/open";
import { BookingHead } from "../_lib/page-head";

export const metadata: Metadata = { title: "تعطیلات و استثناها" };

const SPAN = 30;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ExceptionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <BookingHead title="تعطیلات و استثناها" description="تعطیلات رسمی، روزهایی که خودتان تعطیل یا باز می‌کنید، و ساعت‌های ویژه‌ی یک پرسنل یا یک خدمت." />
      <Suspense fallback={<BookingFormSkeleton />}>
        <Section searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Section({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { ctx, gate } = await openBooking("owner");
  if (gate.state !== "ready") return <BookingGateState gate={gate} />;
  const ext = ctx.shop.external_business_id;
  const raw = typeof sp.from === "string" && DAY_RE.test(sp.from) ? sp.from : tehranDay(new Date());
  const from = raw;
  const to = addDay(from, SPAN - 1);
  const civil = (d: string) => formatDateShort(`${d}T09:00:00Z`);
  const nav = buttonVariants({ variant: "outline", className: "min-h-11" });

  const r = await attempt(
    Promise.all([listBookingDays(ext, { from, to }), listBookingExceptions(ext, { from, to }), listBookingServices(ext, { limit: 100 }), listBookingResources(ext, { limit: 100 })]),
  );
  if (!r.ok) {
    const f = toBookingFarsiError(r.error);
    return <LoadError title="تعطیلات بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref="/panel/booking/exceptions" />;
  }
  const [days, exceptions, services, resources] = r.value;
  return (
    <div className="flex flex-col gap-6">
      <BookingNav isOwner />
      <nav aria-label="بازه‌ی روزها" className="flex items-center justify-between gap-3">
        <Link href={`/panel/booking/exceptions?from=${addDay(from, -SPAN)}`} className={nav}>
          <ArrowRight className="size-4" strokeWidth={1.5} />
          ۳۰ روز قبل
        </Link>
        <span className="text-sm text-muted-foreground">
          {civil(from)} تا {civil(to)}
        </span>
        <Link href={`/panel/booking/exceptions?from=${addDay(from, SPAN)}`} className={nav}>
          ۳۰ روز بعد
          <ArrowLeft className="size-4" strokeWidth={1.5} />
        </Link>
      </nav>
      <ExceptionsManager
        days={days.days}
        exceptions={exceptions.exceptions}
        services={services.services.filter((s) => !s.archived_at)}
        resources={resources.resources.filter((x) => !x.archived_at && !x.is_default)}
      />
    </div>
  );
}
