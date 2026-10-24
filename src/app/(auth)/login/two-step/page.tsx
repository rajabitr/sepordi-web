import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthSkeleton } from "@/components/auth/auth-skeleton";
import { safeNextPath } from "@/components/auth/rules";
import { getSession } from "@/server/auth/session";
import { CHALLENGE_COOKIE, challengeUser } from "@/server/auth/two-step";
import { verifyTwoStepAction } from "@/server/signup/actions";

import { TwoStepForm } from "./two-step-form";

export const metadata: Metadata = {
  title: "ورود دومرحله‌ای",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function TwoStepPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <TwoStep searchParams={searchParams} />
    </Suspense>
  );
}

async function TwoStep({ searchParams }: { searchParams: SearchParams }) {
  const [session, query, jar] = await Promise.all([getSession(), searchParams, cookies()]);
  const next = safeNextPath(Array.isArray(query.next) ? query.next[0] : query.next);
  if (session) redirect(next);
  if (!challengeUser(jar.get(CHALLENGE_COOKIE)?.value)) redirect("/login");
  return <TwoStepForm next={next} verify={verifyTwoStepAction} />;
}
