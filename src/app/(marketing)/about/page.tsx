import type { Metadata } from "next";
import { HeartHandshake, Scale, ShieldCheck } from "lucide-react";

import { CtaBand, PageHeader, Section, SectionHeading } from "@/components/marketing/section";
import { pageMetadata } from "@/components/marketing/site";

export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "درباره ما",
  description: "سپردی برای فروشنده‌هایی ساخته شده که فروش‌شون در دایرکت واتس‌اپ، اینستاگرام و تلگرام می‌گذره و وقت جواب دادن به همه‌ی پیام‌ها را ندارن.",
});

const VALUES = [
  { icon: ShieldCheck, title: "عدد واقعی، نه حدس", body: "دستیار قیمت و موجودی را فقط از کاتالوگ خود فروشنده میگه. جایی که نمی‌دونه، نمی‌سازه و کار را به آدم می‌سپاره." },
  { icon: HeartHandshake, title: "تصمیم با فروشنده", body: "تأیید رسید، مرجوعی و هر چیزی که پای پول وسطه، دست خود فروشنده می‌مونه." },
  { icon: Scale, title: "روراست با مشتری", body: "دستیار خودش را معرفی می‌کنه و مشتری هر وقت بخواد با «توقف» از گفت‌وگوی خودکار بیرون میاد." },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="درباره ما"
        title="سپردی را ساختیم تا دایرکت‌ها همه‌ی وقت‌تون را نگیرن"
        description="فروش خیلی از کسب‌وکارهای ایرانی در دایرکت می‌گذره: سؤال قیمت، موجودی، هزینه‌ی ارسال، عکس رسید. سپردی این کارهای تکراری را برعهده می‌گیره تا وقت شما برای کارهای مهم‌تر بمونه."
      />

      <Section labelledBy="story-title">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 text-base leading-7">
          <h2 id="story-title" className="text-3xl font-bold leading-tight">چرا سپردی؟</h2>
          <p>
            اسمش از «سپردن» میاد. می‌خوایم بتونید جواب دادن به پیام‌های تکراری را با خیال راحت بسپارید، بدون این‌که نگران باشید دستیار قیمت
            اشتباه بگه یا قولی بده که شما ندادید.
          </p>
          <p>
            برای همین سپردی را طوری ساختیم که فقط از روی کاتالوگ خودتون جواب بده، سفارش را در همون چت بنویسه و هر جا پای تصمیم وسطه، مثل تأیید
            رسید کارت‌به‌کارت، کار را به خودتون برگردونه.
          </p>
          <p>
            پردازش هوشمند پیام‌ها با همکاری یک شریک فنی انجام میشه و سپردی تجربه‌ی کار، پنل فارسی، پرداخت به تومان و پشتیبانی را برای
            فروشنده‌های ایرانی فراهم می‌کنه.
          </p>
        </div>
      </Section>

      <Section labelledBy="values-title" className="border-t border-border bg-card">
        <SectionHeading id="values-title" eyebrow="اصول ما" title="سه اصلی که سرش کوتاه نمیایم" />
        <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {VALUES.map((v) => (
            <li key={v.title} className="rounded-2xl border border-border bg-background p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-brand-ink">
                <v.icon strokeWidth={2} aria-hidden className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold leading-tight">{v.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{v.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand />
    </>
  );
}
