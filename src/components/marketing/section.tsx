import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { GridBackground } from "@/components/backgrounds/grid";
import { cn } from "@/lib/utils";

export function Section({ id, className, children, labelledBy }: { id?: string; className?: string; children: React.ReactNode; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("px-4 py-16 sm:px-6 sm:py-24", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/** `inverse` is for sections on a `bg-primary` fill, where the violet ink and muted grey lose contrast. */
export function SectionHeading({ id, eyebrow, title, description, align = "center", inverse }: { id?: string; eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; align?: "center" | "start"; inverse?: boolean }) {
  return (
    <div className={cn("max-w-2xl", align === "center" ? "mx-auto text-center" : "text-start")}>
      {eyebrow && <p className={cn("text-sm font-semibold leading-6", inverse ? "opacity-85" : "text-brand-ink")}>{eyebrow}</p>}
      <h2 id={id} className="mt-2 text-balance text-3xl font-bold leading-tight">{title}</h2>
      {description && <p className={cn("mt-4 text-pretty text-base leading-7", inverse ? "opacity-85" : "text-muted-foreground")}>{description}</p>}
    </div>
  );
}

/** Header of an inner page: the page's single h1 over a faint grid. */
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="relative isolate overflow-hidden border-b border-border px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
      <GridBackground className="-z-10" />
      <div aria-hidden className="absolute inset-x-0 -top-24 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-brand/15 blur-3xl" />
      <div className="mx-auto max-w-3xl text-center">
        {eyebrow && <p className="text-sm font-semibold leading-6 text-brand-ink">{eyebrow}</p>}
        <h1 className="mt-3 text-balance text-3xl font-bold leading-tight sm:text-5xl">{title}</h1>
        {description && <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">{description}</p>}
        {children}
      </div>
    </header>
  );
}

type LinkVariant = "default" | "outline" | "ghost" | "brand" | "secondary";

/** A Next link dressed as a button; ≥44px tall at every size the site uses. */
export function LinkButton({ href, children, variant = "default", size = "lg", arrow, className }: { href: string; children: React.ReactNode; variant?: LinkVariant; size?: "md" | "lg"; arrow?: boolean; className?: string }) {
  return (
    <Link href={href} className={buttonVariants({ variant, size, className: cn("rounded-full", size === "md" && "h-11", className) })}>
      {children}
      {arrow && <ArrowLeft strokeWidth={2} />}
    </Link>
  );
}

/** Final call to action shared by every page. */
export function CtaBand({ title = "دستیار فروش‌تون را امروز روشن کنید", description = "ثبت‌نام رایگانه و برای شروع کارت بانکی لازم نیست. کانال را وصل کنید، محصولات را بیارید و ببینید چطور جواب میده." }: { title?: string; description?: string }) {
  return (
    <section aria-labelledby="cta-title" className="px-4 py-16 sm:px-6">
      <div className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
        <div aria-hidden className="absolute inset-x-0 -top-24 -z-10 mx-auto size-96 rounded-full bg-brand/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -start-16 -z-10 size-72 rounded-full bg-accent-rose/25 blur-3xl" />
        <h2 id="cta-title" className="text-balance text-3xl font-bold leading-tight">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 opacity-85">{description}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href="/register" variant="secondary" arrow>شروع رایگان</LinkButton>
          <LinkButton href="/guide" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">راهنمای راه‌اندازی</LinkButton>
        </div>
      </div>
    </section>
  );
}
