import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingNav } from "@/components/panel/booking/booking-nav";
import { BookingGateState } from "@/components/panel/booking/gate-state";
import { ServicesManager } from "@/components/panel/booking/services-manager";
import { BookingFormSkeleton } from "@/components/panel/booking/skeletons";
import { LoadError } from "@/components/panel/orders/load-error";
import { listBookingCategories, listBookingResources, listBookingServices } from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";

import { attempt, openBooking } from "../_lib/open";
import { BookingHead } from "../_lib/page-head";

export const metadata: Metadata = { title: "خدمات نوبت‌دهی" };

export default function ServicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <BookingHead title="خدمات" description="هر خدمت با مدت، قیمت، بیعانه، روش تأیید و پرسنلش. قیمت‌ها به تومان است." />
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
  const r = await attempt(Promise.all([listBookingServices(ext, { limit: 100 }), listBookingCategories(ext, { limit: 100 }), listBookingResources(ext, { limit: 100 })]));
  if (!r.ok) {
    const f = toBookingFarsiError(r.error);
    return <LoadError title="خدمات بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref="/panel/booking/services" />;
  }
  const [services, categories, resources] = r.value;
  return (
    <div className="flex flex-col gap-6">
      <BookingNav isOwner />
      <ServicesManager services={services.services} categories={categories.categories} resources={resources.resources} />
    </div>
  );
}
