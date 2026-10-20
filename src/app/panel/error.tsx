"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PanelError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : undefined;
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-surface border border-border bg-card p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold leading-tight">این صفحه باز نشد</h1>
        <p className="text-muted-foreground">مشکلی پیش آمد. دوباره امتحان کنید؛ اگر تکرار شد، کد زیر را به پشتیبانی بدهید.</p>
        {digest && (
          <p className="text-sm text-muted-foreground">
            کد پیگیری: <span dir="ltr" className="font-mono">{digest}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={retry} className="h-11">
          <RefreshCw className="size-4" strokeWidth={2} />
          تلاش دوباره
        </Button>
        <Link href="/panel" className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
          بازگشت به داشبورد
        </Link>
      </div>
    </div>
  );
}
