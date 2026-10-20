import type { Metadata } from "next";
import { Coins, Infinity as InfinityIcon, PauseCircle, Wallet } from "lucide-react";

import { FaqBlock } from "@/components/blocks/faq";
import { FAQ } from "@/components/marketing/faq-data";
import { Plans, PlansComparison, PRICING_TERMS } from "@/components/marketing/plans";
import { CtaBand, PageHeader, Section, SectionHeading } from "@/components/marketing/section";
import { pageMetadata } from "@/components/marketing/site";

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "تعرفه",
  description:
    "اشتراک ماهانه نداریم: یک حق ورود یک‌باره که کاملش اعتبار هوش مصنوعی میشه، بعد شارژ به اندازه‌ی مصرف. اعتبار منقضی نمیشه و پرداخت به تومانه.",
});

const MODEL = [
  { icon: Wallet, title: "حق ورود یک‌باره", body: "یک پلن انتخاب می‌کنید و یک بار پرداخت می‌کنید. کل مبلغ به اعتبار هوش مصنوعی تبدیل میشه." },
  { icon: Coins, title: "شارژ به اندازه‌ی مصرف", body: "هر جواب خودکار کمی از اعتبار کم می‌کنه. هر وقت لازم شد، شارژ می‌کنید." },
  { icon: InfinityIcon, title: "اعتبار منقضی نمیشه", body: "اعتبارتون تاریخ انقضا نداره؛ ماه بعد یا سال بعد هم سر جاشه." },
  { icon: PauseCircle, title: "در صفر فقط جواب خودکار می‌ایسته", body: "صندوق پیام، سفارش‌ها و پنل کار می‌کنن و خودتون می‌تونید جواب بدید تا دوباره شارژ کنید." },
];

const PRICING_FAQ_IDS = ["subscription", "zero-credit", "pay-sepordi", "receipts"];

export default function PricingPage() {
  const faq = PRICING_FAQ_IDS.map((id) => FAQ.find((f) => f.id === id)).filter((f) => f !== undefined);
  return (
    <>
      <PageHeader
        eyebrow="تعرفه"
        title="یک‌بار بپردازید، همه‌اش اعتبار میشه"
        description="بدون اشتراک ماهانه و بدون هزینه‌ی پنهان. همه‌ی مبلغ‌ها به تومانه."
      />

      <Section labelledBy="plans-title">
        <h2 id="plans-title" className="sr-only">پلن‌ها</h2>
        <Plans />
        <ul className="mx-auto mt-8 flex max-w-3xl flex-col gap-2 text-sm leading-6 text-muted-foreground">
          {PRICING_TERMS.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="model-title" className="border-y border-border bg-card">
        <SectionHeading id="model-title" eyebrow="مدل پرداخت" title="هزینه را چطور حساب می‌کنیم؟" />
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODEL.map((m) => (
            <li key={m.title} className="rounded-2xl border border-border bg-background p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-brand-ink">
                <m.icon strokeWidth={2} aria-hidden className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold leading-tight">{m.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{m.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="compare-title">
        <SectionHeading id="compare-title" eyebrow="مقایسه" title="پلن‌ها کنار هم" description="فرق پلن‌ها فقط در مقدار اعتبار و تخفیفه؛ امکانات برای همه یکیه." />
        <div className="mx-auto mt-12 max-w-5xl">
          <PlansComparison />
        </div>
      </Section>

      <div className="border-t border-border">
        <FaqBlock
          title="سؤال‌های تعرفه"
          description="اگه جوابتون این‌جا نیست، از صفحه‌ی تماس با ما بپرسید."
          items={faq.map((f) => ({ id: f.id, title: f.question, content: f.answer }))}
        />
      </div>

      <CtaBand />
    </>
  );
}
