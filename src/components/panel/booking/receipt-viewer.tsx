"use client";

import * as React from "react";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";
import type { BookingReceipt } from "@/server/bizin/booking/types";

type View = { state: "loading" } | { state: "image"; url: string } | { state: "file"; url: string } | { state: "error"; message: string };

const FAILED: Record<number, string> = {
  401: "نشست شما تمام شده یا نقش شما اجازه‌ی دیدن رسید را ندارد.",
  403: "دیدن رسید بیعانه هنوز برای سپردی فعال نشده است.",
  404: "این رسید دیگر وجود ندارد.",
  503: "رسید الان در دسترس نیست. چند لحظه بعد دوباره امتحان کنید.",
};

/** A deposit receipt, fetched only when the seller opens it (one audited view at Bizin), dropped when closed. */
export function ReceiptViewer({ bookingId, receipt, index }: { bookingId: string; receipt: BookingReceipt; index: number }) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>({ state: "loading" });

  React.useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let live = true;
    fetch(`/panel/booking/receipts/${bookingId}/${receipt.media_id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(FAILED[res.status] ?? "رسید باز نشد. دوباره امتحان کنید.");
        const type = res.headers.get("content-type") ?? "";
        url = URL.createObjectURL(await res.blob());
        if (live) setView(type.startsWith("image/") ? { state: "image", url } : { state: "file", url });
      })
      .catch((e: unknown) => live && setView({ state: "error", message: e instanceof Error ? e.message : "رسید باز نشد." }));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, bookingId, receipt.media_id]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="font-medium">رسید {fa(index + 1)}</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(receipt.at)}
            {receipt.amount !== null ? ` · ${formatToman(receipt.amount)}` : ""}
            {receipt.reference ? ` · کد پیگیری ${fa(receipt.reference)}` : ""}
          </span>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setView({ state: "loading" });
            setOpen(true);
          }}
        >
          <Eye className="size-4" strokeWidth={1.5} />
          دیدن رسید
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title={`رسید بیعانه ${fa(index + 1)}`} side="start">
        <div className="flex flex-col gap-3">
          {view.state === "loading" && <Skeleton className="aspect-3/4 w-full rounded-xl" />}
          {view.state === "error" && <p className="text-sm text-destructive">{view.message}</p>}
          {view.state === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- an object URL of a private receipt, never optimised
            <img src={view.url} alt="تصویر رسید بیعانه" className="aspect-3/4 w-full rounded-xl border border-border object-contain" />
          )}
          {view.state === "file" && (
            <a href={view.url} download className="text-sm text-brand-ink underline">
              دریافت فایل رسید
            </a>
          )}
        </div>
      </Sheet>
    </>
  );
}
