"use server";

import { revalidatePath } from "next/cache";

import { ONBOARDING_DEFAULTS, parseOnboardingList } from "@/components/admin/model/onboarding";
import type { ActionResult } from "@/components/admin/model/result";
import { failed } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

const onErrorsOf = (v: unknown): "skip" | "abort" => (v === "abort" ? "abort" : "skip");
const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

function revalidate() {
  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/onboarding/[id]", "page");
}

/** Bizin checks every row first; nothing is provisioned until the job is committed. A file goes to ./upload. */
export async function createOnboardingListAction(input: { text: string; onErrors: string }): Promise<ActionResult<{ jobId: string }>> {
  await requireAdmin();
  const { rows, errors } = parseOnboardingList(String(input?.text ?? ""));
  if (errors.length) return { ok: false, message: errors.slice(0, 5).map((e) => e.message).join(" ") };
  if (rows.length === 0) return { ok: false, message: "فهرست خالی است." };
  try {
    const job = await bizin.createOnboardingJob({
      on_errors: onErrorsOf(input?.onErrors),
      auto_commit: false,
      defaults: { ...ONBOARDING_DEFAULTS },
      rows,
    });
    revalidate();
    return { ok: true, data: { jobId: job.id } };
  } catch (e) {
    return failed(e);
  }
}

export async function commitOnboardingJobAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!validId(id)) return { ok: false, message: "این نوبت پیدا نشد." };
  try {
    await bizin.commitOnboardingJob(id);
    revalidate();
    return { ok: true, data: undefined };
  } catch (e) {
    return failed(e);
  }
}

export async function cancelOnboardingJobAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!validId(id)) return { ok: false, message: "این نوبت پیدا نشد." };
  try {
    await bizin.cancelOnboardingJob(id);
    revalidate();
    return { ok: true, data: undefined };
  } catch (e) {
    return failed(e);
  }
}
