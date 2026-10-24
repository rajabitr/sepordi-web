import type { Metadata } from "next";
import { Suspense } from "react";

import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { PageHeader } from "@/components/panel/overview/parts";
import { PasswordForm, ProfileForm } from "@/components/panel/settings/account-forms";
import { SettingsNav, SettingsNavSkeleton } from "@/components/panel/settings/settings-nav";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { requireSeller } from "@/server/auth/session";

import { passwordHashOf } from "./account";

export const metadata: Metadata = { title: "تنظیمات" };

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="تنظیمات" />
      <Suspense fallback={<SettingsNavSkeleton />}>
        <SettingsNav current="account" />
      </Suspense>
      <Suspense fallback={<FormPageSkeleton cards={2} rows={2} />}>
        <SettingsSection />
      </Suspense>
    </div>
  );
}

async function SettingsSection() {
  const { user } = await requireSeller();
  return (
    <div className="flex flex-col gap-6">
      <ProfileForm initial={{ display_name: user.display_name, email: user.email ?? "" }} phone={user.phone} />
      <PasswordForm hasPassword={passwordHashOf(user.id) !== null} minLength={PASSWORD_MIN_LENGTH} />
    </div>
  );
}
