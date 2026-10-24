import type { Metadata } from "next";
import { Suspense } from "react";

import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { PageHeader } from "@/components/panel/overview/parts";
import { NotificationsForm } from "@/components/panel/settings/notifications-form";
import { SettingsNav, SettingsNavSkeleton } from "@/components/panel/settings/settings-nav";
import { requireSeller } from "@/server/auth/session";
import { familiesFor, getNotifyPrefs } from "@/server/notifications/prefs";

export const metadata: Metadata = { title: "اعلان‌ها" };

export default function NotificationSettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="تنظیمات" />
      <Suspense fallback={<SettingsNavSkeleton />}>
        <SettingsNav current="notifications" />
      </Suspense>
      <Suspense fallback={<FormPageSkeleton cards={1} rows={5} />}>
        <NotificationsSection />
      </Suspense>
    </div>
  );
}

async function NotificationsSection() {
  const { user, shop, role } = await requireSeller();
  return <NotificationsForm families={familiesFor(role)} initialMuted={getNotifyPrefs(user.id, shop.id).muted} />;
}
