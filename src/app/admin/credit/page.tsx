import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CreditDecision } from "@/components/admin/credit/credit-decision";
import { CREDIT_STATUS_FA, PAYMENT_METHOD_FA, PLAN_FA, label } from "@/components/admin/model/labels";
import { PageHeader, Pill, SectionSkeleton } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/date";
import { formatTomanValue } from "@/lib/money";
import { fa } from "@/lib/utils";
import { CREDIT_STATUSES, listCreditQueue, type CreditStatus } from "@/server/admin/credit";
import { requireAdmin } from "@/server/auth/session";

import { decideCreditOrderAction } from "./actions";

export const metadata: Metadata = { title: "سفارش‌های اعتبار" };

type Search = Promise<{ status?: string }>;

const TONE = { pending: "warning", paid: "brand", granted: "success", rejected: "danger", failed: "danger", cancelled: "neutral" } as const;

const FILTERS: { value: CreditStatus | "all"; label: string }[] = [
  { value: "pending", label: "در انتظار تأیید پرداخت" },
  { value: "paid", label: "در انتظار شارژ" },
  { value: "granted", label: "شارژ شده" },
  { value: "rejected", label: "رد شده" },
  { value: "all", label: "همه" },
];

export default async function CreditPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const { status: raw } = await searchParams;
  const status: CreditStatus | "all" = raw === "all" || (CREDIT_STATUSES as string[]).includes(raw ?? "") ? (raw as CreditStatus | "all") : "pending";
  return (
    <>
      <PageHeader
        title="سفارش‌های اعتبار"
        description="فروشنده طرح را می‌خرد. واریز کارت‌به‌کارت را این‌جا با «پرداخت تأیید شد» تأیید می‌کنید (پرداخت درگاه خودکار تأیید می‌شود)؛ اپراتور بیزین اعتبار را شارژ می‌کند و بعد شما «شارژ شد» را می‌زنید."
      />
      <nav aria-label="فیلتر وضعیت" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/credit?status=${f.value}`}
            aria-current={status === f.value ? "page" : undefined}
            className={buttonVariants({ variant: status === f.value ? "secondary" : "ghost", size: "lg" })}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Suspense key={status} fallback={<SectionSkeleton rows={6} />}>
        <Queue status={status} />
      </Suspense>
    </>
  );
}

async function Queue({ status }: { status: CreditStatus | "all" }) {
  await requireAdmin();
  const rows = listCreditQueue(status);
  if (rows.length === 0) {
    return <EmptyState title={status === "pending" || status === "paid" ? "سفارشی منتظر شما نیست" : "سفارشی با این وضعیت نیست"} />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>فروشگاه</TableHead>
          <TableHead>طرح</TableHead>
          <TableHead>مبلغ</TableHead>
          <TableHead>روش و شماره‌ی پیگیری</TableHead>
          <TableHead>ثبت</TableHead>
          <TableHead>وضعیت</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => {
          const amount = formatTomanValue(o.amount_toman);
          const shop = o.shop_name ?? "فروشگاه حذف‌شده";
          return (
            <TableRow key={o.id}>
              <TableCell>
                {o.ext ? (
                  <Link href={`/admin/sellers/${encodeURIComponent(o.ext)}`} className="font-medium text-brand-ink underline-offset-4 hover:underline">
                    {shop}
                  </Link>
                ) : (
                  <span className="font-medium">{shop}</span>
                )}
                {o.phone && <bdi dir="ltr" className="block text-xs text-muted-foreground">{fa(o.phone)}</bdi>}
              </TableCell>
              <TableCell>{label(PLAN_FA, o.plan_code)}</TableCell>
              <TableCell numeric className="whitespace-nowrap font-semibold">{amount}</TableCell>
              <TableCell>
                <span className="block">{label(PAYMENT_METHOD_FA, o.method)}</span>
                {o.ref ? <bdi dir="ltr" className="block font-mono text-xs">{fa(o.ref)}</bdi> : <span className="text-xs text-muted-foreground">بدون شماره</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-2">
                  <Pill tone={TONE[o.status]}>{label(CREDIT_STATUS_FA, o.status)}</Pill>
                  {o.reviewed_by && o.reviewed_at && (
                    <span className="text-xs text-muted-foreground">
                      {o.reviewed_by}، {formatDateTime(o.reviewed_at)}
                      {o.review_note && <span className="block text-foreground">{o.review_note}</span>}
                    </span>
                  )}
                  {((o.status === "pending" && o.method === "card_to_card") || o.status === "paid") && (
                    <CreditDecision
                      stage={o.status === "paid" ? "grant" : "verify"}
                      summary={`${shop}، طرح ${label(PLAN_FA, o.plan_code)}، ${amount}`}
                      decide={decideCreditOrderAction.bind(null, o.id)}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
