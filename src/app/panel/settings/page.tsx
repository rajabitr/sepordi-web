import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { PageHeader } from "@/components/panel/overview/parts";
import { AdvancedPanelCard, PasswordForm, ProfileForm, SessionsCard } from "@/components/panel/settings/account-forms";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { requireSeller, SESSION_COOKIE } from "@/server/auth/session";

import { otherSessionCount, passwordHashOf } from "./account";

export const metadata: Metadata = { title: "تنظیمات" };

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="تنظیمات حساب" />
      <Suspense fallback={<FormPageSkeleton cards={3} rows={2} />}>
        <SettingsSection />
      </Suspense>
    </div>
  );
}

async function SettingsSection() {
  const { user } = await requireSeller();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return (
    <div className="flex flex-col gap-6">
      <ProfileForm initial={{ display_name: user.display_name, email: user.email ?? "" }} phone={user.phone} />
      <PasswordForm hasPassword={passwordHashOf(user.id) !== null} minLength={PASSWORD_MIN_LENGTH} />
      <AdvancedPanelCard />
      <SessionsCard others={otherSessionCount(user.id, token)} />
    </div>
  );
}
