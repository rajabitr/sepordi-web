import "server-only";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, CircleAlert, MessagesSquare, PartyPopper, Receipt, Wallet } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, fa } from "@/lib/utils";
import { requireSeller } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";
import { can } from "@/server/team/roles";

import { LoadError } from "./parts";
import { setupSteps } from "./setup-steps";
import { settle } from "./settle";
import { StatsView } from "./stats-view";

export async function Welcome({ searchParams }: { searchParams: Promise<{ welcome?: string | string[] }> }) {
  const [{ user, shop }, sp] = await Promise.all([requireSeller(), searchParams]);
  const first = sp.welcome === "1";
  const name = user.display_name.trim() || "فروشنده";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight">سلام {name}، خوش آمدید</h1>
        <p className="text-muted-foreground">خلاصه‌ی کار دستیار فروشگاه «{shop.name}»</p>
      </div>
      {first && (
        <Alert variant="success" icon={PartyPopper} title="حساب شما ساخته شد">
          چند قدم کوتاه مانده تا دستیار به مشتری‌هایتان جواب بدهد: یک کانال وصل کنید، محصولاتتان را وارد کنید، کارت بانکی را ثبت کنید و
          دستیار را روشن کنید. فهرست زیر قدم‌به‌قدم همراهتان است.
        </Alert>
      )}
    </div>
  );
}

export function WelcomeSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-48" />
    </div>
  );
}

const OWNER_SETS_IT = "این بخش را مالک فروشگاه تنظیم می‌کند.";

// ---- credit banner ----------------------------------------------------------------------------------------

export async function CreditBanner() {
  const { shop, role } = await requireSeller();
  const tenant = await settle(bizin.getTenant(shop.external_business_id));
  if (!tenant.ok || tenant.data.credit.state !== "exhausted") return null;
  return (
    <Alert variant="warning" icon={Wallet} title="اعتبار دستیار تمام شده است">
      <p>تا اعتبار را شارژ نکنید، دستیار به پیام مشتری‌ها جواب نمی‌دهد و گفت‌وگوها منتظر شما می‌مانند.</p>
      {role === "owner" ? (
        <Link href="/panel/credit" className={cn(buttonVariants({ variant: "default", size: "md" }), "mt-3 h-11")}>
          خرید اعتبار
          <ArrowLeft className="size-4" strokeWidth={2} />
        </Link>
      ) : (
        <p className="mt-3">اعتبار را مالک فروشگاه شارژ می‌کند.</p>
      )}
    </Alert>
  );
}

// ---- setup checklist --------------------------------------------------------------------------------------

