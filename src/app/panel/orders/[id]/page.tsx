import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, MessagesSquare, PackageX } from "lucide-react";

import { OrderStatusBadge, PaymentStatusBadge } from "@/components/panel/orders/badges";
import { isNotEntitled } from "@/components/panel/orders/entitlement";
import { LoadError } from "@/components/panel/orders/load-error";
import {
  SOURCE_LABEL,
  UUID_RE,
  awaitsPayment,
  channelLabel,
  orderTimeline,
  shippingBasisLabel,
  type Order,
} from "@/components/panel/orders/model";
import { NotEntitled } from "@/components/panel/orders/not-entitled";
import { OrderMoves } from "@/components/panel/orders/order-moves";
import { PaymentPanel } from "@/components/panel/orders/payment-panel";
import { OrderDetailSkeleton } from "@/components/panel/orders/skeletons";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Timeline } from "@/components/ui/timeline";
import { formatDateTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";
import { requireCapability } from "@/server/auth/session";
import { can } from "@/server/team/roles";
import { getOrder, listPaymentEvidence } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";

export const metadata: Metadata = { title: "جزئیات سفارش" };

type Params = Promise<{ id: string }>;

export default function OrderPage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/orders" className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" strokeWidth={1.5} />
        همه‌ی سفارش‌ها
      </Link>
      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderSection params={params} />
      </Suspense>
    </div>
  );
}

function OrderMissing() {
  return (
    <EmptyState
      icon={PackageX}
      className="min-h-80 justify-center"
      title="این سفارش پیدا نشد"
      description="شاید نشانی را اشتباه باز کرده‌اید یا سفارش مال فروشگاه دیگری است."
      action={
        <Link href="/panel/orders" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
          بازگشت به سفارش‌ها
        </Link>
      }
    />
  );
}

