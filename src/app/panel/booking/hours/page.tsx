import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingNav } from "@/components/panel/booking/booking-nav";
import { BookingGateState } from "@/components/panel/booking/gate-state";
import { HoursForm } from "@/components/panel/booking/hours-form";
import { BookingFormSkeleton } from "@/components/panel/booking/skeletons";
import { LoadError } from "@/components/panel/orders/load-error";
import { getBookingHours } from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";

import { attempt, openBooking } from "../_lib/open";
import { BookingHead } from "../_lib/page-head";

export const metadata: Metadata = { title: "ساعات کاری نوبت‌دهی" };

export default function HoursPage() {
  return (
    <div className="flex flex-col gap-6">
      <BookingHead title="ساعات کاری" description="ساعت‌هایی که مشتری می‌تواند نوبت بگیرد. هر روز می‌تواند چند بازه داشته باشد؛ روز بدون بازه تعطیل است." />
      <Suspense fallback={<BookingFormSkeleton />}>
        <Section />
      </Suspense>
    </div>
  );
}

async function Section() {
  const { ctx, gate } = await openBooking("owner");
  if (gate.state !== "ready") return <BookingGateState gate={gate} />;
  const r = await attempt(getBookingHours(ctx.shop.external_business_id));
  if (!r.ok) {
    const f = toBookingFarsiError(r.error);
    return <LoadError title="ساعات کاری بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref="/panel/booking/hours" />;
  }
  return (
    <div className="flex flex-col gap-6">
      <BookingNav isOwner />
      <HoursForm intervals={r.value.intervals} />
    </div>
  );
}
