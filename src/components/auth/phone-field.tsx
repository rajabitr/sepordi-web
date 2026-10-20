"use client";

import { Label } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

import { FieldMessage } from "./form-alert";

export const PHONE_ID = "auth-phone";

/** Mobile number with its label above and the error under it; validates when focus leaves the field. */
export function PhoneField({
  value,
  onChange,
  onBlur,
  error,
  autoFocus,
}: {
  value: string;
  onChange: (digits: string) => void;
  onBlur?: () => void;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={PHONE_ID}>شماره موبایل</Label>
      <PhoneInput
        id={PHONE_ID}
        value={value}
        onChange={(d) => onChange(d)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        error={Boolean(error)}
        aria-describedby={error ? `${PHONE_ID}-msg` : undefined}
      />
      <FieldMessage id={PHONE_ID} error={error} />
    </div>
  );
}
