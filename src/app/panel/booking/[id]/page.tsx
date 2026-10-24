import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight, MessagesSquare } from "lucide-react";

import { BookingStatusBadge, PaymentStateBadge } from "@/components/panel/booking/badges";
import { BookingActions } from "@/components/panel/booking/booking-actions";
import { BookingGateState } from "@/components/panel/booking/gate-state";
import { BookingFormSkeleton } from "@/components/panel/booking/skeletons";
import { ReceiptViewer } from "@/components/panel/booking/receipt-viewer";
import { BOOKING_MANAGE, BOOKING_PAYMENTS, UUID_RE, conflictLabel, durationLabel, sourceLabel, statusMeta } from "@/components/panel/booking/model";
import { tehranDay } from "@/components/panel/orders/model";
import { LoadError } from "@/components/panel/orders/load-error";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatDateWithWeekday, formatTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";
import { can } from "@/server/team/roles";
import { getBooking, listBookingResources } from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";
import { isBizinError } from "@/server/bizin/error";

import { openBooking } from "../_lib/open";

export const metadata: Metadata = { title: "جزئیات نوبت" };

const EVENT_FA: Record<string, string> = {
  created: "درخواست نوبت",
  accept: "ثبت نوبت",
  approve: "تأیید نوبت",
  reject: "رد درخواست",
  confirm_payment: "تأیید بیعانه",
  reject_payment: "رد رسید",
  cancel: "لغو",
  hold_replaced: "جایگزینی با زمان دیگر",
  reschedule: "تغییر زمان",
  complete: "انجام شد",
  no_show: "مشتری نیامد",
  expire: "منقضی شد",
  receipt_attached: "رسید رسید",
  payment_overdue: "مهلت واریز گذشت",
};

const ACTOR_FA: Record<string, string> = { customer: "مشتری", assistant: "دستیار", flow: "فرم گفت‌وگو", seller: "فروشنده", system: "سیستم" };
const CHANNEL_FA: Record<string, string> = { whatsapp: "واتس‌اپ", instagram: "اینستاگرام", telegram: "تلگرام" };

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/booking" className={buttonVariants({ variant: "ghost", className: "min-h-11 self-start" })}>
        <ArrowRight className="size-4" strokeWidth={1.5} />
        همه‌ی نوبت‌ها
      </Link>
      <Suspense fallback={<BookingFormSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { ctx, gate } = await openBooking("desk");
  if (gate.state !== "ready") return <BookingGateState gate={gate} />;
  const ext = ctx.shop.external_business_id;

  let b;
  try {
    b = await getBooking(ext, id);
  } catch (e) {
    if (isBizinError(e) && e.code === "booking_not_found") notFound();
    const f = toBookingFarsiError(e);
    return <LoadError title="نوبت بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref={`/panel/booking/${id}`} />;
  }
  const resources = await listBookingResources(ext, { limit: 100 }).catch(() => null);
  const resource = resources?.resources.find((r) => r.id === b.resource_id);
  const canPay = can(ctx.role, BOOKING_PAYMENTS);
  const hasDeposit = b.deposit !== null && b.deposit > 0;
  const now = new Date();
  const noShowNotBefore = new Date(Date.parse(b.starts_at) + gate.settings.no_show_after_min * 60_000).toISOString();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold leading-tight">نوبت {fa(b.code)}</h1>
          <BookingStatusBadge status={b.status} />
          {hasDeposit && <PaymentStateBadge state={b.payment_state} />}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDateWithWeekday(b.starts_at)}، ساعت {formatTime(b.starts_at)} تا {formatTime(b.ends_at)}
        </p>
        {b.conflict && (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle className="size-4" strokeWidth={2} />
            {conflictLabel(b.conflict)}؛ زمان نوبت را عوض کنید یا با مشتری هماهنگ کنید.
          </p>
        )}
        {b.status === "pending_approval" && b.approval_due_at && (
          <p className="text-sm text-muted-foreground">اگر تا {formatDateTime(b.approval_due_at)} تأیید نشود، خودکار منقضی می‌شود.</p>
        )}
      </header>

      <BookingActions
        bookingId={b.id}
        code={b.code}
        status={b.status}
        serviceId={b.service_id}
        summary={`${b.customer_name || "مشتری"}، ${b.service_title}، ${formatDateWithWeekday(b.starts_at)} ساعت ${formatTime(b.starts_at)}`}
        canVerifyPayments={canPay}
        canManage={can(ctx.role, BOOKING_MANAGE)}
        noShowNotBefore={b.status === "confirmed" && now.getTime() < Date.parse(noShowNotBefore) ? noShowNotBefore : null}
        today={tehranDay(now)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">مشتری</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="نام">{b.customer_name || "ثبت نشده"}</Row>
            <Row label="موبایل">{b.customer_phone ? <span dir="ltr">{fa(b.customer_phone)}</span> : "ثبت نشده"}</Row>
            <Row label="از طریق">
              {sourceLabel(b.source)}
              {b.channel ? ` · ${CHANNEL_FA[b.channel] ?? "کانال دیگر"}` : ""}
            </Row>
            {b.note && <Row label="یادداشت">{b.note}</Row>}
            {b.conversation_id && (
              <Link href={`/panel/inbox/${b.conversation_id}`} className={buttonVariants({ variant: "outline", className: "mt-2 min-h-11 self-start" })}>
                <MessagesSquare className="size-4" strokeWidth={1.5} />
                دیدن گفت‌وگو
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">خدمت</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="خدمت">{b.service_title}</Row>
            <Row label="مدت">{durationLabel(b.duration_min)}</Row>
            <Row label="پرسنل یا اتاق">{resource?.title ?? "—"}</Row>
            <Row label="قیمت">{b.price !== null ? formatToman(b.price) : "اعلام نشده"}</Row>
            <p className="text-xs text-muted-foreground">نام، مدت و قیمت همان است که هنگام گرفتن نوبت ثبت شد.</p>
          </CardContent>
        </Card>

        {hasDeposit && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">بیعانه</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <Row label="مبلغ">{formatToman(b.deposit!)}</Row>
              <Row label="وضعیت">
                <PaymentStateBadge state={b.payment_state} />
              </Row>
              {b.payment_due_at && b.status === "pending_payment" && <Row label="مهلت واریز">{formatDateTime(b.payment_due_at)}</Row>}
              {b.payment_confirmed_at && <Row label="تأیید شد">{formatDateTime(b.payment_confirmed_at)}</Row>}
              {canPay ? (
                b.receipts.length === 0 ? (
                  <p className="text-muted-foreground">مشتری هنوز رسیدی نفرستاده است.</p>
                ) : (
                  b.receipts.map((r, i) => <ReceiptViewer key={r.media_id} bookingId={b.id} receipt={r} index={i} />)
                )
              ) : (
                <p className="text-muted-foreground">بررسی رسید با مالک یا نقش مالی فروشگاه است.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">رویدادها</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 text-sm">
              {b.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex flex-col gap-0.5 border-s-2 border-border ps-3">
                  <span className="font-medium">
                    {EVENT_FA[e.event] ?? "تغییر وضعیت"}
                    {e.to_status && e.to_status !== e.from_status && e.to_status !== "held" ? ` · ${statusMeta(e.to_status).label}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ACTOR_FA[e.actor_kind] ?? "سایر"} · {formatDateTime(e.at)}
                  </span>
                </li>
              ))}
            </ol>
            {b.cancel_reason && <p className="mt-3 text-sm">دلیل لغو: {b.cancel_reason}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end">{children}</span>
    </div>
  );
}
