"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";

import { CodeStep } from "./code-step";
import { DevOtpHint, FieldMessage, FormAlert } from "./form-alert";
import { PHONE_ID, PhoneField } from "./phone-field";
import {
  checkBusiness,
  checkCategory,
  checkEmail,
  checkInstagram,
  checkOwnerName,
  checkPassword,
  checkPhone,
  checkShopName,
  faWait,
  FIELD_MESSAGES,
  SHOP_CATEGORIES,
  type BusinessErrors,
  type BusinessFields,
} from "./rules";
import type { ActionError, AuthMethod, SendCode, SignupResult, StepResult } from "./types";
import { useCountdown } from "./use-countdown";

export interface RegisterActions {
  sendCode: SendCode;
  verifySignupCode: (phone: string, code: string) => Promise<StepResult | undefined>;
  setSignupPassword: (phone: string, password: string) => Promise<StepResult>;
  completeSignup: (fields: BusinessFields) => Promise<SignupResult | undefined>;
}

const STEPS = [{ label: "موبایل" }, { label: "تأیید" }, { label: "فروشگاه" }];

/** Signup: mobile → SMS code (or a password where no SMS provider is set) → the shop and its Bizin business. */
export function RegisterFlow({
  method,
  initialStep,
  devHint,
  actions,
}: {
  method: AuthMethod;
  initialStep: 0 | 2;
  devHint?: boolean;
  actions: RegisterActions;
}) {
  const [step, setStep] = React.useState<0 | 1 | 2>(initialStep);
  const [phone, setPhone] = React.useState("");
  const [resendAfter, setResendAfter] = React.useState(60);

  return (
    <div className="flex flex-col gap-8">
      <Stepper current={step} steps={STEPS} />
      {step === 0 && (
        <PhoneStep
          method={method}
          phone={phone}
          setPhone={setPhone}
          devHint={devHint}
          sendCode={actions.sendCode}
          onDone={(after) => {
            if (after) setResendAfter(after);
            setStep(1);
          }}
        />
      )}
      {step === 1 && method === "otp" && (
        <div className="flex flex-col gap-6">
          <StepTitle title="تأیید شماره موبایل" />
          <CodeStep
            phone={phone}
            resendAfterSeconds={resendAfter}
            submitLabel="تأیید و ادامه"
            devHint={devHint}
            onVerify={async (code) => {
              const r = await actions.verifySignupCode(phone, code);
              if (r?.ok) setStep(2);
              return r;
            }}
            onResend={() => actions.sendCode(phone)}
            onChangePhone={() => setStep(0)}
          />
        </div>
      )}
      {step === 1 && method === "password" && (
        <PasswordStep phone={phone} setSignupPassword={actions.setSignupPassword} onBack={() => setStep(0)} onDone={() => setStep(2)} />
      )}
      {step === 2 && <BusinessStep completeSignup={actions.completeSignup} />}
      {step < 2 && (
        <p className="text-center text-base">
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline-offset-4 hover:underline">
            ورود
          </Link>
        </p>
      )}
    </div>
  );
}

function StepTitle({ title, text }: { title: string; text?: string }) {
  return (
    <div>
      <h1 className="text-2xl leading-tight font-bold">{title}</h1>
      {text && <p className="mt-2 text-base leading-relaxed text-muted-foreground">{text}</p>}
    </div>
  );
}

const focus = (id: string) => document.getElementById(id)?.focus();

