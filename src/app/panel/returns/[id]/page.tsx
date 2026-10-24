import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ImageOff, MessagesSquare, SearchX } from "lucide-react";

import { isNotEntitled } from "@/components/panel/orders/entitlement";
import { LoadError } from "@/components/panel/orders/load-error";
import { NotEntitled } from "@/components/panel/orders/not-entitled";
import { UUID_RE, channelLabel } from "@/components/panel/orders/model";
import { OrderDetailSkeleton } from "@/components/panel/orders/skeletons";
import { CaseStateBadge } from "@/components/panel/returns/badges";
import { CaseActions } from "@/components/panel/returns/case-actions";
import {
  caseActorLabel,
  caseEventLabel,
  caseKindLabel,
  caseNoticeLabel,
  caseRejectReasonLabel,
  type Case,
} from "@/components/panel/returns/model";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline } from "@/components/ui/timeline";
import { formatDateTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";
import { requireCapability } from "@/server/auth/session";
import { getCase } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";

export const metadata: Metadata = { title: "درخواست مرجوعی" };

type Params = Promise<{ id: string }>;

export default function CasePage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/returns" className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" strokeWidth={1.5} />
        همه‌ی درخواست‌ها
      </Link>
      <Suspense fallback={<OrderDetailSkeleton />}>
        <CaseSection params={params} />
      </Suspense>
    </div>
  );
}

function CaseMissing() {
  return (
    <EmptyState
      icon={SearchX}
      className="min-h-80 justify-center"
      title="این درخواست پیدا نشد"
      description="شاید نشانی را اشتباه باز کرده‌اید، یا بخش مرجوعی برای فروشگاه شما فعال نیست."
      action={
        <Link href="/panel/returns" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
          بازگشت به مرجوعی‌ها
        </Link>
      }
    />
  );
}

async function CaseSection({ params }: { params: Params }) {
  const { id } = await params;
  const { shop } = await requireCapability("returns.view");
  if (!UUID_RE.test(id)) return <CaseMissing />;

  let c: Case;
  try {
    c = await getCase(shop.external_business_id, id);
  } catch (e) {
    if (isBizinError(e) && e.status === 404) return <CaseMissing />;
    if (isNotEntitled(e)) return <NotEntitled />;
    const f = toFarsiError(e);
    return <LoadError title="درخواست بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref={`/panel/returns/${id}`} />;
  }

  const events = [...c.events].sort((a, b) => a.seq - b.seq);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 className="text-2xl font-bold leading-tight">
              {caseKindLabel(c.kind)} <span dir="ltr" className="tabular-nums">{fa(c.code)}</span>
            </h1>
            <CaseStateBadge state={c.state} />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">ثبت در {formatDateTime(c.created_at)}</p>
        </div>
        <CaseActions caseId={c.id} code={c.code} state={c.state} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>نوشته‌ی مشتری</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p dir="auto" className="whitespace-pre-wrap break-words leading-8">
                {c.customer_text.trim() || "مشتری توضیحی ننوشته است."}
              </p>
              {c.state === "rejected" && c.reject_reason && (
                <p className="text-sm text-muted-foreground">دلیل رد: {caseRejectReasonLabel(c.reject_reason)}</p>
              )}
              {c.state === "refunded" && c.refund && (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">مبلغ برگشت داده‌شده</dt>
                    <dd className="tabular-nums">{c.refund.amount !== null ? formatToman(c.refund.amount) : "ثبت نشده"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">کد پیگیری واریز</dt>
                    <dd dir="ltr" className="text-end tabular-nums">{c.refund.reference ? fa(c.refund.reference) : "ثبت نشده"}</dd>
                  </div>
                </dl>
              )}
              {c.note && <p className="rounded-md bg-muted px-3 py-2 text-sm leading-7">یادداشت داخلی: {c.note}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>عکس‌ها {c.photos.length > 0 && <span className="text-sm font-normal text-muted-foreground">({fa(c.photos.length)})</span>}</CardTitle>
            </CardHeader>
            <CardContent>
              {c.photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">مشتری عکسی نفرستاده است.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {c.photos.map((p, i) => (
                    <li key={p.id} className="aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                      {p.content_type ? (
                        <a
                          href={`/panel/case-photos/${c.id}/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`باز کردن عکس ${fa(i + 1)} در اندازه‌ی کامل`}
                        >
                          {/* A private, no-store proxy of the seller's own case photo. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/panel/case-photos/${c.id}/${p.id}`}
                            alt={`عکس ${fa(i + 1)} که مشتری فرستاده است`}
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        </a>
                      ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                          <ImageOff className="size-5" strokeWidth={1.5} />
                          این عکس دیگر در دسترس نیست
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>سفارش و مشتری</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">سفارش</dt>
                  <dd>
                    {c.order ? (
                      <Link href={`/panel/orders/${c.order.id}`} className="inline-flex min-h-11 items-center font-medium text-brand-ink tabular-nums hover:underline">
                        {c.order.code ? `سفارش ${fa(c.order.code)}` : "مشاهده‌ی سفارش"}
                      </Link>
                    ) : (
                      <span className="text-warning">مشتری سفارش مشخصی نام نبرده است</span>
                    )}
                  </dd>
                </div>
                {c.days_since_ship !== null && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">فاصله از ارسال</dt>
                    <dd className="tabular-nums">{fa(c.days_since_ship)} روز</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">نام</dt>
                  <dd className="truncate">{c.customer.name?.trim() || "ثبت نشده"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">موبایل</dt>
                  <dd>{c.customer.phone ? <span dir="ltr" className="tabular-nums">{fa(c.customer.phone)}</span> : "ثبت نشده"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">کانال</dt>
                  <dd>{channelLabel(c.customer.channel)}</dd>
                </div>
              </dl>
              <Link
                href={`/panel/inbox/${encodeURIComponent(c.customer.conversation_id)}`}
                className={buttonVariants({ variant: "outline", className: "min-h-11 w-full" })}
              >
                <MessagesSquare className="size-4" strokeWidth={1.5} />
                مشاهده‌ی گفت‌وگو
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>سابقه</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                activeIndex={events.length - 1}
                items={events.map((ev) => ({
                  title: `${caseEventLabel(ev.action)}، ${caseActorLabel(ev.actor)}`,
                  date: formatDateTime(ev.occurred_at),
                  description: caseNoticeLabel(ev.notice) ?? undefined,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
