import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { BrandPanel } from "@/components/auth/brand-panel";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col px-4 py-4 sm:px-8 sm:py-6">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="-ms-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
            صفحه‌ی اصلی
          </Link>
          <Link href="/" aria-label="سپردی" className="inline-flex min-h-11 items-center lg:hidden">
            <Logo height={28} />
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center py-8 sm:items-center">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
      <BrandPanel />
    </div>
  );
}
