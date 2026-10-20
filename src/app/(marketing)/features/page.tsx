import type { Metadata } from "next";
import { Bot, FileSpreadsheet, Hand, Info, ReceiptText, ShoppingBag, Undo2 } from "lucide-react";

import { FeatureSplit } from "@/components/blocks/feature-split";
import { MockCard } from "@/components/marketing/mock-card";
import { CtaBand, PageHeader, Section, SectionHeading } from "@/components/marketing/section";
import { pageMetadata } from "@/components/marketing/site";
import { formatTomanValue } from "@/lib/money";

export const metadata: Metadata = pageMetadata({
  path: "/features",
  title: "امکانات",
  description:
    "جواب از روی کاتالوگ، ثبت سفارش در چت، بررسی رسید کارت‌به‌کارت با تأیید شما، تحویل گفت‌وگو با دلیل، مرجوعی و هزینه‌ی ارسال بر اساس استان و شهر؛ همراه با محدودیت‌های واقعی سپردی.",
});

const LIMITS = [
  { title: "کامنت‌های اینستاگرام را جواب نمیده", body: "سپردی فقط پیام‌های دایرکت را جواب میده. کامنت‌ها دست‌نخورده می‌مونن." },
  { title: "پیام صوتی را نمی‌فهمه", body: "پیام صوتی و ویدیو را دستیار نمی‌فهمه؛ اون گفت‌وگو را به شما تحویل میده تا خودتون جواب بدید." },
  { title: "واتس‌اپ از راه API رسمی وصل نمیشه", body: "شماره‌تون مثل واتس‌اپ وب به‌عنوان «دستگاه متصل» وصل میشه. گوشی‌تون باید گاهی به اینترنت وصل باشه تا اتصال برقرار بمونه." },
  { title: "اینستاگرام هنوز برای همه باز نیست", body: "اتصال اینستاگرام از راه ورود رسمی متا و تدریجی باز میشه، چون هنوز در انتظار تأیید متاست." },
  { title: "پرداخت آنلاین مشتری نداریم", body: "مشتری کارت‌به‌کارت می‌کنه و رسید می‌فرسته؛ پول مستقیم به حساب خودتون می‌ره و تأیید با شماست." },
  { title: "بعضی امکانات در «پنل پیشرفته» هست", body: "کارهایی مثل مدیریت تیم و تنظیمات پیشرفته‌ی دستیار از «پنل پیشرفته» در دسترسه که لینک فعال‌سازیش را از داخل پنل سپردی می‌گیرید." },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="امکانات"
        title="هر کاری که در دایرکت تکرار می‌کنید، سپردی برعهده می‌گیره"
        description="این‌جا دقیق نوشتیم سپردی چه کارهایی می‌کنه و کجاها کار را به خودتون می‌سپاره."
      />

      <FeatureSplit
        items={[
          {
            eyebrow: "جواب از روی کاتالوگ",
            title: "قیمت و موجودی را از کاتالوگ خودتون میگه، نه از حدس",
            description:
              "هر بار که مشتری چیزی می‌پرسه، دستیار همون لحظه ردیف محصول را از کاتالوگ می‌خونه. قیمت را عوض کنید یا موجودی تموم بشه، جواب بعدی همون را میگه.",
            bullets: [
              "سؤال‌های غلط‌املایی و محاوره‌ای را می‌فهمه، مثل «اینو مشکی داری؟»",
              "سایز، رنگ و مدل‌های مختلف یک محصول را جدا می‌شناسه",
              "اگه محصولی در کاتالوگ نباشه، قیمتی نمی‌سازه و گفت‌وگو را به شما می‌سپاره",
            ],
            media: (
              <MockCard
                icon={Bot}
                title="از کاتالوگ"
                rows={[
                  { label: "مانتو کتان ترمه، ۳۸، مشکی", value: formatTomanValue(1_280_000) },
                  { label: "موجودی", value: "۳ عدد", tone: "success" },
                  { label: "سایز ۴۰، مشکی", value: "ناموجود", tone: "warning" },
                ]}
                footer="جواب دستیار همین اعداد را میگه، نه عدد دیگه‌ای."
              />
            ),
          },
          {
            eyebrow: "سفارش در خود چت",
            title: "مشتری انتخاب می‌کنه، پیش‌فاکتورش همون‌جا آماده‌ست",
            description:
              "وقتی مشتری آماده‌ی خرید باشه، دستیار سفارش را با محصول، تعداد و هزینه‌ی ارسال می‌نویسه و پیش‌فاکتور را در چت می‌فرسته. سفارش هم در پنل شما ثبت میشه.",
            bullets: [
              "هزینه‌ی ارسال از جدولی که برای هر استان و شهر چیدید حساب میشه",
              "می‌تونید سقف ارسال رایگان بذارید",
              "وضعیت سفارش را از پنل جلو می‌برید: تأیید، بسته‌بندی، ارسال، تحویل",
            ],
            media: (
              <MockCard
                icon={ShoppingBag}
                title="پیش‌فاکتور"
                rows={[
                  { label: "مانتو کتان ترمه × ۱", value: formatTomanValue(1_280_000) },
                  { label: "ارسال به تهران", value: formatTomanValue(90_000) },
                  { label: "جمع کل", value: formatTomanValue(1_370_000), tone: "brand" },
                ]}
              />
            ),
          },
          {
            eyebrow: "رسید کارت‌به‌کارت",
            title: "رسید با شماست؛ هیچ‌وقت خودکار تأیید نمیشه",
            description:
              "شماره کارت شما در پیش‌فاکتور میاد. مشتری که عکس رسید را فرستاد، رسید کنار سفارش برای بررسی به شما فرستاده میشه. تا خودتون تأیید نکنید، سفارش پرداخت‌شده حساب نمیشه.",
            bullets: ["تأیید یا رد رسید با یک دکمه", "رسیدهای منتظر بررسی جدا دیده میشه", "عکس رسیدها فقط بعد از ورود به پنل دیده میشه"],
            media: (
              <MockCard
                icon={ReceiptText}
                title="رسید در انتظار بررسی"
                rows={[
                  { label: "سفارش ۱۰۴۲", value: formatTomanValue(1_370_000) },
                  { label: "وضعیت", value: "در انتظار تأیید شما", tone: "warning" },
                ]}
                footer="تأیید یا رد، فقط با شما."
              />
            ),
          },
          {
            eyebrow: "تحویل گفت‌وگو",
            title: "هر جا لازم باشه، گفت‌وگو را با دلیلش به شما می‌سپاره",
            description:
              "مشتری عصبانیه، سؤالش در کاتالوگ نیست یا پیام صوتی فرستاده؟ دستیار کنار می‌کشه و دلیلش را برای شما می‌نویسه. همه‌ی گفت‌وگوهای واتس‌اپ، اینستاگرام و تلگرام هم در یک صندوق پیام مشترک جمع میشه.",
            bullets: ["هر وقت خواستید گفت‌وگو را تحویل بگیرید و خودتون بنویسید", "بعد از جواب شما، می‌تونید دوباره به دستیار برش گردونید", "صف گفت‌وگوهایی که منتظر شما هستن جدا دیده میشه"],
            media: (
              <MockCard
                icon={Hand}
                title="منتظر شما"
                rows={[
                  { label: "سارا، واتس‌اپ", value: "پیام صوتی", tone: "warning" },
                  { label: "علی، تلگرام", value: "محصول در کاتالوگ نیست", tone: "warning" },
                  { label: "نگار، اینستاگرام", value: "درخواست صحبت با فروشنده", tone: "warning" },
                ]}
              />
            ),
          },
          {
            eyebrow: "مرجوعی و شکایت",
            title: "درخواست مرجوعی ثبت میشه، تصمیمش با شماست",
            description:
              "شرایط مرجوعی‌تون را یک بار می‌نویسید؛ دستیار بر اساس همون جواب میده و درخواست مرجوعی یا شکایت را با عکس و توضیح مشتری برای شما ثبت می‌کنه.",
            bullets: ["مهلت و شرایط مرجوعی را خودتون تعیین می‌کنید", "عکس‌هایی که مشتری فرستاده کنار درخواست هست"],
            media: (
              <MockCard
                icon={Undo2}
                title="درخواست مرجوعی"
                rows={[
                  { label: "دلیل", value: "سایز کوچک بود" },
                  { label: "مهلت مرجوعی", value: "۷ روز" },
                  { label: "وضعیت", value: "منتظر تصمیم شما", tone: "warning" },
                ]}
              />
            ),
          },
          {
            eyebrow: "کاتالوگ و اکسل",
            title: "صدها محصول را با یک فایل اکسل وارد کنید",
            description:
              "قالب اکسل یا CSV را بگیرید، اسم محصول، قیمت به تومان و موجودی را پر کنید و بارگذاری کنید. بعد از اون هم می‌تونید محصولات را تک‌تک ویرایش کنید.",
            bullets: ["قیمت‌ها را به تومان وارد می‌کنید", "موجودی هر سایز و رنگ جدا"],
            media: (
              <MockCard
                icon={FileSpreadsheet}
                title="products.xlsx"
                rows={[
                  { label: "ردیف‌های خوانده‌شده", value: "۲۴۸" },
                  { label: "ثبت‌شده", value: "۲۴۶", tone: "success" },
                  { label: "نیاز به اصلاح", value: "۲", tone: "warning" },
                ]}
              />
            ),
          },
        ]}
      />

      <Section labelledBy="limits-title" className="border-t border-border bg-card">
        <SectionHeading
          id="limits-title"
          eyebrow="محدودیت‌ها"
          title="چیزهایی که سپردی (هنوز) نمی‌کنه"
          description="ترجیح می‌دیم قبل از ثبت‌نام بدونید، نه بعدش."
        />
        <ul className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
          {LIMITS.map((l) => (
            <li key={l.title} className="flex gap-4 rounded-2xl border border-border bg-background p-6">
              <Info strokeWidth={2} aria-hidden className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="text-base font-bold leading-6">{l.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{l.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand />
    </>
  );
}
