"use client";

import * as React from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { tomanToRial } from "@/lib/money";
import { fa } from "@/lib/utils";

import { actOnCaseAction } from "@/app/panel/returns/actions";
import { useIntent } from "@/components/panel/orders/use-intent";

import { ACTION_META, CASE_REJECT_REASONS, allowedCaseActions, type CaseAction, type CaseRejectReason, type CaseState } from "./model";

// A case that moved since the page was read: the action refreshes the page, so the seller decides again on what is there now.
const MOVED = new Set(["case_state_conflict", "case_closed"]);
const MOVED_MESSAGE = "این درخواست در این فاصله تغییر کرده است. وضعیت تازه‌اش را نمایش دادیم؛ دوباره بررسی و تصمیم بگیرید.";

/** The decisions the case's current state allows; each opens one confirmation with its own fields. */
export function CaseActions({ caseId, code, state }: { caseId: string; code: string; state: CaseState }) {
  const actions = allowedCaseActions(state);
  const [asking, setAsking] = React.useState<CaseAction | null>(null);

  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">این درخواست بسته شده است و کار دیگری روی آن نمی‌شود انجام داد.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) => {
        const m = ACTION_META[a];
        return (
          <Button
            key={a}
            variant={m.danger ? "ghost" : i === 0 ? "default" : "outline"}
            className={m.danger ? "min-h-11 text-destructive hover:text-destructive" : "min-h-11"}
            onClick={() => setAsking(a)}
          >
            {m.button}
          </Button>
        );
      })}
      <Dialog
        open={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking ? ACTION_META[asking].title(fa(code)) : undefined}
        role="alertdialog"
      >
        {asking && <ActionForm key={asking} caseId={caseId} state={state} action={asking} onClose={() => setAsking(null)} />}
      </Dialog>
    </div>
  );
}

function ActionForm({ caseId, state, action, onClose }: { caseId: string; state: CaseState; action: CaseAction; onClose: () => void }) {
  const meta = ACTION_META[action];
  const [reason, setReason] = React.useState<CaseRejectReason | "">("");
  const [refundToman, setRefundToman] = React.useState<number | null>(null);
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { run } = useIntent();
  const notifyId = React.useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (action === "reject" && !reason) {
      setError("دلیل رد درخواست را انتخاب کنید.");
      return;
    }
    setBusy(true);
    const res = await run(async (key) => {
      const r = await actOnCaseAction(
        caseId,
        {
          action,
          expectedState: state,
          rejectReason: action === "reject" && reason ? reason : undefined,
          refundAmount: action === "mark_refunded" && refundToman !== null ? tomanToRial(refundToman) : undefined,
          refundReference: action === "mark_refunded" ? reference : undefined,
          note,
          notifyCustomer: notify,
        },
        key,
      );
      return !r.ok && MOVED.has(r.code) ? { ...r, message: MOVED_MESSAGE } : r;
    }, meta.done);
    setBusy(false);
    if (res.ok || MOVED.has(res.code)) onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm leading-7 text-muted-foreground">{meta.hint}</p>

      {action === "reject" && (
        <Field label="دلیل رد" htmlFor="case-reject-reason">
          <Select
            id="case-reject-reason"
           
            value={reason}
            placeholder="یک دلیل انتخاب کنید"
            options={CASE_REJECT_REASONS}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setReason(e.target.value as CaseRejectReason);
              setError(null);
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </Field>
      )}

      {action === "mark_refunded" && (
        <>
          <Field label="مبلغ برگشت داده‌شده (اختیاری)" htmlFor="case-refund-amount" hint="حداکثر به اندازه‌ی جمع سفارش. این مبلغ برای مشتری فرستاده نمی‌شود.">
            <AmountInput id="case-refund-amount" value={refundToman} onChange={setRefundToman} min={0} />
          </Field>
          <Field label="کد پیگیری واریز (اختیاری)" htmlFor="case-refund-reference">
            <Input id="case-refund-reference" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={64} />
          </Field>
        </>
      )}

      <Field label="یادداشت داخلی (اختیاری)" htmlFor="case-note" hint="فقط برای خودتان؛ برای مشتری فرستاده نمی‌شود.">
        <Textarea id="case-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} showCount rows={3} />
      </Field>

      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={notifyId} className="cursor-pointer text-sm">
          پیام کوتاه به مشتری فرستاده شود
          <span className="block text-xs text-muted-foreground">پیام ثابت است و فقط کد درخواست را دارد.</span>
        </label>
        <Switch id={notifyId} checked={notify} onCheckedChange={setNotify} />
      </div>

      <div className="flex flex-wrap-reverse justify-end gap-2">
        <Button variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>
          منصرف شدم
        </Button>
        <Button type="submit" variant={meta.danger ? "destructive" : "default"} className="min-h-11" disabled={busy}>
          {busy ? "در حال ثبت…" : meta.button}
        </Button>
      </div>
    </form>
  );
}
