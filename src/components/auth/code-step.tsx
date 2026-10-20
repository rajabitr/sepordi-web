"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { OtpField } from "@/components/ui/otp-field";
import { fa } from "@/lib/utils";

import { checkCode, normalizeCode } from "./rules";
import { DevOtpHint, FieldMessage, FormAlert } from "./form-alert";
import type { ActionError, CodeSent, StepResult } from "./types";
import { useCountdown } from "./use-countdown";

const CODE_ID = "auth-code";

/** «۰۹۱۲ ۳۴۵ ۶۷۸۹» for a 10-digit national number. */
export function faMobile(digits: string): string {
  const d = `0${digits}`;
  return fa(`${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`);
}

/** Enter the SMS code, with a 60-second resend timer. The code submits itself once all six digits are in. */
export function CodeStep({
  phone,
  resendAfterSeconds,
  submitLabel,
  devHint,
  onVerify,
  onResend,
  onChangePhone,
}: {
  phone: string;
  resendAfterSeconds: number;
  submitLabel: string;
  devHint?: boolean;
  onVerify: (code: string) => Promise<StepResult | undefined>;
  onResend: () => Promise<CodeSent>;
  onChangePhone: () => void;
}) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [formError, setFormError] = React.useState<ActionError | null>(null);
  const [deadline, setDeadline] = React.useState<number | null>(() => Date.now() + resendAfterSeconds * 1000);
  const [pending, start] = React.useTransition();
  const [resending, startResend] = React.useTransition();
  const left = useCountdown(deadline);
  const boxRef = React.useRef<HTMLDivElement>(null);

  const focusCode = () => boxRef.current?.querySelector("input")?.focus();

  function verify(value: string) {
    const bad = checkCode(value);
    if (bad) {
      setError(bad);
      focusCode();
      return;
    }
    setError(undefined);
    setFormError(null);
    start(async () => {
      const r = await onVerify(normalizeCode(value));
      if (r && !r.ok) {
        if (r.error.field === "code") setError(r.error.message);
        else setFormError(r.error);
        setCode("");
        focusCode();
      }
    });
  }

  function resend() {
    setFormError(null);
    startResend(async () => {
      const r = await onResend();
      if (r.ok) {
        setCode("");
        setError(undefined);
        setDeadline(Date.now() + r.resendAfterSeconds * 1000);
        focusCode();
      } else {
        setFormError(r.error);
        if (r.error.retryAfterSeconds) setDeadline(Date.now() + r.error.retryAfterSeconds * 1000);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        verify(code);
      }}
    >
      <p className="text-base leading-relaxed text-muted-foreground">
        کد ۶ رقمی به شماره‌ی <span dir="ltr" className="font-medium text-foreground">{faMobile(phone)}</span> پیامک شد.
      </p>
      {devHint && <DevOtpHint />}
      <div className="flex flex-col gap-2">
        <Label htmlFor={CODE_ID}>کد تأیید</Label>
        <div ref={boxRef} id={CODE_ID} aria-describedby={error ? `${CODE_ID}-msg` : undefined} className="flex justify-center sm:justify-start">
          <OtpField value={code} onChange={setCode} onComplete={verify} disabled={pending} aria-label="کد تأیید ۶ رقمی" />
        </div>
        <FieldMessage id={CODE_ID} error={error} />
      </div>
      <FormAlert error={formError} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "در حال بررسی کد…" : submitLabel}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onChangePhone} disabled={pending}>
          تغییر شماره
        </Button>
        {left > 0 ? (
          <p className="text-muted-foreground">
            ارسال دوباره‌ی کد تا{" "}
            <span dir="ltr" className="tabular-nums">
              {fa(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`)}
            </span>
          </p>
        ) : (
          <Button type="button" variant="ghost" className="min-h-11" onClick={resend} disabled={resending || pending}>
            {resending ? "در حال ارسال…" : "ارسال دوباره‌ی کد"}
          </Button>
        )}
      </div>
    </form>
  );
}
