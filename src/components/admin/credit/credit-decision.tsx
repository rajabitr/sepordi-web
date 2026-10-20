"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Check, X } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

import type { ActionResult } from "../model/result";

/**
 * One order's next staff step. `verify`: a card-to-card transfer, «پرداخت تأیید شد» or «رد شد». `grant`: money
 * verified, «شارژ شد» once a Bizin operator posted the credit.
 */
export function CreditDecision({
  stage,
  summary,
  decide,
}: {
  stage: "verify" | "grant";
  summary: string;
  decide: (decision: "paid" | "granted" | "rejected", note: string) => Promise<ActionResult>;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [granting, setGranting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  async function grant() {
    const r = await decide("granted", "");
    toast(r.ok ? { title: "ثبت شد: شارژ شد.", variant: "success" } : { title: "ثبت نشد", description: r.message, variant: "error" });
  }

  async function confirmPayment() {
    const r = await decide("paid", "");
    toast(r.ok ? { title: "ثبت شد: پرداخت تأیید شد.", variant: "success" } : { title: "ثبت نشد", description: r.message, variant: "error" });
  }

  function reject(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return setNoteError("دلیل رد را بنویسید.");
    start(async () => {
      const r = await decide("rejected", note);
      if (r.ok) {
        setRejecting(false);
        setNote("");
        toast({ title: "ثبت شد: رد شد.", variant: "success" });
      } else {
        setNoteError(r.fields?.note);
        toast({ title: "ثبت نشد", description: r.message, variant: "error" });
      }
    });
  }

  if (stage === "grant") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" variant="outline" onClick={() => setGranting(true)}>
          <Check strokeWidth={2} className="text-success" />
          شارژ شد
        </Button>
        <AlertDialog
          open={granting}
          onOpenChange={setGranting}
          title="اعتبار این فروشگاه شارژ شده است؟"
          description={`${summary}. فقط وقتی بزنید که اپراتور بیزین اعتبار را روی همین فروشگاه شارژ کرده است؛ این دکمه خودش اعتباری اضافه نمی‌کند.`}
          confirmText="بله، شارژ شده"
          onConfirm={grant}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" variant="outline" disabled={pending} onClick={() => setConfirming(true)}>
        <BadgeCheck strokeWidth={2} className="text-success" />
        پرداخت تأیید شد
      </Button>
      <Button size="lg" variant="ghost" disabled={pending} className="text-destructive" onClick={() => setRejecting(true)}>
        <X strokeWidth={2} />
        رد شد
      </Button>
      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="این واریز به حساب رسیده است؟"
        description={`${summary}. فقط وقتی بزنید که همین مبلغ با همین شماره‌ی پیگیری را در حساب دیده‌اید.`}
        confirmText="بله، واریز رسیده"
        onConfirm={confirmPayment}
      />
      <Dialog open={rejecting} onOpenChange={setRejecting} title="رد سفارش اعتبار" description={summary} className="max-w-md">
        <form onSubmit={reject} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-note">دلیل رد (فروشنده هم می‌بیند)</Label>
            <Textarea
              id="reject-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteError(undefined);
              }}
              placeholder="مثلاً: مبلغ واریزی با سفارش نمی‌خواند."
              aria-invalid={Boolean(noteError)}
            />
            {noteError && <p className="text-sm text-destructive">{noteError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" variant="destructive" disabled={pending}>
              {pending ? "لطفاً صبر کنید…" : "رد سفارش"}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setRejecting(false)}>
              انصراف
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
