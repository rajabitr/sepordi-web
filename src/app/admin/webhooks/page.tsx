import type { Metadata } from "next";
import { Suspense } from "react";

import { ApiError, PageHeader, SectionSkeleton } from "@/components/admin/page-parts";
import { WebhooksManager } from "@/components/admin/webhooks/webhooks-manager";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import { defaultWebhookUrl } from "@/server/admin/partner";
import * as bizin from "@/server/bizin/client";

import { createWebhookAction, deleteWebhookAction, pingWebhookAction, rotateWebhookSecretAction, setWebhookStatusAction } from "./actions";

export const metadata: Metadata = { title: "وب‌هوک‌ها" };

export default async function WebhooksPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="وب‌هوک‌ها"
        description="آدرس‌هایی که بیزین رویدادهای پیام، سفارش و کانال را به آن‌ها می‌فرستد. کلید امضا فقط هنگام ساخت یا عوض کردن نشان داده می‌شود."
      />
      <Suspense fallback={<SectionSkeleton rows={3} />}>
        <WebhookList />
      </Suspense>
    </>
  );
}

async function WebhookList() {
  await requireAdmin();
  const list = await load(bizin.listWebhooks());
  if (!list.ok) return <ApiError message={list.message} requestId={list.requestId} />;
  return (
    <WebhooksManager
      webhooks={list.data.webhooks}
      defaultUrl={defaultWebhookUrl()}
      actions={{
        create: createWebhookAction,
        ping: pingWebhookAction,
        rotate: rotateWebhookSecretAction,
        setStatus: setWebhookStatusAction,
        remove: deleteWebhookAction,
      }}
    />
  );
}
