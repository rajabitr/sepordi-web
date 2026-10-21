import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";

import { ApiError, KeyValues, PageHeader, Pill, Section, SectionSkeleton } from "@/components/admin/page-parts";
import { CHANNEL_KIND_FA, CHANNEL_STATUS_FA, label } from "@/components/admin/model/labels";
import { EntitlementsEditor } from "@/components/admin/sellers/entitlements-editor";
import { Stat } from "@/components/ui/stat";
import { formatDate } from "@/lib/date";
import { fa, faNumber } from "@/lib/utils";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import { localSeller } from "@/server/admin/sellers";
import * as bizin from "@/server/bizin/client";

import { saveEntitlementsAction } from "./actions";

export const metadata: Metadata = { title: "جزئیات فروشنده" };

type Params = Promise<{ ext: string }>;

/** Some Next versions hand a non-ASCII segment over still percent-encoded. */
function decodeParam(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function SellerDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const ext = decodeParam((await params).ext);
  return (
    <>
      <Link href="/admin/sellers" className="mb-2 inline-flex h-11 items-center gap-1 rounded-control text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" strokeWidth={1.5} />
        فروشندگان
      </Link>
      <Suspense fallback={<SectionSkeleton rows={6} />}>
        <TenantOverview ext={ext} />
      </Suspense>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <Stats ext={ext} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton rows={8} />}>
          <Entitlements ext={ext} />
        </Suspense>
      </div>
    </>
  );
}

async function TenantOverview({ ext }: { ext: string }) {
  await requireAdmin();
  const local = localSeller(ext);
  const detail = await load(bizin.getTenant(ext));
  if (!detail.ok) {
    return (
      <>
        <PageHeader title={local?.shop_name ?? ext} />
        <ApiError message={detail.message} requestId={detail.requestId} />
      </>
    );
  }
  const { tenant, channels, credit } = detail.data;
  return (
    <>
      <PageHeader
        title={tenant.name}
        description={<bdi dir="ltr" className="font-mono">{tenant.external_business_id}</bdi>}
        actions={tenant.status === "active" ? <Pill tone="success">فعال</Pill> : <Pill tone="danger">معلق</Pill>}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="فروشگاه و صاحب آن">
          <KeyValues
            items={[
              { label: "صاحب در سپردی", value: local ? `${local.display_name}` : "حساب سپردی ندارد" },
              { label: "موبایل", value: local ? fa(local.phone) : "—", ltr: Boolean(local) },
              { label: "ثبت‌نام در سپردی", value: local ? formatDate(local.user_created_at) : "—" },
              { label: "ساخت در بیزین", value: formatDate(tenant.created_at) },
              { label: "شناسه‌ی بیزین", value: tenant.id, ltr: true },
              {
                label: "اعتبار هوش مصنوعی",
                value: credit.state === "ok" ? <Pill tone="success">دارد</Pill> : <Pill tone="danger">تمام شده</Pill>,
              },
            ]}
          />
        </Section>
        <Section title="کانال‌ها">
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز کانالی وصل نشده است.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {channels.map((c) => (
                <li key={c.channel_id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{label(CHANNEL_KIND_FA, c.kind)}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.connected_at && `از ${formatDate(c.connected_at)}`}
                    <Pill tone={c.status === "connected" ? "success" : c.status === "pairing" ? "warning" : c.status === "disconnected" ? "neutral" : "danger"}>
                      {label(CHANNEL_STATUS_FA, c.status)}
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function Stats({ ext }: { ext: string }) {
  await requireAdmin();
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 3600_000);
  const stats = await load(bizin.getTenantStats(ext, { from: isoDay(from), to: isoDay(to) }));
  if (!stats.ok) return <ApiError title="آمار ۳۰ روز خوانده نشد" message={stats.message} requestId={stats.requestId} />;
  const sum = (k: "conversations_started" | "automated_replies" | "handoffs" | "orders_created") =>
    stats.data.days.reduce((s, d) => s + d[k], 0);
  return (
    <Section title="۳۰ روز گذشته">
      <div className="grid grid-cols-2 gap-3">
        <Stat size="sm" label="گفت‌وگوی تازه" value={faNumber(sum("conversations_started"))} />
        <Stat size="sm" label="پاسخ خودکار" value={faNumber(sum("automated_replies"))} />
        <Stat size="sm" label="ارجاع به انسان" value={faNumber(sum("handoffs"))} />
        <Stat size="sm" label="سفارش ثبت‌شده" value={faNumber(sum("orders_created"))} />
      </div>
    </Section>
  );
}

async function Entitlements({ ext }: { ext: string }) {
  await requireAdmin();
  const ent = await load(bizin.getShopEntitlements(ext));
  if (!ent.ok) return <ApiError title="امکانات فروشگاه خوانده نشد" message={ent.message} requestId={ent.requestId} />;
  return (
    <Section
      title="امکانات این فروشگاه"
      description={
        ent.data.contract_version
          ? `بر پایه‌ی نسخه‌ی ${fa(ent.data.contract_version)} قرارداد. سپردی فقط می‌تواند امکانات را برای یک فروشگاه محدودتر کند.`
          : "قراردادی در جریان نیست؛ همه‌ی امکانات بسته است."
      }
    >
      <EntitlementsEditor features={ent.data.features} limits={ent.data.limits} action={saveEntitlementsAction.bind(null, ext)} />
    </Section>
  );
}
