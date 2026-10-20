import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandIdentityForm, DisclosureForm, LogoUpload } from "@/components/admin/branding/branding-forms";
import { BRAND_MODE_FA, label } from "@/components/admin/model/labels";
import { ApiError, KeyValues, PageHeader, Section, SectionSkeleton } from "@/components/admin/page-parts";
import { formatDateTime } from "@/lib/date";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

import { saveBrandingAction, saveDisclosureAction, uploadLogoAction } from "./actions";

export const metadata: Metadata = { title: "برند" };

export default async function BrandingPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="برند" description="نامی که فروشگاه‌ها و مشتری‌هایشان از سپردی در بیزین می‌بینند، و متنی که دستیار در شروع گفت‌وگو می‌فرستد." />
      <Suspense fallback={<SectionSkeleton rows={8} />}>
        <Branding />
      </Suspense>
    </>
  );
}

async function Branding() {
  await requireAdmin();
  const b = await load(bizin.getBranding());
  if (!b.ok) return <ApiError message={b.message} requestId={b.requestId} />;
  const brand = b.data;
  const disclosure = brand.disclosures.fa;
  return (
    <div className="flex flex-col gap-6">
      <Section title="حالت نمایش">
        <KeyValues
          items={[
            { label: "حالت برند", value: `${label(BRAND_MODE_FA, brand.mode)} (فقط پشتیبانی بیزین تغییر می‌دهد)` },
            { label: "آخرین تغییر", value: brand.updated_at ? formatDateTime(brand.updated_at) : "هنوز تغییری ثبت نشده" },
          ]}
        />
      </Section>
      <Section title="نام و پشتیبانی">
        <BrandIdentityForm names={brand.names} supportLabel={brand.support_label} supportUrl={brand.support_url} save={saveBrandingAction} />
      </Section>
      <Section
        title="متن اطلاع‌رسانی دستیار"
        description="اولین پیام هر گفت‌وگو. قانون بیزین: باید بگوید پاسخ‌ها خودکار است و راه گفت‌وگو با انسان را بدهد."
      >
        <DisclosureForm text={disclosure.text} isDefault={disclosure.source === "default"} save={saveDisclosureAction} />
      </Section>
      <Section title="لوگو">
        <LogoUpload logoUrl={brand.logo_url} upload={uploadLogoAction} />
      </Section>
    </div>
  );
}
