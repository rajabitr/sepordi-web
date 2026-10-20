import type { Metadata } from "next";
import { Camera, CreditCard, Download, FileSpreadsheet, MessageCircle, Power, Send } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { CtaBand, PageHeader } from "@/components/marketing/section";
import { pageMetadata } from "@/components/marketing/site";
import { fa } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  path: "/guide",
  title: "راهنمای راه‌اندازی",
  description: "قدم‌به‌قدم: اتصال واتس‌اپ با کد QR، ساخت ربات تلگرام با BotFather، ورود محصولات با اکسل یا CSV و روشن کردن دستیار سپردی.",
});

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code dir="ltr" className="rounded-md bg-secondary px-2 font-mono text-sm text-secondary-foreground">
      {children}
    </code>
  );
}

interface GuideSection {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  intro: string;
  steps: React.ReactNode[];
  note?: string;
  extra?: React.ReactNode;
}

const SECTIONS: GuideSection[] = [
  {
    id: "whatsapp",
    icon: MessageCircle,
    title: "اتصال واتس‌اپ",
    intro: "شماره‌ی واتس‌اپ فروشگاه مثل واتس‌اپ وب به سپردی وصل میشه. گوشی را دم دست داشته باشید.",
    steps: [
      <>در پنل سپردی به بخش «کانال‌ها» برید و «اتصال واتس‌اپ» را بزنید تا کد QR نشون داده بشه.</>,
      <>روی گوشی، واتس‌اپ را باز کنید. در اندروید منوی سه‌نقطه و در آیفون «تنظیمات» را بزنید.</>,
      <>«دستگاه‌های متصل» (Linked devices) و بعد «اتصال دستگاه» (Link a device) را بزنید.</>,
      <>دوربین گوشی را روی کد QR پنل سپردی بگیرید. چند ثانیه بعد وضعیت کانال «وصل» میشه.</>,
    ],
    note: "کد QR بعد از مدت کوتاهی منقضی میشه. اگه وصل نشد، کد تازه بگیرید و دوباره اسکن کنید.",
  },
  {
    id: "telegram",
    icon: Send,
    title: "اتصال تلگرام",
    intro: "مشتری‌ها به ربات تلگرام فروشگاه‌تون پیام میدن و سپردی جواب میده. ساخت ربات دو دقیقه طول می‌کشه.",
    steps: [
      <>در تلگرام <Code>@BotFather</Code> را پیدا کنید و گفت‌وگو را شروع کنید.</>,
      <>دستور <Code>/newbot</Code> را بفرستید، یک اسم برای ربات بنویسید و بعد یک نام کاربری که با <Code>bot</Code> تموم بشه.</>,
      <>BotFather یک توکن می‌فرسته. اون را کپی کنید و به کسی نشون ندید.</>,
      <>در پنل سپردی، بخش «کانال‌ها»، «اتصال تلگرام» را بزنید و توکن را بچسبونید.</>,
    ],
  },
  {
    id: "instagram",
    icon: Camera,
    title: "اتصال اینستاگرام",
    intro: "اتصال اینستاگرام از راه ورود رسمی متا انجام میشه و رمز پیج‌تون را هیچ‌وقت نمی‌خوایم.",
    steps: [
      <>پیج‌تون باید حساب حرفه‌ای (بیزینس یا کریتور) باشه.</>,
      <>در پنل سپردی «اتصال اینستاگرام» را بزنید و با حساب متا وارد بشید.</>,
    ],
    note: "این اتصال تدریجی باز میشه چون هنوز در انتظار تأیید متاست. اگه برای حساب شما هنوز باز نشده، تا اون موقع با واتس‌اپ و تلگرام شروع کنید.",
  },
  {
    id: "products",
    icon: FileSpreadsheet,
    title: "ورود محصولات با اکسل یا CSV",
    intro: "دستیار فقط از روی کاتالوگ شما جواب میده، پس هر چی کامل‌تر باشه، جواب‌ها بهترن.",
    steps: [
      <>یکی از قالب‌های زیر را دانلود کنید.</>,
      <>برای هر محصول یک ردیف پر کنید: اسم، قیمت به تومان، موجودی و اگه داره سایز و رنگ.</>,
      <>در پنل سپردی بخش «محصولات»، فایل را بارگذاری کنید و نتیجه را ببینید. ردیف‌هایی که ایراد دارن جدا نشون داده میشن.</>,
    ],
    extra: (
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a href="/templates/products.xlsx" download className={buttonVariants({ variant: "outline", className: "h-11 rounded-full" })}>
          <Download strokeWidth={2} aria-hidden />
          قالب اکسل (xlsx)
        </a>
        <a href="/templates/products.csv" download className={buttonVariants({ variant: "outline", className: "h-11 rounded-full" })}>
          <Download strokeWidth={2} aria-hidden />
          قالب CSV
        </a>
      </div>
    ),
  },
  {
    id: "payment",
    icon: CreditCard,
    title: "کارت بانکی و هزینه‌ی ارسال",
    intro: "برای این‌که پیش‌فاکتور کامل باشه، این دو را یک بار تنظیم کنید.",
    steps: [
      <>شماره کارت و نام صاحب حساب را وارد کنید تا در پیش‌فاکتور برای کارت‌به‌کارت نشون داده بشه.</>,
      <>جدول ارسال را بچینید: هزینه‌ی پیش‌فرض، هزینه‌ی هر استان یا شهر، و اگه بخواید سقف ارسال رایگان.</>,
    ],
  },
  {
    id: "assistant",
    icon: Power,
    title: "روشن کردن دستیار",
    intro: "آخرین قدم. از این لحظه دستیار به پیام‌های تازه جواب میده.",
    steps: [
      <>در پنل سپردی بخش «دستیار هوشمند»، دستیار و جواب خودکار را روشن کنید.</>,
      <>یک پیام آزمایشی از یک شماره‌ی دیگه بفرستید و جواب را ببینید.</>,
      <>هر وقت خواستید، هر گفت‌وگویی را تحویل بگیرید و خودتون جواب بدید.</>,
    ],
  },
];

