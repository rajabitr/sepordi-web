import type { Metadata } from "next";
import { Suspense } from "react";

import {
  CreditStateCard,
  CreditStateSkeleton,
  MyCreditOrders,
  MyCreditOrdersSkeleton,
  PlansSection,
  PlansSkeleton,
  SupportCard,
} from "@/components/panel/credit/sections";
import { PageHeader } from "@/components/panel/overview/parts";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "اعتبار" };

type SearchParams = Promise<{ payment?: string | string[] }>;

export default function CreditPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="اعتبار دستیار" description="هر پاسخ خودکار دستیار از اعتبار کم می‌شود. با خرید بسته، اعتبار شارژ می‌شود." />
      <Suspense fallback={null}>
        <PaymentOutcome searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<CreditStateSkeleton />}>
        <CreditStateCard />
      </Suspense>
      <section className="flex flex-col gap-4" aria-labelledby="plans-title">
        <h2 id="plans-title" className="text-lg font-semibold leading-tight">
          بسته‌ها
        </h2>
        <Suspense fallback={<PlansSkeleton />}>
          <PlansSection />
        </Suspense>
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<MyCreditOrdersSkeleton />}>
            <MyCreditOrders />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <SupportCard />
        </Suspense>
      </div>
    </div>
  );
}

const OUTCOMES = {
  paid: { variant: "success", title: "پرداخت انجام شد", body: "پشتیبانی به‌زودی اعتبار را شارژ می‌کند؛ وضعیت را در «خریدهای من» ببینید." },
  cancelled: { variant: "warning", title: "پرداخت لغو شد", body: "مبلغی کم نشده است. هر وقت خواستید دوباره بخرید." },
  failed: { variant: "destructive", title: "پرداخت ناموفق بود", body: "اگر مبلغی از حسابتان کم شده، طی ۷۲ ساعت به حسابتان برمی‌گردد." },
  unknown: { variant: "warning", title: "نتیجه‌ی پرداخت هنوز روشن نیست", body: "اگر مبلغی کم شده، با پشتیبانی تماس بگیرید تا بررسی کنیم." },
} as const;

async function PaymentOutcome({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).payment;
  const key = typeof raw === "string" && raw in OUTCOMES ? (raw as keyof typeof OUTCOMES) : null;
  if (!key) return null;
  const o = OUTCOMES[key];
  return (
    <Alert variant={o.variant} title={o.title}>
      {o.body}
    </Alert>
  );
}
