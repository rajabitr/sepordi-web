import type { Metadata } from "next";
import {
  BadgeCheck,
  Ban,
  Bot,
  Calculator,
  FileSpreadsheet,
  Hand,
  Inbox,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  Undo2,
} from "lucide-react";

import { GradientText } from "@/components/animations/gradient-text";
import { Reveal } from "@/components/animations/reveal";
import { SpotlightCard } from "@/components/animations/spotlight-card";
import { AuroraBackground } from "@/components/backgrounds/aurora";
import { DotsBackground } from "@/components/backgrounds/dots";
import { GirihBackground } from "@/components/backgrounds/girih";
import { StepsBlock } from "@/components/blocks/steps";
import { FaqBlock } from "@/components/blocks/faq";
import { ChannelsBeam } from "@/components/marketing/channels-beam";
import { ChatDemo } from "@/components/marketing/chat-demo";
import { FAQ, HOME_FAQ_IDS } from "@/components/marketing/faq-data";
import { Plans } from "@/components/marketing/plans";
import { CtaBand, LinkButton, Section, SectionHeading } from "@/components/marketing/section";
import { pageMetadata } from "@/components/marketing/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  path: "/",
  description:
    "سپردی به پیام مشتری‌های فروشگاه شما در واتس‌اپ، اینستاگرام و تلگرام از روی کاتالوگ خودتون جواب میده، پیش‌فاکتور می‌نویسه و رسید کارت‌به‌کارت را برای تأیید شما کنار می‌ذاره.",
});

const FEATURES: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: string; body: string; wide?: boolean }[] = [
  { icon: Bot, title: "جواب از روی کاتالوگ خودتون", body: "دستیار فقط از محصولات و توضیحاتی که خودتون وارد کردید جواب میده، با همون لحن مؤدب و فارسی روان.", wide: true },
  { icon: BadgeCheck, title: "قیمت و موجودی همیشه درست", body: "قیمت و موجودی را همون لحظه‌ی جواب از کاتالوگ می‌خونه؛ چیزی از حافظه نمیگه." },
  { icon: ShoppingBag, title: "ثبت سفارش در خود چت", body: "مشتری انتخاب می‌کنه، دستیار پیش‌فاکتور می‌نویسه و سفارش در پنل شما ثبت میشه." },
  { icon: ReceiptText, title: "بررسی رسید کارت‌به‌کارت با تأیید شما", body: "رسید را کنار سفارش می‌ذاره تا خودتون تأیید یا رد کنید. هیچ رسیدی خودکار تأیید نمیشه.", wide: true },
  { icon: Hand, title: "تحویل گفت‌وگو به شما با دلیل", body: "هر جا لازم باشه، گفت‌وگو را با دلیلش به شما می‌سپاره و کنار می‌کشه." },
  { icon: Inbox, title: "صندوق پیام مشترک همه‌ی کانال‌ها", body: "واتس‌اپ، اینستاگرام و تلگرام در یک صندوق؛ هر وقت خواستید خودتون جواب بدید." },
  { icon: Undo2, title: "مرجوعی و شکایت", body: "درخواست مرجوعی و شکایت با عکس و توضیح مشتری ثبت میشه و شما تصمیم می‌گیرید." },
  { icon: Calculator, title: "هزینه‌ی ارسال بر اساس استان و شهر", body: "جدول ارسال را خودتون می‌چینید و هزینه‌ی ارسال هر سفارش از روی استان و شهر مشتری حساب میشه.", wide: true },
  { icon: FileSpreadsheet, title: "ورود محصولات با اکسل", body: "صدها محصول را با یک فایل اکسل یا CSV وارد کنید؛ قالب آماده در راهنما هست." },
];

/** Bento tints rotate lavender, cream, peach; each tint pairs with the ink its icon chip reads in. */
const TINTS = [
  { card: "bg-surface-lavender text-surface-lavender-foreground", icon: "text-brand-ink" },
  { card: "bg-surface-cream text-surface-cream-foreground", icon: "text-accent-rose-ink" },
  { card: "bg-accent-peach-soft text-foreground", icon: "text-accent-peach-ink" },
];

const HONESTY = [
  { icon: Bot, title: "خودش را معرفی می‌کنه", body: "مشتری از همون اول می‌دونه داره با دستیار خودکار فروشگاه حرف می‌زنه و هر وقت بخواد، آدم جوابش را میده." },
  { icon: Ban, title: "«توقف» یعنی توقف", body: "مشتری با فرستادن «توقف» از گفت‌وگوی خودکار بیرون میاد و پیام‌هاش مستقیم به خود شما می‌رسه." },
  { icon: PackageCheck, title: "هیچ قیمتی از خودش نمی‌سازه", body: "اگه محصولی در کاتالوگ نباشه یا جوابی را ندونه، حدس نمی‌زنه؛ گفت‌وگو را به شما تحویل میده." },
];

