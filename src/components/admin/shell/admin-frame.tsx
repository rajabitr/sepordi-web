import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastProvider } from "@/components/ui/toast";

import { AdminMobileNav, AdminSidebarNav, AdminSidebarNavLive } from "./admin-nav";
import { ADMIN_HOME_ICON as HomeIcon } from "./nav";
import { AdminGate, AdminTopbarSession } from "./session-parts";
import { AdminPageSkeleton } from "../page-parts";

/** sepordi's staff chrome: sidebar at the inline start from md up, a sheet below it. */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-1 bg-background">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-card md:flex">
          <div className="flex h-16 items-center px-6">
            <Link href="/admin" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="مدیریت سپردی، نمای کلی">
              <Logo height={28} priority />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <Suspense fallback={<AdminSidebarNav />}>
              <AdminSidebarNavLive />
            </Suspense>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
            <Suspense fallback={<div className="size-11 md:hidden" />}>
              <AdminMobileNav />
            </Suspense>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <HomeIcon className="size-5 shrink-0 text-brand-ink" strokeWidth={2} />
              <span className="truncate font-semibold">مدیریت سپردی</span>
            </div>
            <Suspense fallback={<Skeleton className="h-10 w-40 rounded-control" />}>
              <AdminTopbarSession />
            </Suspense>
          </header>

          <main id="admin-main" className="flex-1 px-4 pt-6 pb-10 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <Suspense fallback={<AdminPageSkeleton />}>
                <AdminGate>{children}</AdminGate>
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
