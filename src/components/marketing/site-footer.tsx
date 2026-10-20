import Link from "next/link";

import { Logo } from "@/components/brand/logo";

import { FOOTER_COLUMNS } from "./site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card px-4 pb-8 pt-16 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <Link href="/" aria-label="سپردی، صفحه‌ی اصلی" className="inline-flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo height={28} />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
            دستیار هوشمندی که از روی کاتالوگ خودتون به پیام مشتری‌ها در واتس‌اپ، اینستاگرام و تلگرام جواب میده و سفارش ثبت می‌کنه.
          </p>
        </div>
        {FOOTER_COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold leading-6">{c.title}</h2>
            <ul className="mt-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-border pt-6 text-xs leading-6 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© ۱۴۰۵ سپردی</p>
        <p>ساخته‌شده برای فروشنده‌های ایرانی</p>
      </div>
    </footer>
  );
}
