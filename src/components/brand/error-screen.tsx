"use client";

import Link from "next/link";
import { Home, LifeBuoy, RefreshCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

import { Logo } from "./logo";

const COPY = {
  "404": {
    code: "۴۰۴",
    title: "این صفحه وجود ندارد",
    body: "شاید لینک قدیمی باشد یا آدرس اشتباه تایپ شده. از صفحه‌ی اصلی ادامه دهید.",
  },
  "500": {
    code: "۵۰۰",
    title: "این صفحه باز نشد",
    body: "مشکلی سمت ما پیش آمد. چند لحظه بعد دوباره امتحان کنید؛ اگر تکرار شد، با پشتیبانی تماس بگیرید.",
  },
} as const;

/** Full-page 404 / 500 in the sepordi brand (adapted from the VibeFarsi error-pages template). */
export function ErrorScreen({ kind, onRetry, reference }: { kind: "404" | "500"; onRetry?: () => void; reference?: string }) {
  const c = COPY[kind];
  return (
    <main className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden bg-background px-6 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-32 mx-auto size-96 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative w-full max-w-md text-center">
        <Link href="/" className="mx-auto inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo height={32} priority />
        </Link>
        <p className="mt-10 text-7xl font-extrabold tabular-nums text-foreground/15">{c.code}</p>
        <h1 className="mt-4 text-2xl font-bold">{c.title}</h1>
        <p className="mt-3 text-muted-foreground">{c.body}</p>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          {kind === "500" && onRetry ? (
            <Button size="lg" onClick={onRetry}>
              <RefreshCw strokeWidth={2} />
              تلاش دوباره
            </Button>
          ) : null}
          <Link href="/" className={buttonVariants({ size: "lg", variant: kind === "404" ? "default" : "outline" })}>
            <Home strokeWidth={2} />
            صفحه‌ی اصلی
          </Link>
          {kind === "500" ? (
            <Link href="/contact" className={buttonVariants({ size: "lg", variant: "ghost" })}>
              <LifeBuoy strokeWidth={2} />
              پشتیبانی
            </Link>
          ) : null}
        </div>
        {reference ? (
          <p className="mt-6 text-sm text-muted-foreground">
            کد پیگیری: <bdi dir="ltr" className="font-mono">{reference}</bdi>
          </p>
        ) : null}
      </div>
    </main>
  );
}
