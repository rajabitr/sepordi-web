import type { Metadata } from "next";
import { Suspense } from "react";

import { requireSeller } from "@/server/auth/session";
import { getTenantChannels } from "@/server/bizin/client";
import { ConversationList } from "@/components/panel/inbox/conversation-list";
import { InboxShell } from "@/components/panel/inbox/inbox-shell";
import { InboxListSkeleton } from "@/components/panel/inbox/skeletons";

export const metadata: Metadata = { title: "صندوق پیام" };

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <InboxShell
      list={
        <Suspense fallback={<InboxListSkeleton />}>
          <ListLoader />
        </Suspense>
      }
    >
      {children}
    </InboxShell>
  );
}

async function ListLoader() {
  const { shop } = await requireSeller();
  // Only decides which empty state to show: a failed read must not hide the conversations.
  const hasChannel = await getTenantChannels(shop.external_business_id)
    .then((r) => r.channels.some((c) => c.status === "connected"))
    .catch(() => true);
  return <ConversationList hasChannel={hasChannel} />;
}
