import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthSkeleton } from "@/components/auth/auth-skeleton";
import { RegisterFlow } from "@/components/auth/register-flow";
import { otpProvider } from "@/server/auth/otp";
import { getSession, isAdminUser } from "@/server/auth/session";
import { shops } from "@/server/db/repo";
import { completeSignupAction, sendCodeAction, setSignupPasswordAction, verifySignupCodeAction } from "@/server/signup/actions";

export const metadata: Metadata = {
  title: "ثبت‌نام",
  description: "ساخت حساب فروشگاه در سپردی؛ دستیار هوشمند فروش در واتس‌اپ، اینستاگرام و تلگرام.",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthSkeleton stepper />}>
      <Register />
    </Suspense>
  );
}

/** A signed-in seller without a shop (`requireSeller` sends them to `?step=shop`) resumes at the shop step. */
async function Register() {
  const session = await getSession();
  if (session && isAdminUser(session.user)) redirect("/admin");
  if (session && shops.byUserId(session.user.id)?.bizin_tenant_id) redirect("/panel");
  const otp = otpProvider();
  return (
    <RegisterFlow
      method={otp ? "otp" : "password"}
      initialStep={session ? 2 : 0}
      devHint={otp?.name === "console" && process.env.NODE_ENV !== "production"}
      actions={{
        sendCode: sendCodeAction,
        verifySignupCode: verifySignupCodeAction,
        setSignupPassword: setSignupPasswordAction,
        completeSignup: completeSignupAction,
      }}
    />
  );
}
