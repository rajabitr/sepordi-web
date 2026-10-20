import { MessagesSquare, PackageCheck, ReceiptText } from "lucide-react";

import { Logo } from "@/components/brand/logo";

const POINTS = [
  { icon: MessagesSquare, title: "جواب فوری در دایرکت", text: "پیام مشتری‌ها در واتس‌اپ، اینستاگرام و تلگرام بی‌جواب نمی‌ماند." },
  { icon: PackageCheck, title: "فقط از کاتالوگ خودتان", text: "قیمت و موجودی را از محصولات ثبت‌شده‌ی شما می‌گوید، نه از حدس." },
  { icon: ReceiptText, title: "سفارش و رسید آماده‌ی تأیید", text: "سفارش را ثبت می‌کند و رسید کارت‌به‌کارت را برای بررسی شما کنار می‌گذارد." },
] as const;

/**
 * The inverse surface: navy in the light theme, pale violet in the dark one (`--primary` flips), so the wordmark
 * flips with it.
 */
export function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-linear-to-br from-primary from-40% to-brand-ink text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div>
        <Logo tone="light" height={36} className="sp-logo-on-light" />
        <Logo tone="default" height={36} className="sp-logo-on-dark" />
      </div>
      <div className="max-w-md">
        <h2 className="text-3xl leading-tight font-bold">فروش در دایرکت، بدون پیام جامانده</h2>
        <p className="mt-4 text-base leading-loose text-primary-foreground/80">
          سپردی دستیار هوشمند فروشگاه شماست؛ شبانه‌روز به مشتری‌ها جواب می‌دهد و کار را هر جا لازم بود به خودتان می‌سپارد.
        </p>
        <ul className="mt-10 flex flex-col gap-6">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-foreground/10">
                <Icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div>
                <p className="text-base leading-normal font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-primary-foreground/80">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-primary-foreground/70">پاسخ‌های دستیار به فارسی است.</p>
    </aside>
  );
}
