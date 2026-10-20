import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { JOB_STATUS_FA, JOB_TONE, ROW_ACTION_FA, ROW_ERROR_FA, label } from "@/components/admin/model/labels";
import { JobActions } from "@/components/admin/onboarding/onboarding-forms";
import { ApiError, PageHeader, Pill, Section, SectionSkeleton } from "@/components/admin/page-parts";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/date";
import { cn, fa, faNumber } from "@/lib/utils";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

import { cancelOnboardingJobAction, commitOnboardingJobAction } from "../actions";

export const metadata: Metadata = { title: "نوبت ثبت گروهی" };

type Params = Promise<{ id: string }>;
type Search = Promise<{ only?: string; cursor?: string }>;

export default async function OnboardingJobPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireAdmin();
  const { id } = await params;
  const { only, cursor } = await searchParams;
  const failedOnly = only === "fail";
  return (
    <>
      <Link href="/admin/onboarding" className="mb-2 inline-flex h-11 items-center gap-1 rounded-control text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" strokeWidth={1.5} />
        ثبت گروهی فروشگاه
      </Link>
      <Suspense fallback={<SectionSkeleton rows={4} />}>
        <Job id={id} />
      </Suspense>
      <Suspense key={`${only ?? ""}|${cursor ?? ""}`} fallback={<SectionSkeleton rows={8} className="mt-6" />}>
        <Rows id={id} failedOnly={failedOnly} cursor={cursor} />
      </Suspense>
    </>
  );
}

async function Job({ id }: { id: string }) {
  await requireAdmin();
  const j = await load(bizin.getOnboardingJob(id));
  if (!j.ok) return <ApiError message={j.message} requestId={j.requestId} />;
  const job = j.data;
  return (
    <>
      <PageHeader
        title={job.filename || "فهرست دستی"}
        description={`ساخته‌شده ${formatDateTime(job.created_at)}${job.status === "ready" ? ` · تا ${formatDateTime(job.expires_at)} قابل ثبت` : ""}`}
        actions={<Pill tone={JOB_TONE[job.status]}>{label(JOB_STATUS_FA, job.status)}</Pill>}
      />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat size="sm" label="سطرها" value={faNumber(job.counts.rows)} />
          <Stat size="sm" label="سالم" value={faNumber(job.counts.valid)} />
          <Stat size="sm" label="ساخته می‌شود" value={faNumber(job.counts.will_create)} />
          <Stat size="sm" label="به‌روز می‌شود" value={faNumber(job.counts.will_update)} />
          <Stat size="sm" label="بدون تغییر" value={faNumber(job.counts.unchanged)} />
          <Stat size="sm" label="خطادار" value={faNumber(job.counts.failed)} className={job.counts.failed ? "border-destructive/40" : undefined} />
        </div>
        {job.result && (
          <Alert variant={job.result.failed ? "warning" : "success"} title="نتیجه‌ی ثبت">
            {fa(job.result.created)} ساخته شد، {fa(job.result.updated)} به‌روز شد، {fa(job.result.unchanged)} بدون تغییر، {fa(job.result.failed)} خطا
            {job.result.not_attempted ? `، ${fa(job.result.not_attempted)} انجام نشد` : ""}.
          </Alert>
        )}
        {job.error && (
          <Alert variant="destructive" title="ثبت نیمه‌کاره ماند">
            فروشگاه‌هایی که پیش از خطا ساخته شدند سر جایشان هستند. سطرهای باقی‌مانده را در نوبت تازه بفرستید.
          </Alert>
        )}
        {job.warnings.length > 0 && (
          <Alert variant="warning" title={`${fa(job.warnings.length)} هشدار در فایل`}>
            <ul className="flex flex-col gap-1">
              {job.warnings.slice(0, 10).map((w, i) => (
                <li key={i}>
                  سطر {fa(w.line)}: <bdi dir="ltr" className="font-mono text-xs">{w.code}</bdi>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {job.status === "ready" && (
          <JobActions
            commit={commitOnboardingJobAction.bind(null, job.id)}
            cancel={cancelOnboardingJobAction.bind(null, job.id)}
            failed={job.counts.failed}
            willCreate={job.counts.will_create + job.counts.will_update}
            onErrors={job.on_errors}
          />
        )}
      </div>
    </>
  );
}

async function Rows({ id, failedOnly, cursor }: { id: string; failedOnly: boolean; cursor?: string }) {
  await requireAdmin();
  const page = await load(bizin.listOnboardingJobRows(id, { limit: 100, cursor, ...(failedOnly ? { action: "fail" as const } : {}) }));
  if (!page.ok) return <ApiError className="mt-6" message={page.message} requestId={page.requestId} />;
  const base = `/admin/onboarding/${id}`;
  const filter = (active: boolean) => cn(buttonVariants({ variant: active ? "secondary" : "ghost", size: "lg" }));
  return (
    <Section
      className="mt-6"
      title="سطرها"
      actions={
        <nav aria-label="فیلتر سطرها" className="flex gap-2">
          <Link href={base} className={filter(!failedOnly)} aria-current={!failedOnly ? "page" : undefined}>همه</Link>
          <Link href={`${base}?only=fail`} className={filter(failedOnly)} aria-current={failedOnly ? "page" : undefined}>فقط خطادار</Link>
        </nav>
      }
    >
      {page.data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{failedOnly ? "سطر خطاداری نیست." : "سطری برای نمایش نیست."}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>سطر</TableHead>
                <TableHead>فروشگاه</TableHead>
                <TableHead>نتیجه</TableHead>
                <TableHead>ایراد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.rows.map((r) => (
                <TableRow key={r.line}>
                  <TableCell numeric>{fa(r.line)}</TableCell>
                  <TableCell>
                    <span className="block">{r.name || "—"}</span>
                    <bdi dir="ltr" className="block font-mono text-xs text-muted-foreground">{r.external_id}</bdi>
                  </TableCell>
                  <TableCell>
                    <Pill tone={r.action === "fail" ? "danger" : r.action === "create" ? "success" : "neutral"}>{label(ROW_ACTION_FA, r.action)}</Pill>
                  </TableCell>
                  <TableCell>
                    {r.errors.length === 0 ? (
                      "—"
                    ) : (
                      <ul className="flex flex-col gap-1 text-sm text-destructive">
                        {r.errors.map((e, i) => (
                          <li key={i}>
                            {label(ROW_ERROR_FA, e.code)}
                            {e.column && (
                              <>
                                {" "}
                                (<bdi dir="ltr" className="font-mono text-xs">{e.column}</bdi>)
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {page.data.next_cursor && (
            <Link
              href={`${base}?${new URLSearchParams({ ...(failedOnly ? { only: "fail" } : {}), cursor: page.data.next_cursor }).toString()}`}
              className={buttonVariants({ variant: "outline", size: "lg", className: "self-end" })}
            >
              سطرهای بعد
              <ArrowLeft strokeWidth={2} />
            </Link>
          )}
        </div>
      )}
    </Section>
  );
}
