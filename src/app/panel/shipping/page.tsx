import type { Metadata } from "next";
import { Suspense } from "react";

import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { LoadError, PageHeader } from "@/components/panel/overview/parts";
import { settle } from "@/components/panel/overview/settle";
import { isNotEntitled } from "@/components/panel/orders/entitlement";
import { NotEntitled } from "@/components/panel/orders/not-entitled";
import { fromApi } from "@/components/panel/shipping/model";
import { ShippingForm } from "@/components/panel/shipping/shipping-form";
import { requireCapability } from "@/server/auth/session";
import { can } from "@/server/team/roles";
import * as bizin from "@/server/bizin/client";

export const metadata: Metadata = { title: "ارسال" };

export default function ShippingPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="ارسال" description="هزینه‌ی پست و پیک را یک بار بنویسید؛ دستیار آن را روی هر سفارش می‌گذارد." />
      <Suspense fallback={<FormPageSkeleton cards={2} rows={2} />}>
        <ShippingSection />
      </Suspense>
    </div>
  );
}

async function ShippingSection() {
  const { shop, role } = await requireCapability("shipping.view");
  const shipping = await settle(bizin.getShipping(shop.external_business_id));
  if (!shipping.ok && isNotEntitled(shipping)) {
    return <NotEntitled description="وقتی فعال شود، هزینه‌ی پست و پیک را این‌جا می‌نویسید و دستیار آن را روی هر سفارش می‌گذارد." />;
  }
  if (!shipping.ok) return <LoadError title="قانون ارسال بارگذاری نشد" message={shipping.message} requestId={shipping.requestId} />;
  return (
    <ShippingForm initial={fromApi(shipping.data)} readOnly={!can(role, "shipping.edit")} />
  );
}
