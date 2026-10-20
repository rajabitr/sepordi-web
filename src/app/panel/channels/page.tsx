import type { Metadata } from "next";
import { Suspense } from "react";

import type { ChannelView } from "@/components/panel/channels/channel-meta";
import { ChannelsGrid } from "@/components/panel/channels/channels-grid";
import { ApiErrorAlert } from "@/components/panel/products/api-error";
import { PageHeader } from "@/components/panel/products/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSeller } from "@/server/auth/session";
import { getTenantChannels } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";

export const metadata: Metadata = { title: "کانال‌ها" };

async function ChannelsData() {
  const { shop } = await requireSeller();
  let channels: ChannelView[];
  try {
    channels = (await getTenantChannels(shop.external_business_id)).channels;
  } catch (e) {
    const f = toFarsiError(e);
    return <ApiErrorAlert title="کانال‌ها بارگذاری نشد" message={f.message} requestId={f.requestId} />;
  }
  return (
    <ChannelsGrid channels={channels} />
  );
}

function ChannelsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="در حال بارگذاری کانال‌ها…">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-80 rounded-surface" />
      ))}
    </div>
  );
}

export default function ChannelsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="کانال‌ها" description="جایی که مشتری‌ها پیام می‌دهند را وصل کنید تا دستیار از فهرست محصولات شما جوابشان را بدهد." />
      <Suspense fallback={<ChannelsSkeleton />}>
        <ChannelsData />
      </Suspense>
    </div>
  );
}
