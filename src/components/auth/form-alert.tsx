import { Alert } from "@/components/ui/alert";

import type { ActionError } from "./types";

/** A form-level failure with the request id support asks for. */
export function FormAlert({ error }: { error?: ActionError | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <p>{error.message}</p>
      {error.requestId && (
        <p className="mt-1 text-xs text-muted-foreground">
          کد پیگیری: <span dir="ltr" className="font-mono select-all">{error.requestId}</span>
        </p>
      )}
    </Alert>
  );
}

export function DevOtpHint() {
  return (
    <Alert variant="warning" title="حالت توسعه">
      کد تأیید پیامک نمی‌شود؛ آن را در لاگ سرور ببینید.
    </Alert>
  );
}

/** Message under a field, wired to the control through `aria-describedby={`${id}-msg`}`. */
export function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: React.ReactNode }) {
  if (!error && !hint) return null;
  return (
    <p id={`${id}-msg`} role={error ? "alert" : undefined} className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {error ?? hint}
    </p>
  );
}