export default function GuidePage() {
  return (
    <>
      <PageHeader eyebrow="راهنما" title="راه‌اندازی سپردی، قدم‌به‌قدم" description="از وصل کردن کانال تا اولین جواب خودکار. هر بخش را جدا هم می‌تونید بخونید.">
        <nav aria-label="بخش‌های راهنما" className="mt-8 flex flex-wrap justify-center gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm transition-colors hover:bg-accent">
              {s.title}
            </a>
          ))}
        </nav>
      </PageHeader>

      <div className="px-4 py-16 sm:px-6">
        <ol className="mx-auto flex max-w-3xl flex-col gap-8">
          {SECTIONS.map((s, i) => (
            <li key={s.id} id={s.id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-ink">
                  <s.icon strokeWidth={2} aria-hidden className="size-6" />
                </span>
                <div>
                  <p className="text-xs leading-6 text-muted-foreground">قدم {fa(i + 1)}</p>
                  <h2 className="text-lg font-bold leading-tight">{s.title}</h2>
                </div>
              </div>
              <p className="mt-4 text-base leading-7 text-muted-foreground">{s.intro}</p>
              <ol className="mt-6 flex flex-col gap-4">
                {s.steps.map((step, j) => (
                  <li key={j} className="flex gap-4 text-base leading-7">
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold tabular-nums">
                      {fa(j + 1)}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {s.extra}
              {s.note && <p className="mt-6 rounded-xl bg-secondary px-4 py-3 text-sm leading-6 text-secondary-foreground">{s.note}</p>}
            </li>
          ))}
        </ol>
      </div>

      <CtaBand title="آماده‌اید شروع کنید؟" description="ثبت‌نام کنید و همین حالا اولین کانال را وصل کنید." />
    </>
  );
}
