/*
 * The shapes the auth server actions answer with, restated here so client components never import from
 * src/server. The actions arrive as props from the server pages.
 */

export interface ActionError {
  message: string;
  field?: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

export type CodeSent = { ok: true; resendAfterSeconds: number } | { ok: false; error: ActionError };
export type StepResult = { ok: true } | { ok: false; error: ActionError };
export type SignupResult = { ok: false; error: ActionError; fieldErrors?: Partial<Record<string, string>> };

export type SendCode = (phone: string) => Promise<CodeSent>;
export type VerifyCode = (phone: string, code: string) => Promise<StepResult | undefined>;

export type AuthMethod = "otp" | "password";
