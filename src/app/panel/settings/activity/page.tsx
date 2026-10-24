import type { Metadata } from "next";
import { Suspense } from "react";

import { ActivityFilters, ActivityList } from "@/components/panel/settings/activity";
import { FormPageSkeleton } from "@/components/panel/overview/form-skeleton";
import { PageHeader } from "@/components/panel/overview/parts";
import { SettingsNav, SettingsNavSkeleton } from "@/components/panel/settings/settings-nav";
import { requireCapability } from "@/server/auth/session";
import { ACTIVITY_GROUPS, activityLabel, listActivity } from "@/server/audit";
import { parseActivityQuery } from "@/server/audit/filters";
import { members } from "@/server/db/repo";
import { ROLE_FA } from "@/server/team/roles";

export const metadata: Metadata = { title: "فعالیت‌ها" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="تنظیمات" />
      <Suspense fallback={<SettingsNavSkeleton />}>
        <SettingsNav current="activity" />
      </Suspense>
      <Suspense fallback={<FormPageSkeleton cards={1} rows={6} />}>
        <ActivitySection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PAGE = 50;

/** Owner and «مالی»: who replied, approved a receipt or moved an order, newest first. */
async function ActivitySection({ searchParams }: { searchParams: SearchParams }) {
  const [{ shop }, q] = await Promise.all([requireCapability("activity.view"), searchParams]);
  const { query, from, to } = parseActivityQuery(q);
  const team = members.list(shop.id);
  const rows = listActivity(shop.id, { userId: query.member, group: query.group, from, to, limit: PAGE });
  return (
    <div className="flex flex-col gap-6">
      <ActivityFilters
        query={query}
        members={team.map((m) => ({ value: m.user_id, label: `${m.display_name || m.phone} (${ROLE_FA[m.role]})` }))}
        groups={Object.entries(ACTIVITY_GROUPS).map(([value, label]) => ({ value, label }))}
      />
      <ActivityList
        rows={rows.map((r) => ({
          id: r.id,
          label: activityLabel(r.action),
          who: r.display_name || r.phone || "عضو حذف‌شده",
          target: r.target_id,
          at: r.created_at,
        }))}
        capped={rows.length === PAGE}
      />
    </div>
  );
}
