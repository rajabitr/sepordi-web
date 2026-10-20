"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ellipsis } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { isActive, PANEL_NAV, PANEL_NAV_ITEMS } from "./nav";

/** Desktop sidebar links. `pathname` null renders the static (no active item) state used as a Suspense fallback. */
export function PanelSidebarNav({ pathname }: { pathname?: string | null }) {
  return (
    <nav aria-label="منوی پنل" className="flex flex-col gap-6">
      {PANEL_NAV.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-sm text-muted-foreground">{group.title}</p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname ?? null, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-control px-3 text-base transition-colors duration-(--motion) ease-motion",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-secondary",
                )}
              >
                <Icon className={cn("size-5 shrink-0", active ? "text-brand-ink" : "text-muted-foreground")} strokeWidth={active ? 2 : 1.5} />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function PanelSidebarNavLive() {
  return <PanelSidebarNav pathname={usePathname()} />;
}

/** Mobile bottom bar: the primary sections plus «بیشتر», which opens the rest in a bottom sheet. */
export function PanelBottomNav({ pathname }: { pathname?: string | null }) {
  const [open, setOpen] = useState(false);
  const primary = PANEL_NAV_ITEMS.filter((i) => i.primary);
  const rest = PANEL_NAV_ITEMS.filter((i) => !i.primary);
  const moreActive = rest.some((i) => isActive(pathname ?? null, i.href));
  const item = "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-sm transition-colors duration-(--motion) ease-motion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <>
      <nav
        aria-label="منوی پنل"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname ?? null, href);
            return (
              <li key={href} className="flex flex-1">
                <Link href={href} aria-current={active ? "page" : undefined} className={cn(item, active ? "font-semibold text-brand-ink" : "text-muted-foreground")}>
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={cn(item, "cursor-pointer", moreActive ? "font-semibold text-brand-ink" : "text-muted-foreground")}>
              <Ellipsis className="size-5" strokeWidth={moreActive ? 2 : 1.5} />
              بیشتر
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={open} onOpenChange={setOpen} side="bottom" title="بخش‌های دیگر">
        <ul className="grid grid-cols-3 gap-2 pb-4">
          {rest.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname ?? null, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-24 flex-col items-center justify-center gap-2 rounded-surface border border-border p-3 text-center text-sm",
                    active ? "bg-accent font-semibold text-accent-foreground" : "bg-card text-foreground hover:bg-secondary",
                  )}
                >
                  <Icon className={cn("size-6", active ? "text-brand-ink" : "text-muted-foreground")} strokeWidth={1.5} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

export function PanelBottomNavLive() {
  return <PanelBottomNav pathname={usePathname()} />;
}