function PhoneStep({
  method,
  phone,
  setPhone,
  devHint,
  sendCode,
  onDone,
}: {
  method: AuthMethod;
  phone: string;
  setPhone: (v: string) => void;
  devHint?: boolean;
  sendCode: SendCode;
  onDone: (resendAfterSeconds?: number) => void;
}) {
  const [error, setError] = React.useState<string>();
  const [formError, setFormError] = React.useState<ActionError | null>(null);
  const [pending, start] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const bad = checkPhone(phone);
    setError(bad);
    if (bad) return focus(PHONE_ID);
    if (method === "password") return onDone();
    start(async () => {
      const r = await sendCode(phone);
      if (r.ok) return onDone(r.resendAfterSeconds);
      if (r.error.field === "phone") {
        setError(r.error.message);
        focus(PHONE_ID);
      } else setFormError(r.error);
    });
  }

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
      <StepTitle
        title="ساخت حساب فروشگاه"
        text={method === "otp" ? "با شماره موبایل شروع کنید؛ یک کد تأیید برایتان پیامک می‌شود." : "با شماره موبایل شروع کنید؛ در قدم بعد رمز عبور می‌گذارید."}
      />
      <PhoneField value={phone} onChange={setPhone} onBlur={() => setError(phone ? checkPhone(phone) : undefined)} error={error} autoFocus />
      {devHint && <DevOtpHint />}
      <FormAlert error={formError} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "در حال ارسال کد…" : method === "otp" ? "دریافت کد تأیید" : "ادامه"}
      </Button>
    </form>
  );
}

function PasswordStep({
  phone,
  setSignupPassword,
  onBack,
  onDone,
}: {
  phone: string;
  setSignupPassword: RegisterActions["setSignupPassword"];
  onBack: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = React.useState<ActionError | null>(null);
  const [pending, start] = React.useTransition();

  const confirmError = (c: string) => (c && c !== password ? FIELD_MESSAGES.passwordConfirm : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next = { password: checkPassword(password), confirm: confirm === password ? undefined : FIELD_MESSAGES.passwordConfirm };
    setErrors(next);
    if (next.password) return focus("reg-password");
    if (next.confirm) return focus("reg-confirm");
    start(async () => {
      const r = await setSignupPassword(phone, password);
      if (r.ok) return onDone();
      if (r.error.field === "password") {
        setErrors({ password: r.error.message });
        focus("reg-password");
      } else setFormError(r.error);
    });
  }

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
      <StepTitle title="رمز عبور بگذارید" text="با همین شماره و رمز عبور وارد پنل فروشگاه می‌شوید." />
      <div className="flex flex-col gap-2">
        <Label htmlFor="reg-password">رمز عبور</Label>
        <PasswordInput
          id="reg-password"
          name="new-password"
          autoComplete="new-password"
         
          strength
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setErrors((x) => ({ ...x, password: password ? checkPassword(password) : undefined }))}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "reg-password-msg" : undefined}
        />
        <FieldMessage id="reg-password" error={errors.password} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reg-confirm">تکرار رمز عبور</Label>
        <PasswordInput
          id="reg-confirm"
          name="confirm-password"
          autoComplete="new-password"
         
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setErrors((x) => ({ ...x, confirm: confirmError(confirm) }))}
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? "reg-confirm-msg" : undefined}
        />
        <FieldMessage id="reg-confirm" error={errors.confirm} />
      </div>
      <FormAlert error={formError} />
      {formError?.field === "phone" && (
        <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline-offset-4 hover:underline">
          رفتن به صفحه‌ی ورود
        </Link>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "در حال ساخت حساب…" : "ادامه"}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11 self-start" onClick={onBack} disabled={pending}>
        تغییر شماره
      </Button>
    </form>
  );
}

const FIELD_IDS: Record<keyof BusinessFields, string> = {
  shopName: "biz-shop-name",
  ownerName: "biz-owner-name",
  email: "biz-email",
  instagram: "biz-instagram",
  category: "biz-category",
};
const ORDER: (keyof BusinessFields)[] = ["shopName", "ownerName", "email", "instagram", "category"];
const CHECKS: Record<keyof BusinessFields, (v: string) => string | undefined> = {
  shopName: checkShopName,
  ownerName: checkOwnerName,
  email: checkEmail,
  instagram: checkInstagram,
  category: checkCategory,
};

