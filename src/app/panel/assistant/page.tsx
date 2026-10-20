import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { AssistantForm } from "@/components/panel/assistant/assistant-form";
import { ReturnPolicyForm } from "@/components/panel/assistant/return-policy-form";
import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { LoadError, PageHeader } from "@/components/panel/overview/parts";
import { settle } from "@/components/panel/overview/settle";
import { requireSeller } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

export const metadata: Metadata = { title: "دستیار هوشمند" };

export default function AssistantPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="دستیار هوشمند" description="دستیار با این تنظیمات به مشتری‌های شما در دایرکت و پیام جواب می‌دهد." />
      <Suspense fallback={<FormPageSkeleton cards={3} />}>
        <AssistantSection />
      </Suspense>
      <Link
        href="/panel/settings#advanced"
        className="inline-flex min-h-11 items-center gap-2 self-start font-medium text-brand-ink underline-offset-4 hover:underline"
      >
        تنظیمات بیشتر (لحن، دانش‌نامه) در پنل پیشرفته
        <ArrowLeft className="size-4" strokeWidth={2} />
      </Link>
    </div>
  );
}

async function AssistantSection() {
  const { shop } = await requireSeller();
  const ext = shop.external_business_id;
  const [assistant, policy] = await Promise.all([settle(bizin.getAssistant(ext)), settle(bizin.getReturnPolicy(ext))]);
  const noPolicy = !policy.ok && policy.code === "return_policy_not_set";
  return (
    <div className="flex flex-col gap-6">
      {assistant.ok ? (
        <AssistantForm
          initial={{
            enabled: assistant.data.enabled,
            auto_reply: assistant.data.auto_reply,
            reply_language: assistant.data.reply_language,
            persona_name: assistant.data.persona_name,
            business_profile: assistant.data.business_profile,
          }}
        />
      ) : (
        <LoadError title="تنظیمات دستیار بارگذاری نشد" message={assistant.message} requestId={assistant.requestId} />
      )}
      {policy.ok || noPolicy ? (
        <ReturnPolicyForm
          initial={policy.ok ? { enabled: policy.data.enabled, window_days: policy.data.window_days, conditions: policy.data.conditions } : null}
        />
      ) : (
        <LoadError title="قانون مرجوعی بارگذاری نشد" message={policy.message} requestId={policy.requestId} />
      )}
    </div>
  );
}
