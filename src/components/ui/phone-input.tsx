"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIranMobile, isIranMobile, mobileOperator, normalizeIranMobile } from "@/lib/persian";

export interface PhoneInputProps {
  value?: string;
  /** Receives the 10-digit national number («912…») and validity. */
  onChange?: (digits: string, valid: boolean) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  className?: string;
  id?: string;
  /** Submitted with a plain `<form>`: the 10-digit national number. */
  name?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** A caller's error: true marks the field, a string also replaces the hint line. */
  error?: boolean | string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** شماره‌ی موبایل ایران. «+98» fixed on the left, groups of 3-3-4, operator detection, Persian digits accepted. */
export function PhoneInput({
  value,
  onChange,
  onBlur,
  className,
  id,
  name,
  autoFocus,
  disabled,
  error,
  "aria-invalid": ariaInvalid,
  "aria-describedby": describedBy,
}: PhoneInputProps) {
  const [internal, setInternal] = React.useState("");
  const digits = normalizeIranMobile(value ?? internal);
  const valid = isIranMobile(digits);
  const op = mobileOperator(digits);
  const shapeError = digits.length === 10 && !valid;
  const invalid = Boolean(error) || ariaInvalid === true || shapeError;
  const hintId = React.useId();
  const message = typeof error === "string" && error ? error : null;

  function set(next: string) {
    const d = normalizeIranMobile(next);
    if (value === undefined) setInternal(d);
    onChange?.(d, isIranMobile(d));
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("flex h-11 items-center gap-2 rounded-field border-line-field bg-field shadow-field px-3 transition-colors focus-within:ring-2 focus-within:ring-ring/60", invalid ? "border-destructive/60" : "border-input", disabled && "opacity-50")} dir="ltr">
        <span className="text-sm text-muted-foreground">+98</span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          disabled={disabled}
          value={formatIranMobile(digits)}
          onChange={(e) => set(e.target.value)}
          onBlur={onBlur}
          placeholder="912 345 6789"
          className="h-full min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={[describedBy, hintId].filter(Boolean).join(" ")}
        />
        {valid && !invalid && <Check className="size-4 text-success" />}
      </div>
      {name && <input type="hidden" name={name} value={digits} />}
      <p id={hintId} className="text-xs text-muted-foreground">
        {message ? (
          <span className="text-destructive">{message}</span>
        ) : op ? (
          `اپراتور: ${op}`
        ) : shapeError ? (
          <span className="text-destructive">شماره باید با ۹ شروع شود و ۱۰ رقم باشد</span>
        ) : (
          "بدون صفر اول هم می‌توانید وارد کنید"
        )}
      </p>
    </div>
  );
}
