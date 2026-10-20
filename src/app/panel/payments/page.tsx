import type { Metadata } from "next";
import { Suspense } from "react";

import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { LoadError, PageHeader } from "@/components/panel/overview/parts";
import { settle } from "@/components/panel/overview/settle";
import { PaymentDetailsForm } from "@/components/panel/payments/payment-details-form";
import { requireSeller } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

export const metadata: Metadata = { title: "پرداخت" };

export default function PaymentsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="پرداخت کارت‌به‌کارت"
        description="مشتری مبلغ سفارش را به این حساب واریز می‌کند و رسیدش را در گفت‌وگو می‌فرستد؛ شما رسید را در صفحه‌ی سفارش تأیید می‌کنید."
      />
      <Suspense fallback={<FormPageSkeleton cards={2} rows={4} />}>
        <PaymentsSection />
      </Suspense>
    </div>
  );
}

async function PaymentsSection() {
  const { shop } = await requireSeller();
  const details = await settle(bizin.getPaymentDetails(shop.external_business_id));
  if (!details.ok) return <LoadError title="اطلاعات پرداخت بارگذاری نشد" message={details.message} requestId={details.requestId} />;
  return (
    <PaymentDetailsForm saved={details.data} />
  );
}