function BusinessStep({ completeSignup }: { completeSignup: RegisterActions["completeSignup"] }) {
  const [values, setValues] = React.useState<BusinessFields>({ shopName: "", ownerName: "", email: "", instagram: "", category: "" });
  const [errors, setErrors] = React.useState<BusinessErrors>({});
  const [formError, setFormError] = React.useState<ActionError | null>(null);
  const [waitUntil, setWaitUntil] = React.useState<number | null>(null);
  const [pending, start] = React.useTransition();
  const wait = useCountdown(waitUntil);

  const set = (k: keyof BusinessFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setValues((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: CHECKS[k](v) }));
  };
  const blur = (k: keyof BusinessFields) => () => {
    if (values[k] || errors[k]) setErrors((x) => ({ ...x, [k]: CHECKS[k](values[k]) }));
  };
  const showErrors = (next: BusinessErrors) => {
    setErrors(next);
    const first = ORDER.find((k) => next[k]);
    if (first) focus(FIELD_IDS[first]);
  };
  const a11y = (k: keyof BusinessFields) => ({
    id: FIELD_IDS[k],
    name: k,
    value: values[k],
    onChange: set(k),
    onBlur: blur(k),
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `${FIELD_IDS[k]}-msg` : undefined,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const local = checkBusiness(values);
    if (Object.keys(local).length) return showErrors(local);
    start(async () => {
      const r = await completeSignup(values);
      if (!r) return;
      if (r.fieldErrors && Object.keys(r.fieldErrors).length) showErrors(r.fieldErrors as BusinessErrors);
      else setFormError(r.error);
      if (r.error.retryAfterSeconds) setWaitUntil(Date.now() + r.error.retryAfterSeconds * 1000);
    });
  }

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
      <StepTitle title="اطلاعات فروشگاه" text="دستیار با همین نام خودش را به مشتری‌ها معرفی می‌کند. بعداً هم می‌توانید عوضش کنید." />
      <div className="flex flex-col gap-2">
        <Label htmlFor={FIELD_IDS.shopName}>نام فروشگاه</Label>
        <Input {...a11y("shopName")} autoComplete="organization" placeholder="مثلاً: گالری نقره‌ی ماه" maxLength={80} autoFocus />
        <FieldMessage id={FIELD_IDS.shopName} error={errors.shopName} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={FIELD_IDS.ownerName}>نام و نام خانوادگی مالک</Label>
        <Input {...a11y("ownerName")} autoComplete="name" placeholder="مثلاً: سارا محمدی" maxLength={80} />
        <FieldMessage id={FIELD_IDS.ownerName} error={errors.ownerName} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={FIELD_IDS.email}>ایمیل</Label>
        <Input {...a11y("email")} type="email" dir="ltr" inputMode="email" autoComplete="email" placeholder="name@example.com" />
        <FieldMessage id={FIELD_IDS.email} error={errors.email} hint="رسیدها و پیام‌های مهم حساب به این ایمیل می‌آید." />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={FIELD_IDS.instagram}>صفحه‌ی اینستاگرام (اختیاری)</Label>
        <Input
          {...a11y("instagram")}
         
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="@yourshop"
        />
        <FieldMessage id={FIELD_IDS.instagram} error={errors.instagram} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={FIELD_IDS.category}>دسته‌ی فروشگاه (اختیاری)</Label>
        <Select {...a11y("category")} options={[...SHOP_CATEGORIES]} placeholder="انتخاب کنید" />
        <FieldMessage id={FIELD_IDS.category} error={errors.category} />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-surface border border-border bg-muted px-4 py-3">
        <div>
          <p className="text-sm font-medium">زبان پاسخ دستیار</p>
          <p className="text-sm text-muted-foreground">دستیار به مشتری‌های شما فارسی جواب می‌دهد.</p>
        </div>
        <span className="shrink-0 text-base font-semibold">فارسی</span>
      </div>
      <FormAlert error={formError} />
      <Button type="submit" size="lg" className="w-full" disabled={pending || wait > 0}>
        {pending ? "در حال ساخت فروشگاه…" : wait > 0 ? `${faWait(wait)} دیگر دوباره امتحان کنید` : "ساخت فروشگاه"}
      </Button>
    </form>
  );
}
