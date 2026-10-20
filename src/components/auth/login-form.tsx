"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

import { CodeStep } from "./code-step";
import { FieldMessage, FormAlert } from "./form-alert";
import { PHONE_ID, PhoneField } from "./phone-field";
import { checkPhone } from "./rules";
import type { ActionError, AuthMethod, SendCode, StepResult } from "./types";

const PASSWORD_ID = "auth-password";

export interface LoginActions {
  sendCode: SendCode;
  loginWithCode: (phone: string, code: string, next: string) => Promise<StepResult | undefined>;
  loginWithPassword: (phone: string, password: string, next: string) => Promise<StepResult | undefined>;
}

export function LoginForm({ method, next, devHint, actions }: { method: AuthMethod; next: string; devHint?: boolean; actions: LoginActions }) {
  const [phone, setPhone] = React.useState("");
  const [phoneError, setPhoneError] = React.useState<string>();
  const [password, setPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState<string>();
  const [formError, setFormError] = React.useState<ActionError | null>(null);
  const [codeSent, setCodeSent] = React.useState<number | null>(null);
  const [pending, start] = React.useTransition();

  const focus = (id: string) => document.getElementById(id)?.focus();
  const blurPhone = () => setPhoneError(phone ? checkPhone(phone) : undefined);

  function showError(e: ActionError) {
    if (e.field === "phone") {
      setPhoneError(e.message);
      focus(PHONE_ID);
    } else if (e.field === "password") {
      setPasswordError(e.message);
      focus(PASSWORD_ID);
    } else setFormError(e);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const pErr = checkPhone(phone);
    const pwErr = method === "password" && !password ? "رمز عبور را وارد کنید." : undefined;
    setPhoneError(pErr);
    setPasswordError(pwErr);
    if (pErr) return focus(PHONE_ID);
    if (pwErr) return focus(PASSWORD_ID);
    start(async () => {
      if (method === "otp") {
        const r = await actions.sendCode(phone);
        if (r.ok) setCodeSent(r.resendAfterSeconds);
        else showError(r.error);
      } else {
        const r = await actions.loginWithPassword(phone, password, next);
        if (r && !r.ok) showError(r.error);
      }
    });
  }

  const title = (
    <div>
      <h1 className="text-2xl leading-tight font-bold">ورود به سپردی</h1>
      <p className="mt-2 text-base leading-relaxed text-muted-foreground">
        {method === "otp" ? "شماره موبایل خود را وارد کنید تا کد ورود برایتان پیامک شود." : "با شماره موبایل و رمز عبور وارد شوید."}
      </p>
    </div>
  );

  if (method === "otp" && codeSent !== null) {
    return (
      <div className="flex flex-col gap-6">
        {title}
        <CodeStep
          phone={phone}
          resendAfterSeconds={codeSent}
          submitLabel="ورود"
          devHint={devHint}
          onVerify={(code) => actions.loginWithCode(phone, code, next)}
          onResend={() => actions.sendCode(phone)}
          onChangePhone={() => setCodeSent(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {title}
      <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
        <PhoneField value={phone} onChange={setPhone} onBlur={blurPhone} error={phoneError} autoFocus />
        {method === "password" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={PASSWORD_ID}>رمز عبور</Label>
            <PasswordInput
              id={PASSWORD_ID}
              name="password"
              autoComplete="current-password"
             
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? `${PASSWORD_ID}-msg` : undefined}
            />
            <FieldMessage id={PASSWORD_ID} error={passwordError} hint="رمز را فراموش کرده‌اید؟ با پشتیبانی تماس بگیرید." />
          </div>
        )}
        {devHint && method === "otp" && <p className="text-sm text-muted-foreground">حالت توسعه: کد ورود در لاگ سرور چاپ می‌شود.</p>}
        <FormAlert error={formError} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (method === "otp" ? "در حال ارسال کد…" : "در حال ورود…") : method === "otp" ? "دریافت کد ورود" : "ورود"}
        </Button>
      </form>
      <p className="text-center text-base">
        ثبت‌نام نکرده‌اید؟{" "}
        <Link href="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline-offset-4 hover:underline">
          ساخت حساب فروشگاه
        </Link>
      </p>
    </div>
  );
}
