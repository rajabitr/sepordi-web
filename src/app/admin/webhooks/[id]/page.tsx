import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { ApiError, PageHeader, Pill, SectionSkeleton } from "@/components/admin/page-parts";
import { DELIVERY_ERROR_FA, DELIVERY_STATE_FA, EVENT_TYPE_FA, label } from "@/components/admin/model/labels";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/date";
import { fa } from "@/lib/utils";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

export const metadata: Metadata = { title: "تحویل‌های وب‌هوک" };

type Params = Promise<{ id: string }>;
type Search = Promise<{ cursor?: string }>;

const TONE = { pending: "warning", delivered: "success", dead: "danger", cancelled: "neutral" } as const;

export default async function WebhookDeliveriesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireAdmin();
  const { id } = await params;
  const { cursor } = await searchParams;
  return (
    <>
      <Link href="/admin/webhooks" className="mb-2 inline-flex h-11 items-center gap-1 rounded-control text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" strokeWidth={1.5} />
        وب‌هوک‌ها
      </Link>
      <Suspense key={cursor ?? ""} fallback={<SectionSkeleton rows={8} />}>
        <Deliveries id={id} cursor={cursor} />
      </Suspense>
    </>
  );
}

async function Deliveries({ id, cursor }: { id: string; cursor?: string }) {
  await requireAdmin();
  const [hook, page] = await Promise.all([load(bizin.getWebhook(id)), load(bizin.listWebhookDeliveries(id, { limit: 50, cursor }))]);
  if (!hook.ok) return <ApiError message={hook.message} requestId={hook.requestId} />;
  return (
    <>
      <PageHeader title="تحویل‌های وب‌هوک" description={<bdi dir="ltr" className="break-all font-mono">{hook.data.webhook.url}</bdi>} />
      {!page.ok ? (
        <ApiError message={page.message} requestId={page.requestId} />
      ) : page.data.deliveries.length === 0 ? (
        <EmptyState title="هنوز رویدادی فرستاده نشده است" description="با «آزمایش» در صفحه‌ی وب‌هوک‌ها یک رویداد آزمایشی بفرستید." />
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رویداد</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>تلاش</TableHead>
                <TableHead>پاسخ</TableHead>
                <TableHead>آخرین تلاش</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.deliveries.map((d) => (
                <TableRow key={d.event_id}>
                  <TableCell>
                    <span className="block">{label(EVENT_TYPE_FA, d.event_type)}</span>
                    <bdi dir="ltr" className="block font-mono text-xs text-muted-foreground">{d.event_id}</bdi>
                  </TableCell>
                  <TableCell>
                    <Pill tone={TONE[d.state]}>{label(DELIVERY_STATE_FA, d.state)}</Pill>
                  </TableCell>
                  <TableCell numeric>{fa(d.attempts)}</TableCell>
                  <TableCell>
                    {d.last_status !== null && <bdi dir="ltr" className="font-mono">{fa(d.last_status)}</bdi>}
                    {d.last_error && <span className="block text-xs text-destructive">{label(DELIVERY_ERROR_FA, d.last_error)}</span>}
                    {d.last_status === null && !d.last_error && "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {d.last_attempt_at ? formatDateTime(d.last_attempt_at) : formatDateTime(d.occurred_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <nav aria-label="صفحه‌بندی" className="flex flex-wrap justify-between gap-2">
            {cursor ? (
              <Link href={`/admin/webhooks/${id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                تازه‌ترین‌ها
              </Link>
            ) : (
              <span />
            )}
            {page.data.next_cursor && (
              <Link href={`/admin/webhooks/${id}?cursor=${encodeURIComponent(page.data.next_cursor)}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                قدیمی‌ترها
                <ArrowLeft strokeWidth={2} />
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