export async function SetupChecklist() {
  const { shop, role } = await requireSeller();
  const ext = shop.external_business_id;
  const [channels, products, payment, assistant] = await Promise.all([
    settle(bizin.getTenantChannels(ext)),
    settle(bizin.listProducts(ext, { limit: 1 })),
    settle(bizin.getPaymentDetails(ext)),
    settle(bizin.getAssistant(ext)),
  ]);

  const steps = setupSteps({ channels, products, payment, assistant }, role);
  const done = steps.filter((s) => s.state === "done").length;

  if (done === steps.length) {
    return (
      <Alert variant="success" icon={CheckCircle2} title="راه‌اندازی کامل است">
        کانال وصل است، محصول دارید، کارت ثبت شده، دستیار روشن است و معرفی کسب‌وکار را نوشته‌اید.
      </Alert>
    );
  }

  return (
    <section className="rounded-surface border border-border bg-card p-4 sm:p-6" aria-labelledby="setup-title">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="setup-title" className="text-lg font-semibold leading-tight">
            راه‌اندازی فروشگاه
          </h2>
          <span className="text-sm text-muted-foreground">
            {fa(done)} از {fa(steps.length)} قدم انجام شده
          </span>
        </div>
        <div role="progressbar" aria-label="پیشرفت راه‌اندازی" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} className="h-2 w-full overflow-hidden rounded-full bg-surface-lavender">
          <div className="h-full rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-4 flex flex-col divide-y divide-border">
        {steps.map((s) => (
          <li key={s.key} className="flex flex-col gap-3 py-4 first:pt-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              {s.state === "done" ? (
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-success" strokeWidth={2} aria-hidden />
              ) : s.state === "unknown" ? (
                <CircleAlert className="mt-1 size-5 shrink-0 text-warning" strokeWidth={2} aria-hidden />
              ) : (
                <Circle className="mt-1 size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              )}
              <div className="min-w-0">
                <p className={cn("font-medium", s.state === "done" && "text-muted-foreground")}>
                  {s.title}
                  <span className="sr-only">{s.state === "done" ? "، انجام شده" : s.state === "unknown" ? "، بررسی نشد" : "، انجام نشده"}</span>
                </p>
                <p className="text-sm text-muted-foreground">{s.state === "unknown" ? s.error : s.hint}</p>
              </div>
            </div>
            {s.state !== "done" &&
              (s.href ? (
                <Link href={s.href} className={cn(buttonVariants({ variant: "outline" }), "h-11 shrink-0 self-start sm:self-auto")}>
                  {s.action}
                  <ArrowLeft className="size-4" strokeWidth={2} />
                </Link>
              ) : (
                <p className="shrink-0 text-sm text-muted-foreground">{OWNER_SETS_IT}</p>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SetupChecklistSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-surface border border-border bg-card p-4 sm:p-6" aria-busy="true">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-2 w-full" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="size-5 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-11 w-32 sm:block" />
        </div>
      ))}
    </div>
  );
}

// ---- needs you --------------------------------------------------------------------------------------------

const PEEK = 20;

/** Each card links to a page; a role that cannot open the page does not get the card, nor its Bizin read. */
export async function NeedsYou() {
  const { shop, role } = await requireSeller();
  const ext = shop.external_business_id;
  const inbox = can(role, "inbox.view");
  const orders = can(role, "orders.view");
  if (!inbox && !orders) return null;
  const [handoffs, receipts] = await Promise.all([
    inbox ? settle(bizin.listConversations(ext, { state: ["handoff"], limit: PEEK })) : null,
    orders ? settle(bizin.listOrders(ext, { payment_status: "pending_verification", limit: PEEK })) : null,
  ]);
  const count = (n: number, more: boolean) => (more ? `${fa(n)}+` : fa(n));

  const cards = [
    handoffs && {
      key: "handoff",
      icon: MessagesSquare,
      tint: { card: "border-accent-rose bg-accent-rose-soft hover:bg-accent-rose-soft/60", chip: "bg-card text-accent-rose-ink" },
      label: "نیازمند شما",
      hint: "گفت‌وگوهایی که منتظر شما هستند؛ تا آن‌ها را به دستیار برنگردانید، دستیار جوابی نمی‌دهد",
      href: "/panel/inbox?state=handoff",
      value: handoffs.ok ? count(handoffs.data.conversations.length, Boolean(handoffs.data.next_cursor)) : null,
      zero: handoffs.ok && handoffs.data.conversations.length === 0,
      error: handoffs.ok ? undefined : handoffs,
    },
    receipts && {
      key: "receipts",
      icon: Receipt,
      tint: { card: "border-accent-peach bg-accent-peach-soft hover:bg-accent-peach-soft/60", chip: "bg-card text-accent-peach-ink" },
      label: "رسید در انتظار",
      hint: "رسیدهای کارت‌به‌کارت که باید تأیید یا رد کنید",
      href: "/panel/orders?payment=pending_verification",
      value: receipts.ok ? count(receipts.data.orders.length, Boolean(receipts.data.next_cursor)) : null,
      zero: receipts.ok && receipts.data.orders.length === 0,
      error: receipts.ok ? undefined : receipts,
    },
  ].filter((c) => c !== null);

  return (
    <div className={cn("grid gap-3", cards.length > 1 && "sm:grid-cols-2")}>
      {cards.map((c) =>
        c.error ? (
          <LoadError key={c.key} title={`«${c.label}» بارگذاری نشد`} message={c.error.message} requestId={c.error.requestId} />
        ) : (
          <Link
            key={c.key}
            href={c.href}
            className={cn(
              "group flex min-h-20 items-center gap-4 rounded-surface border p-4 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              c.zero ? "border-border bg-card hover:bg-secondary" : c.tint.card,
            )}
          >
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", c.zero ? "bg-surface-lavender text-muted-foreground" : c.tint.chip)}>
              <c.icon className="size-5" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{c.label}</span>
              <span className="block text-sm text-muted-foreground">{c.hint}</span>
            </span>
            <span className="text-2xl font-bold tabular-nums">{c.value}</span>
            <ArrowLeft className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          </Link>
        ),
      )}
    </div>
  );
}

export function NeedsYouSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
      <Skeleton className="h-20 rounded-surface" />
      <Skeleton className="h-20 rounded-surface" />
    </div>
  );
}

// ---- stats ------------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The last 60 UTC days ending today: the 30-day view and the 30 days before it. */
function last60Days(): { from: string; to: string } {
  const today = Date.now();
  return { from: isoDay(today - 59 * DAY_MS), to: isoDay(today) };
}

export async function StatsSection() {
  const { shop } = await requireSeller();
  const stats = await settle(bizin.getTenantStats(shop.external_business_id, last60Days()));
  if (!stats.ok) return <LoadError title="آمار بارگذاری نشد" message={stats.message} requestId={stats.requestId} />;
  return <StatsView days={stats.data.days} />;
}

export function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-surface lg:col-span-3" />
        <Skeleton className="h-72 rounded-surface lg:col-span-2" />
      </div>
    </div>
  );
}