async function OrderSection({ params }: { params: Params }) {
  const { id } = await params;
  const { shop, role } = await requireCapability("orders.view");
  if (!UUID_RE.test(id)) return <OrderMissing />;
  const ext = shop.external_business_id;

  const [orderResult, evidenceResult] = await Promise.allSettled([getOrder(ext, id), listPaymentEvidence(ext, id)]);
  if (orderResult.status === "rejected") {
    if (isBizinError(orderResult.reason) && orderResult.reason.status === 404) return <OrderMissing />;
    const f = toFarsiError(orderResult.reason);
    return <LoadError title="سفارش بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref={`/panel/orders/${id}`} />;
  }
  const order = orderResult.value;
  const timeline = orderTimeline(order);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 className="text-2xl font-bold leading-tight tabular-nums">سفارش {fa(order.code)}</h1>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment.status} />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            ثبت در {formatDateTime(order.created_at)}، {SOURCE_LABEL[order.source] ?? "سپردی"}
          </p>
        </div>
        {can(role, "orders.status") && (
          <OrderMoves
            orderId={order.id}
            code={order.code}
            status={order.status}
            total={order.totals.total}
            paymentStatus={order.payment.status}
            pendingEvidence={order.payment.pending_evidence}
          />
        )}
      </header>

      {order.status === "confirmed" && (
        <Alert variant="info" title="منتظر پرداخت مشتری">
          این سفارش فقط با تأیید رسید یا ثبت پرداخت دستی پرداخت‌شده می‌شود؛ بعد از آن می‌توانید آماده‌سازی و ارسال را ثبت کنید.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <ItemsCard order={order} />
          <Card>
            <CardHeader>
              <CardTitle>پرداخت کارت‌به‌کارت</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">روش پرداخت</dt>
                  <dd>کارت‌به‌کارت</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">وضعیت پرداخت</dt>
                  <dd>
                    <PaymentStatusBadge status={order.payment.status} />
                  </dd>
                </div>
                {order.payment.paid_at && (
                  <div>
                    <dt className="text-xs text-muted-foreground">زمان تأیید پرداخت</dt>
                    <dd className="tabular-nums">{formatDateTime(order.payment.paid_at)}</dd>
                  </div>
                )}
              </dl>
              {evidenceResult.status === "fulfilled" ? (
                <PaymentPanel
                  orderId={order.id}
                  code={order.code}
                  total={order.totals.total}
                  awaitingPayment={awaitsPayment(order)}
                  evidence={evidenceResult.value.data}
                  canDecide={can(role, "orders.payment")}
                />
              ) : (
                <EvidenceError error={evidenceResult.reason} orderId={order.id} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <CustomerCard order={order} />
          <Card>
            <CardHeader>
              <CardTitle>مراحل سفارش</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                activeIndex={timeline.length - 1}
                items={timeline.map((t) => ({ title: t.title, date: formatDateTime(t.at) }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EvidenceError({ error, orderId }: { error: unknown; orderId: string }) {
  if (isNotEntitled(error)) {
    return (
      <NotEntitled
        className="justify-center"
        description="وقتی فعال شود، رسیدهای کارت‌به‌کارت این سفارش و ثبت پرداخت دستی همین‌جا می‌آیند."
      />
    );
  }
  const f = toFarsiError(error);
  return <LoadError title="رسیدهای این سفارش بارگذاری نشد" message={f.message} requestId={f.requestId} retryHref={`/panel/orders/${orderId}`} />;
}

function ItemsCard({ order }: { order: Order }) {
  const t = order.totals;
  const basis = shippingBasisLabel(t.shipping_basis, t.shipping_zone);
  return (
    <Card>
      <CardHeader>
        <CardTitle>اقلام سفارش</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>کالا</TableHead>
                <TableHead className="text-end">تعداد</TableHead>
                <TableHead className="text-end">قیمت واحد</TableHead>
                <TableHead className="text-end">جمع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <span className="font-medium">{it.title}</span>
                    {it.variant_name && <span className="block text-xs text-muted-foreground">{it.variant_name}</span>}
                  </TableCell>
                  <TableCell numeric className="text-end">{fa(it.quantity)}</TableCell>
                  <TableCell numeric className="text-end whitespace-nowrap">{formatToman(it.unit_price)}</TableCell>
                  <TableCell numeric className="text-end whitespace-nowrap font-medium">{formatToman(it.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="flex flex-col divide-y divide-border sm:hidden">
          {order.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{it.title}</p>
                {it.variant_name && <p className="text-xs text-muted-foreground">{it.variant_name}</p>}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {fa(it.quantity)} × {formatToman(it.unit_price)}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">{formatToman(it.line_total)}</span>
            </li>
          ))}
        </ul>
        {order.items.length === 0 && <p className="text-sm text-muted-foreground">این سفارش هنوز کالایی ندارد.</p>}

        <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
          <Row label="جمع اقلام" value={formatToman(t.subtotal)} />
          {t.discount ? <Row label="تخفیف" value={formatToman(t.discount)} tone="success" /> : null}
          {t.shipping || basis ? (
            <Row
              label={basis ? `هزینه‌ی ارسال (${basis})` : "هزینه‌ی ارسال"}
              value={t.shipping ? formatToman(t.shipping) : t.shipping_basis === "unresolved" ? "—" : "رایگان"}
            />
          ) : null}
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
            <dt className="font-semibold">مبلغ کل</dt>
            <dd className="text-lg font-bold tabular-nums">{formatToman(t.total)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={tone === "success" ? "tabular-nums text-success" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

function CustomerCard({ order }: { order: Order }) {
  const c = order.customer;
  return (
    <Card>
      <CardHeader>
        <CardTitle>مشتری</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">نام</dt>
            <dd className="truncate font-medium">{c.name?.trim() || "ثبت نشده"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">موبایل</dt>
            <dd>{c.phone ? <span dir="ltr" className="tabular-nums">{fa(c.phone)}</span> : "ثبت نشده"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">کانال</dt>
            <dd>{channelLabel(c.channel)}</dd>
          </div>
        </dl>
        {c.conversation_id && (
          <Link
            href={`/panel/inbox/${encodeURIComponent(c.conversation_id)}`}
            className={buttonVariants({ variant: "outline", className: "min-h-11 w-full" })}
          >
            <MessagesSquare className="size-4" strokeWidth={1.5} />
            مشاهده‌ی گفت‌وگو
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
