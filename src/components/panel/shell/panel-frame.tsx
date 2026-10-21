import Link from "next/link";
import { Suspense } from "react";
import { LifeBuoy } from "lucide-react";

import { Logo } from "@/components/brand/logo";

import { NotificationBellSlot } from "./notification-bell-slot";
import { PanelBottomNav, PanelSidebarNav } from "./panel-nav";
import { PanelPageSkeleton, TopbarSessionSkeleton } from "./skeletons";
import { RoleBottomNav, RoleSidebarNav, SellerGate, TopbarSession } from "./session-parts";

/**
 * The seller panel chrome: sidebar at the inline start (right) from lg up, sticky topbar, bottom bar on phones.
 * Only the session-dependent parts stream in; the frame itself is part of the static shell.
 */
export function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-card lg:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/panel" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="سپردی، داشبورد">
            <Logo height={28} priority />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <Suspense fallback={<PanelSidebarNav />}>
            <RoleSidebarNav />
          </Suspense>
        </div>
        <div className="border-t border-border p-3">
          <Link href="/guide" className="flex h-11 items-center gap-3 rounded-control px-3 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <LifeBuoy className="size-5" strokeWidth={1.5} />
            راهنما و پشتیبانی
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
          <Link href="/panel" className="lg:hidden" aria-label="سپردی، داشبورد">
            <Logo variant="mark" height={28} priority />
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <Suspense fallback={<TopbarSessionSkeleton />}>
              <TopbarSession />
            </Suspense>
          </div>
          <NotificationBellSlot />
        </header>

        <main id="panel-main" className="flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-7xl">
            <Suspense fallback={<PanelPageSkeleton />}>
              <SellerGate>{children}</SellerGate>
            </Suspense>
          </div>
        </main>
      </div>

      <Suspense fallback={<PanelBottomNav />}>
        <RoleBottomNav />
      </Suspense>
    </div>
  );
}
