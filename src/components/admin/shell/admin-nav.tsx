"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { ADMIN_NAV, isAdminActive } from "./nav";

/** `pathname` null renders the static (no active item) state used as a Suspense fallback. */
export function AdminSidebarNav({ pathname, onNavigate }: { pathname?: string | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="منوی مدیریت" className="flex flex-col gap-6">
      {ADMIN_NAV.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-sm text-muted-foreground">{group.title}</p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isAdminActive(pathname ?? null, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
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

export function AdminSidebarNavLive() {
  return <AdminSidebarNav pathname={usePathname()} />;
}

/** Below md the sidebar lives in a sheet opened from the topbar. */
export function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="باز کردن منو"
        className="flex size-11 cursor-pointer items-center justify-center rounded-control hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Menu className="size-5" strokeWidth={1.5} />
      </button>
      <Sheet open={open} onOpenChange={setOpen} side="start" title="مدیریت سپردی">
        <AdminSidebarNav pathname={pathname} onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
