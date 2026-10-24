import { Suspense } from "react";
import { Check, Minus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn, fa, faNumber } from "@/lib/utils";

import { PLACEHOLDER_PLANS, planPriceLabel, type PlanSetting } from "./plans-model";
import { LinkButton } from "./section";
import { readPlans } from "./settings.server";

function planLines(p: PlanSetting): string[] {
  const lines: string[] = [];
  if (p.code === "free") lines.push("اعتبار شروع برای امتحان دستیار");
  else lines.push("کل مبلغ به اعتبار هوش مصنوعی تبدیل میشه");
  if (p.replies_estimate > 0) lines.push(`حدود ${faNumber(p.replies_estimate)} پاسخ خودکار`);
  if (p.discount_percent > 0) lines.push(`${fa(p.discount_percent)}٪ تخفیف دائمی روی هر پاسخ`);
  lines.push("همه‌ی امکانات و همه‌ی کانال‌ها");
  return lines;
}

export function PlanCards({ plans }: { plans: PlanSetting[] | null }) {
  const list = plans ?? PLACEHOLDER_PLANS;
  return (
    <ul className="grid min-h-96 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {list.map((p) => {
        const price = planPriceLabel(p.price_toman);
        const soon = p.price_toman === null;
        return (
          <li
            key={p.code}
            className={cn(
              "relative flex flex-col rounded-2xl border p-6 shadow-surface",
              p.highlight ? "border-brand bg-surface-lavender text-surface-lavender-foreground ring-1 ring-brand" : "border-border bg-card",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold leading-tight">{p.name}</h3>
              {p.highlight && <span className="rounded-full bg-accent-rose px-3 text-xs font-semibold leading-6 text-accent-rose-foreground">پیشنهاد ما</span>}
            </div>
            <p className="mt-4 text-3xl font-bold leading-tight tabular-nums">
              {soon ? <span className="text-muted-foreground">{price}</span> : price}
            </p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{p.code === "free" ? "بعد از ثبت‌نام" : "یک‌بار، بدون اشتراک ماهانه"}</p>
            <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm leading-6">
              {planLines(p).map((l) => (
                <li key={l} className="flex items-start gap-2">
                  <Check strokeWidth={2} aria-hidden className="mt-1 size-4 shrink-0 text-brand-ink" />
                  {l}
                </li>
              ))}
            </ul>
            <LinkButton href="/register" variant={p.highlight ? "default" : "outline"} size="md" className="mt-6 w-full">
              {p.code === "free" ? "شروع رایگان" : `انتخاب ${p.name}`}
            </LinkButton>
          </li>
        );
      })}
    </ul>
  );
}

function PlanCardsSkeleton() {
  return (
    <div role="status" aria-label="در حال آماده کردن تعرفه‌ها" className="grid min-h-96 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-4 w-28" />
          <div className="mt-2 flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <Skeleton className="mt-auto h-11 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

async function LivePlanCards() {
  return <PlanCards plans={await readPlans()} />;
}

/** Plans from the admin's `plans` setting, streamed in after the static shell. */
export function Plans() {
  return (
    <Suspense fallback={<PlanCardsSkeleton />}>
      <LivePlanCards />
    </Suspense>
  );
}

function PlanComparison({ plans }: { plans: PlanSetting[] | null }) {
  const list = plans ?? PLACEHOLDER_PLANS;
  const rows: { feature: string; values: (string | boolean)[] }[] = [
    { feature: "حق ورود یک‌باره", values: list.map((p) => planPriceLabel(p.price_toman)) },
    { feature: "تبدیل کامل مبلغ به اعتبار", values: list.map((p) => p.code !== "free") },
    { feature: "پاسخ‌های خودکار (تخمینی)", values: list.map((p) => (p.replies_estimate > 0 ? `حدود ${faNumber(p.replies_estimate)}` : "به‌زودی")) },
    { feature: "تخفیف دائمی روی هر پاسخ", values: list.map((p) => (p.discount_percent > 0 ? `${fa(p.discount_percent)}٪` : false)) },
    { feature: "واتس‌اپ، اینستاگرام و تلگرام", values: list.map(() => true) },
    { feature: "ثبت سفارش، رسید و مرجوعی", values: list.map(() => true) },
    { feature: "شارژ دوباره هر وقت خواستید", values: list.map(() => true) },
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-160 text-sm leading-6">
        <caption className="sr-only">مقایسه‌ی پلن‌ها</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="p-4 text-start font-medium text-muted-foreground">امکانات</th>
            {list.map((p) => (
              <th key={p.code} scope="col" className={cn("p-4 text-center font-bold", p.highlight && "bg-surface-lavender")}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feature} className="border-b border-border last:border-0">
              <th scope="row" className="p-4 text-start font-normal">{r.feature}</th>
              {r.values.map((v, i) => (
                <td key={list[i].code} className={cn("p-4 text-center tabular-nums", list[i].highlight && "bg-surface-lavender/60")}>
                  {v === true ? (
                    <Check strokeWidth={2} aria-label="دارد" className="mx-auto size-4 text-success" />
                  ) : v === false ? (
                    <Minus strokeWidth={2} aria-label="ندارد" className="mx-auto size-4 text-muted-foreground" />
                  ) : (
                    v
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function LivePlanComparison() {
  return <PlanComparison plans={await readPlans()} />;
}

export function PlansComparison() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <LivePlanComparison />
    </Suspense>
  );
}

export const PRICING_TERMS = [
  "حق ورود یک‌باره‌ست و کاملش به اعتبار هوش مصنوعی تبدیل میشه.",
  "بعد از اون هر وقت لازم شد شارژ می‌کنید؛ اعتبار هیچ‌وقت منقضی نمیشه.",
  "اگه اعتبار تموم بشه فقط جواب‌های خودکار متوقف میشه؛ صندوق پیام، سفارش‌ها و پنل کار می‌کنن.",
  "همه‌ی مبلغ‌ها به تومانه و پرداخت از داخل پنل سپردی انجام میشه. تعداد پاسخ‌ها تخمینیه.",
];
