import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireSeller } from "@/server/auth/session";
import { getConversation, listMessages } from "@/server/bizin/client";
import { UUID_RE } from "@/components/panel/inbox/model";
import { InlineError } from "@/components/panel/inbox/parts";
import { ThreadSkeleton } from "@/components/panel/inbox/skeletons";
import { ThreadView } from "@/components/panel/inbox/thread-view";
import { buttonVariants } from "@/components/ui/button";

import { faError, NOT_FOUND } from "../_lib/respond";

export const metadata: Metadata = { title: "گفت‌وگو" };

export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <ThreadLoader params={params} />
    </Suspense>
  );
}

async function ThreadLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return <ThreadFailed error={NOT_FOUND} />;
  const { shop } = await requireSeller();
  const ext = shop.external_business_id;
  const loaded = await Promise.all([getConversation(ext, id), listMessages(ext, id, { limit: 50 })]).then(
    ([conversation, page]) => ({ ok: true as const, conversation, page }),
    (e: unknown) => ({ ok: false as const, error: faError(e) }),
  );
  if (!loaded.ok) return <ThreadFailed error={loaded.error} />;
  return <ThreadView key={id} initialConversation={loaded.conversation} initialPage={loaded.page} />;
}

function ThreadFailed({ error }: { error: ReturnType<typeof faError> }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <InlineError error={error} />
      <Link href="/panel/inbox" className={buttonVariants({ variant: "outline", className: "min-h-11 self-start" })}>
        بازگشت به صندوق پیام
      </Link>
    </div>
  );
}
