"use client";

import Link from "next/link";
import * as React from "react";

import { FieldMessage, FormAlert } from "@/components/auth/form-alert";
import type { ActionError, StepResult } from "@/components/auth/types";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { OtpField } from "@/components/ui/otp-field";

const RECOVERY_ID = "two-step-recovery";

/** The code from the authenticator app, or one recovery code when the phone is out of reach. */
export function TwoStepForm({ next, verify }: { next: string; verify: (code: string, next: string) => Promise<StepResult | undefined> }) {
  const [mode, setMode] = React.useState<"app" | "recovery">("app");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [formError, setFormError] = React.useState<ActionError | null>(null);
  const [pending, start] = React.useTransition();

  function submit(value: string) {
    setError(undefined);
    setFormError(null);
    start(async () => {
      const r = await verify(value, next);
      if (r && !r.ok) {
        if (r.error.field === "code") setError(r.error.message);
        else setFormError(r.error);
        setCode("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl leading-tight font-bold">ورود دومرحله‌ای</h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {mode === "app" ? "کد ۶ رقمی برنامه‌ی احراز هویت را وارد کنید." : "یکی از کدهای پشتیبان را که هنگام فعال‌سازی ذخیره کردید وارد کنید."}
        </p>
      </div>
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        {mode === "app" ? (
          <div className="flex flex-col gap-2">
            <OtpField value={code} onChange={setCode} onComplete={submit} disabled={pending} aria-label="کد برنامه‌ی احراز هویت" />
            <FieldMessage id="two-step-code" error={error} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={RECOVERY_ID}>کد پشتیبان</Label>
            <Input
              id={RECOVERY_ID}
              dir="ltr"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${RECOVERY_ID}-msg` : undefined}
            />
            <FieldMessage id={RECOVERY_ID} error={error} />
          </div>
        )}
        <FormAlert error={formError} />
        <Button type="submit" size="lg" className="w-full" disabled={pending || code.trim() === ""}>
          {pending ? "در حال بررسی…" : "ورود"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setMode(mode === "app" ? "recovery" : "app");
            setCode("");
            setError(undefined);
          }}
        >
          {mode === "app" ? "به برنامه دسترسی ندارم" : "استفاده از کد برنامه"}
        </Button>
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
          ورود از اول
        </Link>
      </div>
    </div>
  );
}
