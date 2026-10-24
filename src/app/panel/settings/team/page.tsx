import type { Metadata } from "next";
import { Suspense } from "react";

import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { PageHeader } from "@/components/panel/overview/parts";
import { SettingsNav, SettingsNavSkeleton } from "@/components/panel/settings/settings-nav";
import { TeamManager } from "@/components/panel/settings/team";
import { requireCapability } from "@/server/auth/session";
import { teamOf } from "@/server/team/team";

export const metadata: Metadata = { title: "تیم" };

export default function TeamPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="تنظیمات" />
      <Suspense fallback={<SettingsNavSkeleton />}>
        <SettingsNav current="team" />
      </Suspense>
      <Suspense fallback={<FormPageSkeleton cards={3} rows={2} />}>
        <TeamSection />
      </Suspense>
    </div>
  );
}

async function TeamSection() {
  const { user, shop } = await requireCapability("team.manage");
  const team = teamOf(shop.id);
  return (
    <TeamManager
      selfId={user.id}
      members={team.members.map((m) => ({ userId: m.user_id, name: m.display_name, phone: m.phone, role: m.role, since: m.created_at }))}
      invites={team.invites.map((i) => ({ id: i.id, phone: i.phone, role: i.role, createdAt: i.created_at }))}
    />
  );
}
