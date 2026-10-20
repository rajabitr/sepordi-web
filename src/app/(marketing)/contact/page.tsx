import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock, Mail, Phone, Send } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { telegramHandle, type SupportSetting } from "@/components/marketing/plans-model";
import { CtaBand, LinkButton, PageHeader } from "@/components/marketing/section";
import { readSupport } from "@/components/marketing/settings.server";
import { pageMetadata } from "@/components/marketing/site";
import { en, fa } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  path: "/contact",
  title: "تماس با ما",
  description: "راه‌های ارتباط با پشتیبانی سپردی: تلفن، تلگرام و ایمیل، همراه با ساعت پاسخ‌گویی.",
});

const SOON = "به‌زودی اعلام میشه";

interface Channel {
  key: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  display: string;
  href?: string;
  ltr?: boolean;
}

function channels(s: SupportSetting): Channel[] {
  const phoneDigits = en(s.phone).replace(/[^\d+]/g, "");
  const tg = telegramHandle(s.telegram);
  return [
    { key: "phone", icon: Phone, label: "تلفن پشتیبانی", display: phoneDigits ? fa(s.phone) : SOON, href: phoneDigits ? `tel:${phoneDigits}` : undefined, ltr: !!phoneDigits },
    { key: "telegram", icon: Send, label: "تلگرام", display: tg ? `@${tg}` : SOON, href: tg ? `https://t.me/${tg}` : undefined, ltr: !!tg },
    { key: "email", icon: Mail, label: "ایمیل", display: s.email || SOON, href: s.email ? `mailto:${s.email}` : undefined, ltr: !!s.email },
    { key: "hours", icon: Clock, label: "ساعت پاسخ‌گویی", display: s.hours ? fa(s.hours) : SOON },
  ];
}

function ChannelGrid({ support }: { support: SupportSetting }) {
  const list = channels(support);
  const empty = !support.phone && !support.telegram && !support.email && !support.hours;
  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {list.map((c) => {
          const value = (
            <span dir={c.ltr ? "ltr" : undefined} className="block text-base font-semibold leading-7 tabular-nums">
              {c.display}
            </span>
          );
          return (
            <li key={c.key} className="flex min-h-28 items-start gap-4 rounded-2xl border border-border bg-card p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-ink">
                <c.icon strokeWidth={2} aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-6 text-muted-foreground">{c.label}</p>
                {c.href ? (
                  <a href={c.href} className="inline-flex min-h-11 items-center rounded-md text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...(c.key === "telegram" ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {value}
                  </a>
                ) : (
                  <span className="flex min-h-11 items-center text-muted-foreground">{value}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {empty && process.env.NODE_ENV !== "production" && (
        <p className="mt-4 rounded-xl border border-dashed border-warning px-4 py-3 text-sm leading-6 text-warning">
          راهنمای توسعه: تنظیم «support» در پنل مدیریت سپردی هنوز خالیه؛ بعد از پر شدن، همین‌جا نشون داده میشه.
        </p>
      )}
    </>
  );
}

async function LiveChannels() {
  return <ChannelGrid support={await readSupport()} />;
}

function ChannelsSkeleton() {
  return (
    <div role="status" aria-label="در حال آماده کردن راه‌های ارتباطی" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex min-h-28 items-start gap-4 rounded-2xl border border-border bg-card p-6">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ContactPage() {
  return (
    <>
      <PageHeader eyebrow="تماس با ما" title="سؤالی دارید؟ بپرسید" description="برای راه‌اندازی، تعرفه یا هر مشکلی که پیش اومده، از یکی از این راه‌ها با پشتیبانی سپردی در تماس باشید." />
      <div className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Suspense fallback={<ChannelsSkeleton />}>
            <LiveChannels />
          </Suspense>
          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <p className="text-sm leading-6 text-muted-foreground">شاید جوابتون همین حالا در سؤال‌های پرتکرار باشه.</p>
            <LinkButton href="/faq" variant="outline" size="md" arrow>سؤال‌های پرتکرار</LinkButton>
          </div>
        </div>
      </div>
      <CtaBand />
    </>
  );
}
