import type { Metadata } from "next";
import { Suspense } from "react";

import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { PageHeader } from "@/components/panel/overview/parts";
import { SessionsList, TwoStepCard } from "@/components/panel/settings/security";
import { SettingsNav, SettingsNavSkeleton } from "@/components/panel/settings/settings-nav";
import { getSession, requireSeller } from "@/server/auth/session";
import { recoveryCodesLeft, twoStepEnabled } from "@/server/auth/two-step";
import { members, sessions } from "@/server/db/repo";

export const metadata: Metadata = { title: "امنیت" };

export default function SecurityPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="تنظیمات" />
      <Suspense fallback={<SettingsNavSkeleton />}>
        <SettingsNav current="security" />
      </Suspense>
      <Suspense fallback={<FormPageSkeleton cards={2} rows={3} />}>
        <SecuritySection />
      </Suspense>
    </div>
  );
}

async function SecuritySection() {
  const [{ user }, session] = await Promise.all([requireSeller(), getSession()]);
  const enabled = twoStepEnabled(user.id);
  const isOwner = members.shopsFor(user.id).some((m) => m.role === "owner");
  const list = sessions.listForUser(user.id).map((s) => ({
    current: s.token_hash === session?.tokenHash,
    createdAt: s.created_at,
    ua: s.ua,
  }));
  return (
    <div className="flex flex-col gap-6">
      <TwoStepCard enabled={enabled} offered={isOwner || enabled} recoveryLeft={enabled ? recoveryCodesLeft(user.id) : 0} />
      <SessionsList sessions={list} />
    </div>
  );
}