export default function HomePage() {
  const faq = HOME_FAQ_IDS.map((id) => FAQ.find((f) => f.id === id)).filter((f) => f !== undefined);

  return (
    <>
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-linear-to-b from-surface-cream to-background px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        <AuroraBackground className="-z-10 opacity-60" />
        <div aria-hidden className="absolute -top-24 end-0 -z-10 size-96 rounded-full bg-accent-rose/20 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-start">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 text-sm font-medium leading-8 text-brand-ink backdrop-blur">
              <span aria-hidden className="size-2 rounded-full bg-accent-rose" />
              دستیار فروش برای واتس‌اپ، اینستاگرام و تلگرام
            </p>
            <h1 id="hero-title" className="mt-6 text-balance text-3xl font-bold leading-tight sm:text-5xl">
              دایرکت‌ها را <GradientText>بسپارید به سپردی</GradientText>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground lg:mx-0">
              سپردی از روی کاتالوگ خودتون به مشتری‌ها جواب میده، قیمت و موجودی را درست میگه، پیش‌فاکتور می‌نویسه و رسید
              کارت‌به‌کارت را برای تأیید شما کنار می‌ذاره. هر جا هم لازم باشه، گفت‌وگو را به خودتون می‌سپاره.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <LinkButton href="/register" arrow>شروع رایگان</LinkButton>
              <LinkButton href="/features" variant="outline" className="bg-card/70">ببینید چطور کار می‌کنه</LinkButton>
            </div>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">ثبت‌نام رایگانه و برای شروع کارت بانکی لازم نیست.</p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ChatDemo />
          </div>
        </div>
      </section>

      <Section labelledBy="channels-title" className="relative isolate overflow-hidden border-y border-border bg-surface-lavender text-surface-lavender-foreground">
        <DotsBackground className="-z-10" />
        <SectionHeading
          id="channels-title"
          eyebrow="کانال‌ها"
          title="مشتری‌ها هر جا پیام بدن، جوابشون آماده‌ست"
          description="شماره‌ی واتس‌اپ، پیج اینستاگرام و ربات تلگرام خودتون به سپردی وصل میشه و همه‌ی پیام‌ها در یک صندوق جمع میشه."
        />
        <div className="mt-12">
          <ChannelsBeam />
        </div>
      </Section>

      <StepsBlock
        eyebrow="راه‌اندازی"
        title="سه قدم تا اولین جواب خودکار"
        steps={[
          { title: "کانال را وصل کنید", description: "کد QR واتس‌اپ را اسکن کنید یا توکن ربات تلگرام را بچسبونید. چند دقیقه بیشتر طول نمی‌کشه." },
          { title: "محصولات را وارد کنید", description: "فایل اکسل محصولات را با قیمت به تومان و موجودی بارگذاری کنید یا تک‌تک اضافه کنید." },
          { title: "دستیار را روشن کنید", description: "از همین لحظه دستیار جواب میده و شما هر وقت خواستید وارد گفت‌وگو می‌شید." },
        ]}
      />

      <Section labelledBy="features-title">
        <SectionHeading
          id="features-title"
          eyebrow="امکانات"
          title="هر چیزی که یک فروشنده‌ی دایرکتی لازم داره"
          description="از جواب اولین سؤال قیمت تا ثبت سفارش، رسید و مرجوعی، همه در یک جا."
        />
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title} className={cn(f.wide && "lg:col-span-2", i === 0 && "sm:col-span-2")}>
              <Reveal delay={Math.min(i, 4) * 60} className="h-full">
                <SpotlightCard className="grid h-full">
                  <div className={cn("flex h-full flex-col rounded-lg p-6", TINTS[i % TINTS.length].card)}>
                    <span className={cn("flex size-10 items-center justify-center rounded-xl bg-card", TINTS[i % TINTS.length].icon)}>
                      <f.icon strokeWidth={2} className="size-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold leading-tight">{f.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.body}</p>
                  </div>
                </SpotlightCard>
              </Reveal>
            </li>
          ))}
        </ul>
        <div className="mt-8 text-center">
          <LinkButton href="/features" variant="outline" size="md" arrow>همه‌ی امکانات و محدودیت‌ها</LinkButton>
        </div>
      </Section>

      <Section labelledBy="honesty-title" className="relative isolate overflow-hidden bg-primary text-primary-foreground">
        <GirihBackground className="-z-10 opacity-20" />
        <SectionHeading inverse id="honesty-title" eyebrow="صادقانه" title="دستیاری که با مشتری‌هاتون روراسته" />
        <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {HONESTY.map((h) => (
            <li key={h.title} className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/5 p-6">
              <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-accent-rose text-accent-rose-foreground">
                <h.icon strokeWidth={2} className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold leading-tight">{h.title}</h3>
              <p className="mt-2 text-sm leading-6 opacity-85">{h.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="pricing-title">
        <SectionHeading
          id="pricing-title"
          eyebrow="تعرفه"
          title="یک‌بار بپردازید، همه‌اش اعتبار میشه"
          description="اشتراک ماهانه نداریم. حق ورود کاملش به اعتبار هوش مصنوعی تبدیل میشه و بعد هر وقت لازم شد شارژ می‌کنید."
        />
        <div className="mt-12">
          <Plans />
        </div>
        <div className="mt-8 text-center">
          <LinkButton href="/pricing" variant="outline" size="md" arrow>جزئیات تعرفه</LinkButton>
        </div>
      </Section>

      <div className="border-t border-border">
        <FaqBlock
          title="سؤال‌های پرتکرار"
          description="جواب کوتاه و صادقانه به چیزهایی که فروشنده‌ها اول از همه می‌پرسن."
          items={faq.map((f) => ({ id: f.id, title: f.question, content: f.answer }))}
        />
        <div className="-mt-8 pb-8 text-center">
          <LinkButton href="/faq" variant="ghost" size="md" arrow>همه‌ی سؤال‌ها</LinkButton>
        </div>
      </div>

      <CtaBand />
    </>
  );
}
