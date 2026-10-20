import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { JOB_STATUS_FA, JOB_TONE, label } from "@/components/admin/model/labels";
import { NewOnboardingJob } from "@/components/admin/onboarding/onboarding-forms";
import { ApiError, PageHeader, Pill, Section, SectionSkeleton } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/date";
import { fa } from "@/lib/utils";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

import { createOnboardingListAction } from "./actions";

export const metadata: Metadata = { title: "ثبت گروهی فروشگاه" };

type Search = Promise<{ cursor?: string }>;

export default async function OnboardingPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const { cursor } = await searchParams;
  return (
    <>
      <PageHeader title="ثبت گروهی فروشگاه" description="چند فروشگاه را با یک فایل یا فهرست در بیزین بسازید. اول همه‌ی سطرها بررسی می‌شوند، بعد شما ثبت می‌کنید." />
      <div className="flex flex-col gap-6">
        <Section title="نوبت تازه">
          <NewOnboardingJob createFromList={createOnboardingListAction} />
        </Section>
        <Suspense key={cursor ?? ""} fallback={<SectionSkeleton rows={5} />}>
          <Jobs cursor={cursor} />
        </Suspense>
      </div>
    </>
  );
}

async function Jobs({ cursor }: { cursor?: string }) {
  await requireAdmin();
  const page = await load(bizin.listOnboardingJobs({ limit: 20, cursor }));
  if (!page.ok) return <ApiError message={page.message} requestId={page.requestId} />;
  return (
    <Section title="نوبت‌های قبلی">
      {page.data.jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">هنوز نوبتی ساخته نشده است.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>منبع</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>سطرها</TableHead>
                <TableHead>خطادار</TableHead>
                <TableHead>ساخته‌شده</TableHead>
                <TableHead>
                  <span className="sr-only">جزئیات</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>{j.filename ? <bdi dir="ltr" className="font-mono text-xs">{j.filename}</bdi> : "فهرست دستی"}</TableCell>
                  <TableCell>
                    <Pill tone={JOB_TONE[j.status]}>{label(JOB_STATUS_FA, j.status)}</Pill>
                  </TableCell>
                  <TableCell numeric>{fa(j.counts.rows)}</TableCell>
                  <TableCell numeric className={j.counts.failed ? "text-destructive" : undefined}>{fa(j.counts.failed)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(j.created_at)}</TableCell>
                  <TableCell>
                    <Link href={`/admin/onboarding/${j.id}`} className="inline-flex h-11 items-center gap-1 rounded-control px-3 font-semibold text-brand-ink hover:bg-secondary">
                      جزئیات
                      <ArrowLeft className="size-4" strokeWidth={2} />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {page.data.next_cursor && (
            <Link href={`/admin/onboarding?cursor=${encodeURIComponent(page.data.next_cursor)}`} className={buttonVariants({ variant: "outline", size: "lg", className: "self-end" })}>
              قدیمی‌ترها
              <ArrowLeft strokeWidth={2} />
            </Link>
          )}
        </div>
      )}
    </Section>
  );
}
