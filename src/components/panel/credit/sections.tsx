import "server-only";

import { CircleCheck, CircleX, Clock, Headset, Mail, Phone, Send, Wallet } from "lucide-react";

import { LoadError } from "@/components/panel/overview/parts";
import { settle } from "@/components/panel/overview/settle";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/date";
import { formatTomanValue } from "@/lib/money";
import { fa } from "@/lib/utils";
import { requireShopOwner } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";
import { creditOrdersForShop, type CreditOrderState } from "@/server/credit/orders";
import { payableToman, readCardToCard, readPlans, readSupport } from "@/server/credit/plans";
import { zarinpalConfig } from "@/server/credit/zarinpal";

import { Plans } from "./plans";

export async function CreditStateCard() {
  const { shop } = await requireShopOwner();
  const tenant = await settle(bizin.getTenant(shop.external_business_id));
  if (!tenant.ok) return <LoadError title="وضعیت اعتبار بارگذاری نشد" message={tenant.message} requestId={tenant.requestId} />;
  const exhausted = tenant.data.credit.state === "exhausted";
  return (
    <Alert
      variant={exhausted ? "warning" : "success"}
      icon={Wallet}
      title={exhausted ? "اعتبار دستیار تمام شده است" : "اعتبار دستیار فعال است"}
    >
      <p>
        {exhausted
          ? "دستیار تا شارژ بعدی به پیام مشتری‌ها جواب نمی‌دهد و گفت‌وگوها منتظر شما می‌مانند. یکی از بسته‌های زیر را بخرید."
          : "دستیار به پیام‌ها جواب می‌دهد."}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        سپردی فقط می‌داند اعتبار تمام شده یا نه؛ مانده‌ی دقیق اعتبار را نمی‌بینیم. وقتی تمام شود، همین‌جا و در اعلان‌ها خبر می‌دهیم.
      </p>
    </Alert>
  );
}

export function CreditStateSkeleton() {
  return <Skeleton className="h-28 rounded-overlay" />;
}

export async function PlansSection() {
  await requireShopOwner();
  const plans = readPlans();
  const card = readCardToCard();
  if (plans.length === 0) {
    return <EmptyState icon={Wallet} title="بسته‌ای برای خرید تعریف نشده است" description="برای شارژ اعتبار با پشتیبانی تماس بگیرید." />;
  }
  return (
    <Plans
      plans={plans.map((p) => ({ ...p, payable_toman: payableToman(p) }))}
      gateway={zarinpalConfig() !== null}
      card={card}
    />
  );
}

export function PlansSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-64 rounded-surface" />
      ))}
    </div>
  );
}

const STATE: Record<CreditOrderState, { label: string; variant: "success" | "warning" | "destructive" | "secondary"; icon: typeof Clock }> = {
  awaiting_payment: { label: "در انتظار پرداخت", variant: "secondary", icon: Clock },
  abandoned: { label: "پرداخت نشد", variant: "secondary", icon: CircleX },
  awaiting_review: { label: "در انتظار تأیید پرداخت", variant: "warning", icon: Clock },
  awaiting_grant: { label: "در انتظار شارژ", variant: "warning", icon: Clock },
  granted: { label: "شارژ شد", variant: "success", icon: CircleCheck },
  rejected: { label: "رد شد", variant: "destructive", icon: CircleX },
  failed: { label: "ناموفق", variant: "destructive", icon: CircleX },
  cancelled: { label: "لغو شد", variant: "secondary", icon: CircleX },
};

export async function MyCreditOrders() {
  const { shop } = await requireShopOwner();
  const orders = creditOrdersForShop(shop.id);
  return (
    <Card>
      <CardHeader>
        <CardTitle>خریدهای من</CardTitle>
        <CardDescription>«در انتظار تأیید پرداخت» یعنی پشتیبانی واریز کارت‌به‌کارت را بررسی می‌کند؛ «در انتظار شارژ» یعنی پرداخت رسیده و اعتبار به‌زودی شارژ می‌شود.</CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">هنوز خریدی نکرده‌اید.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {orders.map((o) => {
              const s = STATE[o.state];
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">
                      بسته‌ی {o.plan_name} · {formatTomanValue(o.amount_toman)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(o.created_at)} · {o.method === "zarinpal" ? "پرداخت آنلاین" : "کارت‌به‌کارت"}
                      {o.ref && (
                        <>
                          {" "}
                          · پیگیری <span dir="ltr">{fa(o.ref)}</span>
                        </>
                      )}
                    </p>
                    {o.rejection_note && <p className="text-sm">دلیل: {o.rejection_note}</p>}
                  </div>
                  <Badge variant={s.variant}>
                    <s.icon className="size-3.5" strokeWidth={2} />
                    {s.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MyCreditOrdersSkeleton() {
  return <Skeleton className="h-48 rounded-surface" />;
}

export async function SupportCard() {
  await requireShopOwner();
  const s = readSupport();
  if (!s) return null;
  const tg = s.telegram.replace(/^@/, "");
  const row = "flex min-h-11 items-center gap-3 rounded-control px-2 transition-colors hover:bg-secondary";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Headset className="size-5" strokeWidth={2} />
          پشتیبانی شارژ
        </CardTitle>
        {s.hours && <CardDescription>{fa(s.hours)}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {s.phone && (
          <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className={row}>
            <Phone className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <span dir="ltr">{fa(s.phone)}</span>
          </a>
        )}
        {tg && (
          <a href={`https://t.me/${encodeURIComponent(tg)}`} target="_blank" rel="noopener noreferrer" className={row}>
            <Send className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <span dir="ltr">@{tg}</span>
          </a>
        )}
        {s.email && (
          <a href={`mailto:${s.email}`} className={row}>
            <Mail className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <span dir="ltr">{s.email}</span>
          </a>
        )}
      </CardContent>
    </Card>
  );
}
