import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader, SectionSkeleton } from "@/components/admin/page-parts";
import { SettingsForm } from "@/components/admin/settings/settings-form";
import { requireAdmin } from "@/server/auth/session";
import { loadAdminSettings } from "@/server/admin/settings";

import { saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "تنظیمات سایت" };

export default async function SettingsPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="تنظیمات سایت" description="طرح‌های اعتبار، راه‌های پشتیبانی و کارت مقصد کارت‌به‌کارت که در سایت و پنل فروشنده دیده می‌شوند." />
      <Suspense fallback={<SectionSkeleton rows={10} />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  await requireAdmin();
  return <SettingsForm initial={loadAdminSettings()} save={saveSettingsAction} />;
}
