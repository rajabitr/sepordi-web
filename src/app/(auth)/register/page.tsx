import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthSkeleton } from "@/components/auth/auth-skeleton";
import { RegisterFlow } from "@/components/auth/register-flow";
import { otpProvider } from "@/server/auth/otp";
import { getSession, isAdminUser } from "@/server/auth/session";
import { members } from "@/server/db/repo";
import {
  completeSignupAction,
  createAnotherShopAction,
  sendCodeAction,
  setSignupPasswordAction,
  verifySignupCodeAction,
} from "@/server/signup/actions";

export const metadata: Metadata = {
  title: "ثبت‌نام",
  description: "ساخت حساب فروشگاه در سپردی؛ دستیار هوشمند فروش در واتس‌اپ، اینستاگرام و تلگرام.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AuthSkeleton stepper />}>
      <Register searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * A signed-in seller without a shop (`requireSeller` sends them to `?step=shop`) resumes at the shop step.
 * `?another=1` is «فروشگاه جدید»: a seller who has a shop adds one more.
 */
async function Register({ searchParams }: { searchParams: SearchParams }) {
  const [session, query] = await Promise.all([getSession(), searchParams]);
  if (session && isAdminUser(session.user)) redirect("/admin");
  const another = query.another === "1";
  if (another && !session) redirect("/login");
  if (session && !another && members.shopFor(session.user.id)?.shop.bizin_tenant_id) redirect("/panel");
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
        completeSignup: another ? createAnotherShopAction : completeSignupAction,
      }}
    />
  );
}
