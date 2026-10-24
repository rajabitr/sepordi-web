"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const DESK = [{ href: "/panel/booking", label: "نوبت‌ها" }];
const SETUP = [
  { href: "/panel/booking/services", label: "خدمات" },
  { href: "/panel/booking/resources", label: "پرسنل و اتاق‌ها" },
  { href: "/panel/booking/hours", label: "ساعات کاری" },
  { href: "/panel/booking/exceptions", label: "تعطیلات و استثناها" },
  { href: "/panel/booking/settings", label: "تنظیمات" },
];

/** The booking section's own tabs; setup pages are the owner's. */
export function BookingNav({ isOwner }: { isOwner: boolean }) {
  const path = usePathname();
  const items = isOwner ? [...DESK, ...SETUP] : DESK;
  const active = (href: string) => (href === "/panel/booking" ? path === href || /^\/panel\/booking\/[0-9a-f-]{36}$/i.test(path) : path.startsWith(href));
  return (
    <nav aria-label="بخش‌های نوبت‌دهی" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-2 border-b border-border">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={active(it.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center border-b-2 px-3 text-sm font-medium leading-normal transition-colors duration-150",
                active(it.href) ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
