import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingNav } from "@/components/panel/booking/booking-nav";
import { BookingGateState } from "@/components/panel/booking/gate-state";
import { SettingsForm } from "@/components/panel/booking/settings-form";
import { BookingFormSkeleton } from "@/components/panel/booking/skeletons";

import { openBooking } from "../_lib/open";
import { BookingHead } from "../_lib/page-head";

export const metadata: Metadata = { title: "تنظیمات نوبت‌دهی" };

export default function BookingSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <BookingHead title="تنظیمات نوبت‌دهی" description="نوبت‌دهی دستیار، بازه‌ی نوبت، فاصله تا نوبت، مهلت لغو و بیعانه." />
      <Suspense fallback={<BookingFormSkeleton />}>
        <Section />
      </Suspense>
    </div>
  );
}

async function Section() {
  const { gate } = await openBooking("owner");
  if (gate.state !== "ready") return <BookingGateState gate={gate} />;
  return (
    <div className="flex flex-col gap-6">
      <BookingNav isOwner />
      <SettingsForm settings={gate.settings} />
    </div>
  );
}
