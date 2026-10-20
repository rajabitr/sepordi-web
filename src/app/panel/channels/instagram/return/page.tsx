import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";

import { SuccessCheck } from "@/components/animations/success-check";
import { instagramReasonFa } from "@/components/panel/channels/channel-meta";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "نتیجه‌ی اتصال اینستاگرام" };

type SearchParams = Promise<{ status?: string | string[]; reason?: string | string[] }>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/*
 * Only what the query string says, never trusted beyond the message: a hand-made `?status=connected` shows a
 * success line but changes nothing. The channels page reads the real state from Bizin.
 */
async function Result({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const connected = one(sp.status) === "connected";
  const reason = one(sp.reason);
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        {connected ? (
          <>
            <SuccessCheck size={72} label="اینستاگرام وصل شد" />
            <p className="text-sm leading-7 text-muted-foreground">از این لحظه دستیار به پیام‌های دایرکت این حساب جواب می‌دهد.</p>
          </>
        ) : (
          <>
            <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <CircleAlert className="size-8" strokeWidth={1.5} aria-hidden />
            </span>
            <p className="text-lg font-semibold">اینستاگرام وصل نشد</p>
            <p className="text-sm leading-7 text-muted-foreground">{instagramReasonFa(reason)}</p>
            <p className="text-xs leading-6 text-muted-foreground">
              اینستاگرام به‌تدریج باز می‌شود: تا وقتی متا برنامه را بررسی می‌کند، فقط حساب‌های آزمایشی وصل می‌شوند.
            </p>
          </>
        )}
        <Link href="/panel/channels" className={buttonVariants({ variant: connected ? "brand" : "outline", size: "lg" })}>
          بازگشت به کانال‌ها
        </Link>
      </CardContent>
    </Card>
  );
}

export default function InstagramReturnPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-80 w-full max-w-lg rounded-surface" />}>
      <Result searchParams={searchParams} />
    </Suspense>
  );
}
