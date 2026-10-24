import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingNav } from "@/components/panel/booking/booking-nav";
import { BookingGateState } from "@/components/panel/booking/gate-state";
import { ResourcesManager } from "@/components/panel/booking/resources-manager";
import { BookingFormSkeleton } from "@/components/panel/booking/skeletons";
import { LoadError } from "@/components/panel/orders/load-error";
import { getBookingHours, listBookingResources, listBookingSchedules } from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";

import { attempt, openBooking } from "../_lib/open";
import { BookingHead } from "../_lib/page-head";

export const metadata: Metadata = { title: "پرسنل و اتاق‌ها" };

export default function ResourcesPage() {
  return (
    <div className="flex flex-col gap-6">
      <BookingHead title="پرسنل و اتاق‌ها" description="هر کس یا هر جایی که نوبت روی آن گرفته می‌شود، با ظرفیت و ساعات کاری خودش." />
      <Suspense fallback={<BookingFormSkeleton />}>
        <Section />
      </Suspense>
    </div>
  );
}

async function Section() {
  const { ctx, gate } = await openBooking("owner");
  if (gate.state !== "ready") return <BookingGateState gate={gate} />;
  const ext = ctx.shop.external_business_id;
  const r = await attempt(Promise.all([listBookingResources(ext, { limit: 100 }), listBookingSchedules(ext, { limit: 100 }), getBookingHours(ext)]));
  if (!r.ok) {
    const f = toBookingFarsiError(r.error);
    return <LoadError title="پرسنل بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref="/panel/booking/resources" />;
  }
  const [resources, schedules, hours] = r.value;
  return (
    <div className="flex flex-col gap-6">
      <BookingNav isOwner />
      <ResourcesManager resources={resources.resources} schedules={schedules.schedules} shopHours={hours.intervals} />
    </div>
  );
}
