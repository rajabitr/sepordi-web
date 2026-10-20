"use client";

import * as React from "react";
import { AlertCircle, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";

import { EvidenceStatusBadge } from "./badges";
import type { Evidence } from "./model";

type View =
  | { state: "loading" }
  | { state: "image"; url: string }
  | { state: "text"; text: string }
  | { state: "error"; message: string };

const FAILED: Record<number, string> = {
  401: "نشست شما تمام شده است. دوباره وارد شوید.",
  403: "دیدن رسید برای فروشگاه شما فعال نیست. با پشتیبانی تماس بگیرید.",
  404: "این رسید دیگر وجود ندارد.",
  503: "رسید الان در دسترس نیست. چند لحظه بعد دوباره امتحان کنید.",
};

/**
 * The receipt itself, fetched only once the seller asks to see it: each fetch is one audited view at Bizin, and the
 * bytes live in an object URL that is dropped when the sheet closes.
 */
export function ReceiptSheet({
  orderId,
  orderCode,
  evidence,
  onClose,
  decide,
  onApprove,
  onReject,
}: {
  orderId: string;
  orderCode: string;
  evidence: Evidence | null;
  onClose: () => void;
  /** The order waits for payment and this receipt for a decision. */
  decide: boolean;
  onApprove: (e: Evidence) => void;
  onReject: (e: Evidence) => void;
}) {
  return (
    <Sheet
      open={evidence !== null}
      onOpenChange={(o) => !o && onClose()}
      side="start"
      title={`رسید پرداخت سفارش ${fa(orderCode)}`}
      className="w-full sm:max-w-lg"
    >
      {evidence && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">مبلغ مورد انتظار</dt>
              <dd className="font-semibold tabular-nums">{formatToman(evidence.expected_amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">وضعیت</dt>
              <dd>
                <EvidenceStatusBadge status={evidence.status} />
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">زمان ارسال رسید</dt>
              <dd className="tabular-nums">{formatDateTime(evidence.created_at)}</dd>
            </div>
          </dl>

          <ReceiptContent key={evidence.id} orderId={orderId} orderCode={orderCode} evidenceId={evidence.id} />

          <p className="text-xs leading-6 text-muted-foreground">
            سپردی مبلغ را از روی رسید نمی‌خواند. پیش از تأیید، واریز {formatToman(evidence.expected_amount)} را در حساب خودتان ببینید.
          </p>

          {decide && (
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11 flex-1" onClick={() => onApprove(evidence)}>
                <Check className="size-4" strokeWidth={2} />
                تأیید پرداخت
              </Button>
              <Button variant="outline" className="min-h-11 flex-1 text-destructive hover:text-destructive" onClick={() => onReject(evidence)}>
                <X className="size-4" strokeWidth={2} />
                رد رسید
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ReceiptContent({ orderId, orderCode, evidenceId }: { orderId: string; orderCode: string; evidenceId: string }) {
  const [view, setView] = React.useState<View>({ state: "loading" });

  React.useEffect(() => {
    const ctrl = new AbortController();
    let url: string | null = null;
    (async () => {
      try {
        const res = await fetch(`/panel/evidence/${encodeURIComponent(orderId)}/${encodeURIComponent(evidenceId)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setView({ state: "error", message: FAILED[res.status] ?? "رسید باز نشد. دوباره امتحان کنید." });
          return;
        }
        const type = res.headers.get("content-type") ?? "";
        if (type.startsWith("application/json")) {
          const body = (await res.json()) as { text?: string };
          setView({ state: "text", text: body.text ?? "" });
        } else if (type.startsWith("image/")) {
          const blob = await res.blob();
          if (ctrl.signal.aborted) return;
          url = URL.createObjectURL(blob);
          setView({ state: "image", url });
        } else {
          setView({ state: "error", message: "این رسید عکس قابل نمایش نیست." });
        }
      } catch {
        if (!ctrl.signal.aborted) setView({ state: "error", message: "اتصال برقرار نشد. دوباره امتحان کنید." });
      }
    })();
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [orderId, evidenceId]);

  return (
    <div className="min-h-80" aria-busy={view.state === "loading"}>
      {view.state === "loading" && <Skeleton className="aspect-3/4 w-full rounded-xl" />}
      {view.state === "image" && (
        <div className="flex aspect-3/4 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
          {/* The receipt is a blob URL of a no-store response; next/image has nothing to optimise here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.url} alt={`تصویر رسید پرداخت سفارش ${fa(orderCode)}`} className="size-full object-contain" />
        </div>
      )}
      {view.state === "text" && (
        <div className="rounded-xl border border-border bg-muted p-4">
          <p className="mb-2 text-xs text-muted-foreground">متنی که مشتری به‌عنوان رسید فرستاده است</p>
          <p dir="auto" className="whitespace-pre-wrap break-words leading-8 tabular-nums">
            {view.text || "متن رسید خالی است."}
          </p>
        </div>
      )}
      {view.state === "error" && (
        <div role="alert" className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input p-6 text-center">
          <AlertCircle className="size-6 text-destructive" strokeWidth={1.5} />
          <p className="text-sm">{view.message}</p>
        </div>
      )}
    </div>
  );
}
