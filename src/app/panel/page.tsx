import type { Metadata } from "next";
import { Suspense } from "react";

import { UpcomingBookingsCard } from "@/components/panel/booking/upcoming-bookings-card";
import {
  CreditBanner,
  NeedsYou,
  NeedsYouSkeleton,
  SetupChecklist,
  SetupChecklistSkeleton,
  StatsSection,
  StatsSkeleton,
  Welcome,
  WelcomeSkeleton,
} from "@/components/panel/overview/sections";

export const metadata: Metadata = { title: "داشبورد" };

export default function PanelOverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string | string[] }> }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<WelcomeSkeleton />}>
        <Welcome searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <CreditBanner />
      </Suspense>
      <Suspense fallback={<NeedsYouSkeleton />}>
        <NeedsYou />
      </Suspense>
      {/* No skeleton: most shops have no booking, and the card must not flash in and out for them. */}
      <Suspense fallback={null}>
        <UpcomingBookingsCard />
      </Suspense>
      <Suspense fallback={<SetupChecklistSkeleton />}>
        <SetupChecklist />
      </Suspense>
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>
    </div>
  );
}
