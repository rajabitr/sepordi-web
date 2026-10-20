import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { ApiError, KeyValues, PageHeader, Pill, Section, SectionSkeleton } from "@/components/admin/page-parts";
import { ALL_SCOPES, missingScopes } from "@/components/admin/model/labels";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { relativeTime } from "@/lib/date";
import { fa, faNumber } from "@/lib/utils";
import { pendingCreditCount } from "@/server/admin/credit";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import { countTenants } from "@/server/admin/partner";
import { localShopCount, recentLocalSellers } from "@/server/admin/sellers";
import * as bizin from "@/server/bizin/client";

export const metadata: Metadata = { title: "نمای کلی" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="نمای کلی" description="وضعیت اتصال سپردی به بیزین و کارهای در انتظار." />
      <div className="flex flex-col gap-6">
        <Suspense fallback={<CountsSkeleton />}>
          <Counts />
        </Suspense>
        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense fallback={<SectionSkeleton rows={5} />}>
            <PartnerIdentity />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={6} />}>
            <RecentSignups />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function CountsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

async function Counts() {
  await requireAdmin();
  const tenants = await load(countTenants());
  const local = localShopCount();
  const pending = pendingCreditCount();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat
        label="فروشگاه‌ها در بیزین"
        value={tenants.ok ? `${faNumber(tenants.data.count)}${tenants.data.capped ? "+" : ""}` : "—"}
        unit={tenants.ok ? "فروشگاه" : undefined}
      />
      <Stat label="فروشگاه‌های ثبت‌شده در سپردی" value={faNumber(local)} unit="فروشگاه" />
      <Link href="/admin/credit?status=pending" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Stat label="سفارش اعتبار در انتظار بررسی" value={faNumber(pending)} unit="سفارش" className={pending > 0 ? "border-warning/40" : undefined} />
      </Link>
      {!tenants.ok && <ApiError className="sm:col-span-3" title="شمارش فروشگاه‌های بیزین انجام نشد" message={tenants.message} requestId={tenants.requestId} />}
    </div>
  );
}

async function PartnerIdentity() {
  await requireAdmin();
  const me = await load(bizin.getMe());
  if (!me.ok) return <ApiError title="هویت کلید سپردی خوانده نشد" message={me.message} requestId={me.requestId} />;
  const missing = missingScopes(me.data.scopes);
  const { limits } = me.data;
  return (
    <Section title="کلید سپردی در بیزین" description="این کلید به همه‌ی فروشگاه‌های سپردی دسترسی دارد و فقط روی سرور است.">
      <KeyValues
        items={[
          { label: "شناسه‌ی همکار", value: me.data.partner_id, ltr: true },
          { label: "شناسه‌ی کلید", value: me.data.key_id, ltr: true },
          {
            label: "دسترسی‌ها",
            value: (
              <span className="flex items-center gap-2">
                {fa(me.data.scopes.length)} از {fa(ALL_SCOPES.length)}
                <Pill tone={missing.length ? "danger" : "success"}>{missing.length ? "ناقص" : "کامل"}</Pill>
              </span>
            ),
          },
          { label: "سقف درخواست", value: `${faNumber(limits.api_rate_per_minute)} در دقیقه، تا ${faNumber(limits.api_burst)} پشت‌سرهم` },
          { label: "سقف ساخت فروشگاه", value: `${faNumber(limits.provision_per_day)} در روز` },
        ]}
      />
      {missing.length > 0 && (
        <Alert variant="destructive" title={`${fa(missing.length)} دسترسی روی کلید نیست`} className="mt-4">
          <p>بخش‌هایی که به این دسترسی‌ها نیاز دارند خطا می‌دهند. از پشتیبانی بیزین بخواهید کلید را کامل کند:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map((s) => (
              <li key={s}>
                <code dir="ltr" className="rounded-sm bg-background px-2 py-1 font-mono text-xs">{s}</code>
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </Section>
  );
}

async function RecentSignups() {
  await requireAdmin();
  const rows = recentLocalSellers(8);
  const now = new Date();
  return (
    <Section
      title="آخرین ثبت‌نام‌ها"
      actions={
        <Link href="/admin/sellers" className="inline-flex h-11 items-center gap-1 rounded-control px-3 text-sm font-semibold text-brand-ink hover:bg-secondary">
          همه‌ی فروشندگان
          <ArrowLeft className="size-4" strokeWidth={2} />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">هنوز فروشنده‌ای در سپردی ثبت‌نام نکرده است.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.shop_id}>
              <Link href={`/admin/sellers/${encodeURIComponent(r.ext)}`} className="flex min-h-14 items-center justify-between gap-3 rounded-control px-2 py-2 hover:bg-secondary">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.shop_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.display_name} · <bdi dir="ltr">{fa(r.phone)}</bdi>
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(r.shop_created_at, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
