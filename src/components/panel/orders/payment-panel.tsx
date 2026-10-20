"use client";

import * as React from "react";
import { Check, Eye, FileText, Image as ImageIcon, ReceiptText, X } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";

import { approveEvidenceAction, markPaidAction, rejectEvidenceAction } from "@/app/panel/orders/actions";

import { EvidenceStatusBadge } from "./badges";
import { REJECT_REASONS, rejectReasonLabel, type Evidence, type RejectReason } from "./model";
import { ReceiptSheet } from "./receipt-sheet";
import { useIntent } from "./use-intent";

const DECIDER: Record<string, string> = { user: "از پنل پیشرفته", partner_key: "از پنل سپردی", system: "خودکار" };
const CLOSED: Record<string, string> = {
  order_paid: "سفارش پرداخت‌شده ثبت شد؛ دیگر نیازی به بررسی نیست.",
  order_cancelled: "سفارش لغو شد؛ دیگر نیازی به بررسی نیست.",
};

export interface PaymentPanelProps {
  orderId: string;
  code: string;
  /** Rial. */
  total: number;
  /** The order is `confirmed`: approve, reject and mark-paid are open. */
  awaitingPayment: boolean;
  evidence: Evidence[];
}

/** Receipts of one order and the seller's three payment decisions. Nothing here decides on its own. */
export function PaymentPanel({ orderId, code, total, awaitingPayment, evidence }: PaymentPanelProps) {
  const [viewing, setViewing] = React.useState<Evidence | null>(null);
  const [approving, setApproving] = React.useState<Evidence | null>(null);
  const [rejecting, setRejecting] = React.useState<Evidence | null>(null);
  const [markingPaid, setMarkingPaid] = React.useState(false);
  const name = `سفارش ${fa(code)}`;
  const amount = formatToman(total);
  const approve = useIntent();

  const decidable = (e: Evidence) => awaitingPayment && e.status === "pending_verification";

  return (
    <div className="flex flex-col gap-4">
      {evidence.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input p-6 text-center">
          <ReceiptText className="size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium">هنوز رسیدی نرسیده است</p>
          <p className="max-w-xs text-xs leading-6 text-muted-foreground">
            مشتری رسید کارت‌به‌کارت را در همان گفت‌وگو می‌فرستد و این‌جا برای بررسی شما می‌آید.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {evidence.map((e) => {
            const Icon = e.kind === "image" ? ImageIcon : FileText;
            const changed = e.expected_amount !== total;
            return (
              <li key={e.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    <span className="text-sm font-medium">{e.kind === "image" ? "عکس رسید" : "متن رسید"}</span>
                  </div>
                  <EvidenceStatusBadge status={e.status} />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">مبلغ مورد انتظار</dt>
                    <dd className="font-semibold tabular-nums">{formatToman(e.expected_amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">رسید</dt>
                    <dd className="tabular-nums">{formatDateTime(e.created_at)}</dd>
                  </div>
                </dl>
                {changed && e.status === "pending_verification" && (
                  <p className="text-xs leading-6 text-warning">
                    مبلغ سفارش بعد از این رسید تغییر کرده است؛ جمع فعلی {amount} است.
                  </p>
                )}
                {e.status === "rejected" && (
                  <p className="text-xs leading-6 text-muted-foreground">
                    دلیل رد: {rejectReasonLabel(e.reject_reason)}
                    {e.decided_at ? `، ${formatDateTime(e.decided_at)}` : ""}
                    {e.decided_by ? ` (${DECIDER[e.decided_by] ?? "نامشخص"})` : ""}
                  </p>
                )}
                {e.status === "approved" && e.decided_at && (
                  <p className="text-xs leading-6 text-muted-foreground tabular-nums">
                    تأیید در {formatDateTime(e.decided_at)}
                    {e.decided_by ? ` (${DECIDER[e.decided_by] ?? "نامشخص"})` : ""}
                  </p>
                )}
                {e.status === "closed" && e.closed_reason && (
                  <p className="text-xs leading-6 text-muted-foreground">{CLOSED[e.closed_reason] ?? "دیگر نیازی به بررسی نیست."}</p>
                )}
                {e.note && <p className="rounded-md bg-muted px-3 py-2 text-xs leading-6">یادداشت داخلی: {e.note}</p>}
                <div className="flex flex-wrap gap-2">
                  {e.has_content && (
                    <Button variant="outline" className="min-h-11" onClick={() => setViewing(e)}>
                      <Eye className="size-4" strokeWidth={1.5} />
                      نمایش رسید
                    </Button>
                  )}
                  {decidable(e) && (
                    <>
                      <Button
                        className="min-h-11"
                        onClick={() => {
                          approve.begin();
                          setApproving(e);
                        }}
                      >
                        <Check className="size-4" strokeWidth={2} />
                        تأیید پرداخت
                      </Button>
                      <Button variant="ghost" className="min-h-11 text-destructive hover:text-destructive" onClick={() => setRejecting(e)}>
                        <X className="size-4" strokeWidth={2} />
                        رد رسید
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {awaitingPayment && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
          <p className="text-sm leading-7">واریز را بدون رسید در حساب خودتان دیده‌اید؟ پرداخت را دستی ثبت کنید.</p>
          <Button variant="outline" className="min-h-11 self-start" onClick={() => setMarkingPaid(true)}>
            ثبت پرداخت دستی
          </Button>
        </div>
      )}

      <ReceiptSheet
        orderId={orderId}
        orderCode={code}
        evidence={viewing}
        onClose={() => setViewing(null)}
        decide={viewing ? decidable(viewing) : false}
        onApprove={(e) => {
          setViewing(null);
          approve.begin();
          setApproving(e);
        }}
        onReject={(e) => {
          setViewing(null);
          setRejecting(e);
        }}
      />

      <AlertDialog
        open={approving !== null}
        onOpenChange={(o) => !o && setApproving(null)}
        title={`پرداخت ${name} را تأیید می‌کنید؟`}
        description={`تأیید یعنی کل مبلغ ${amount} به حساب شما رسیده است. سفارش پرداخت‌شده می‌شود، رسیدهای دیگرش بسته می‌شوند و به مشتری خبر داده می‌شود.`}
        confirmText="بله، مبلغ رسیده است"
        cancelText="منصرف شدم"
        onConfirm={async () => {
          if (!approving) return;
          const id = approving.id;
          await approve.run((key) => approveEvidenceAction(orderId, id, key), `پرداخت ${name} تأیید شد.`);
        }}
      />

      <RejectDialog orderId={orderId} name={name} evidence={rejecting} onClose={() => setRejecting(null)} />
      <MarkPaidDialog orderId={orderId} name={name} amount={amount} open={markingPaid} onClose={() => setMarkingPaid(false)} />
    </div>
  );
}

function RejectDialog({ orderId, name, evidence, onClose }: { orderId: string; name: string; evidence: Evidence | null; onClose: () => void }) {
  return (
    <Dialog open={evidence !== null} onOpenChange={(o) => !o && onClose()} title={`رد رسید ${name}`} role="alertdialog">
      {evidence && <RejectForm key={evidence.id} orderId={orderId} name={name} evidence={evidence} onClose={onClose} />}
    </Dialog>
  );
}

function RejectForm({ orderId, name, evidence, onClose }: { orderId: string; name: string; evidence: Evidence; onClose: () => void }) {
  const [reason, setReason] = React.useState<RejectReason | "">("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { run } = useIntent();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("دلیل رد رسید را انتخاب کنید.");
      return;
    }
    setBusy(true);
    const res = await run((key) => rejectEvidenceAction(orderId, evidence.id, reason, note, key), `رسید ${name} رد شد.`);
    setBusy(false);
    if (res.ok) onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm leading-7 text-muted-foreground">
        رسیدی به مبلغ مورد انتظار {formatToman(evidence.expected_amount)} رد می‌شود و دلیل آن با یک پیام ثابت به مشتری گفته می‌شود. سفارش منتظر پرداخت می‌ماند.
      </p>
      <Field label="دلیل رد" htmlFor="reject-reason">
        <Select
          id="reject-reason"
         
          value={reason}
          placeholder="یک دلیل انتخاب کنید"
          options={REJECT_REASONS}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setReason(e.target.value as RejectReason);
            setError(null);
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </Field>
      <Field label="یادداشت داخلی (اختیاری)" htmlFor="reject-note" hint="فقط برای خودتان؛ برای مشتری فرستاده نمی‌شود.">
        <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} showCount rows={3} />
      </Field>
      <div className="flex flex-wrap-reverse justify-end gap-2">
        <Button variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>
          منصرف شدم
        </Button>
        <Button type="submit" variant="destructive" className="min-h-11" disabled={busy}>
          {busy ? "در حال ثبت…" : "رد رسید"}
        </Button>
      </div>
    </form>
  );
}

function MarkPaidDialog({ orderId, name, amount, open, onClose }: { orderId: string; name: string; amount: string; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={`ثبت پرداخت دستی ${name}`} role="alertdialog">
      {open && <MarkPaidForm orderId={orderId} name={name} amount={amount} onClose={onClose} />}
    </Dialog>
  );
}

function MarkPaidForm({ orderId, name, amount, onClose }: { orderId: string; name: string; amount: string; onClose: () => void }) {
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { run } = useIntent();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await run((key) => markPaidAction(orderId, reference, key), `پرداخت ${name} ثبت شد.`);
    setBusy(false);
    if (res.ok) onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm leading-7 text-muted-foreground">
        با این کار تأیید می‌کنید که کل مبلغ {amount} به حساب شما رسیده است. سفارش پرداخت‌شده می‌شود، رسیدهای در انتظارش بسته می‌شوند و به مشتری خبر داده می‌شود.
      </p>
      <Field label="کد پیگیری بانکی (اختیاری)" htmlFor="paid-reference" hint="فقط برای سوابق خودتان.">
        <Input id="paid-reference" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={64} />
      </Field>
      <div className="flex flex-wrap-reverse justify-end gap-2">
        <Button variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>
          منصرف شدم
        </Button>
        <Button type="submit" className="min-h-11" disabled={busy}>
          {busy ? "در حال ثبت…" : "بله، پرداخت را ثبت کن"}
        </Button>
      </div>
    </form>
  );
}
