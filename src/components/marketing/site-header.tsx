"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { NAV_LINKS } from "./site";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Sticky top bar; below md the links move into a sheet that slides in from the start edge. */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <nav aria-label="اصلی" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="سپردی، صفحه‌ی اصلی" className="flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo height={28} priority />
          </Link>
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: "ghost", className: "hidden h-11 sm:inline-flex" })}>ورود</Link>
            <Link href="/register" className={buttonVariants({ className: "h-11 rounded-full" })}>شروع رایگان</Link>
            <button
              type="button"
              aria-label="باز کردن منو"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className={buttonVariants({ variant: "ghost", size: "icon", className: "size-11 lg:hidden" })}
            >
              <Menu strokeWidth={1.5} className="size-5" />
            </button>
          </div>
        </nav>
      </header>
      {/* Outside the header: its backdrop-blur would otherwise become the fixed sheet's containing block. */}
      <Sheet open={open} onOpenChange={setOpen} side="start" title={<Logo height={24} />}>
        <nav aria-label="منوی موبایل" className="flex flex-1 flex-col">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={close}
                  aria-current={isActive(pathname, l.href) ? "page" : undefined}
                  className="flex min-h-11 items-center rounded-md px-3 text-base hover:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-brand-ink"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            <Link href="/register" onClick={close} className={buttonVariants({ size: "lg", className: "rounded-full" })}>شروع رایگان</Link>
            <Link href="/login" onClick={close} className={buttonVariants({ variant: "outline", size: "lg", className: "rounded-full" })}>ورود</Link>
          </div>
        </nav>
      </Sheet>
    </>
  );
}
