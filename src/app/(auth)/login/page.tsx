import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthSkeleton } from "@/components/auth/auth-skeleton";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/components/auth/rules";
import { otpProvider } from "@/server/auth/otp";
import { getSession } from "@/server/auth/session";
import { loginWithCodeAction, loginWithPasswordAction, sendCodeAction } from "@/server/signup/actions";

export const metadata: Metadata = {
  title: "ورود",
  description: "ورود به پنل فروشگاه در سپردی با شماره موبایل.",
  robots: { index: false, follow: true },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: SearchParams }) {
  const [session, query] = await Promise.all([getSession(), searchParams]);
  const next = safeNextPath(Array.isArray(query.next) ? query.next[0] : query.next);
  if (session) redirect(next);
  const otp = otpProvider();
  return (
    <LoginForm
      method={otp ? "otp" : "password"}
      next={next}
      devHint={otp?.name === "console" && process.env.NODE_ENV !== "production"}
      actions={{ sendCode: sendCodeAction, loginWithCode: loginWithCodeAction, loginWithPassword: loginWithPasswordAction }}
    />
  );
}
