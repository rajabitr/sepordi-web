import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";

import { ApiErrorAlert } from "@/components/panel/products/api-error";
import { JOB_STATUS_LABEL } from "@/components/panel/products/catalog";
import { jalaliDateTime } from "@/components/panel/products/format";
import { ImportPanel, JOB_STATUS_VARIANT, type JobSnapshotView } from "@/components/panel/products/import-panel";
import { PageHeader } from "@/components/panel/products/page-header";
import { ImportJobsSkeleton } from "@/components/panel/products/skeletons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireCapability } from "@/server/auth/session";
import { listCatalogImportJobs } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { fa } from "@/lib/utils";

import { loadJobSnapshot } from "./job-data";

export const metadata: Metadata = { title: "ورود محصولات از اکسل" };

type SearchParams = Promise<{ job?: string | string[] }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ImportSection({ searchParams }: { searchParams: SearchParams }) {
  const { shop } = await requireCapability("products.edit");
  const raw = (await searchParams).job;
  const jobId = typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
  let initial: JobSnapshotView | null = null;
  let loadError: { message: string; requestId?: string } | null = null;
  if (jobId) {
    try {
      initial = await loadJobSnapshot(shop.external_business_id, jobId);
    } catch (e) {
      const f = toFarsiError(e);
      loadError = { message: f.message, requestId: f.requestId };
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {loadError && <ApiErrorAlert title="این فایل بارگذاری نشد" message={loadError.message} requestId={loadError.requestId} />}
      <ImportPanel key={initial?.job.id ?? "new"} initial={initial} />
    </div>
  );
}

async function RecentJobs() {
  const { shop } = await requireCapability("products.edit");
  let jobs;
  try {
    jobs = (await listCatalogImportJobs(shop.external_business_id, { limit: 10 })).jobs;
  } catch (e) {
    const f = toFarsiError(e);
    return <ApiErrorAlert title="فایل‌های قبلی بارگذاری نشد" message={f.message} requestId={f.requestId} />;
  }
  if (!jobs.length) return <p className="text-sm text-muted-foreground">هنوز فایلی نفرستاده‌اید.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link
            href={`/panel/products/import?job=${j.id}`}
            className="flex min-h-16 flex-col gap-1 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex min-w-0 items-center gap-3">
              <bdi dir="auto" className="truncate font-medium">
                {j.filename || "ورودی بدون فایل"}
              </bdi>
              <Badge variant={JOB_STATUS_VARIANT[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
            </span>
            <span className="text-xs text-muted-foreground">
              {fa(j.counts.rows)} محصول · {jalaliDateTime(j.created_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ImportProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="ورود محصولات از اکسل"
        description="همه‌ی محصولات را یک‌جا از فایل CSV یا اکسل وارد کنید. قبل از ثبت، پیش‌نمایش و خطاها را می‌بینید."
        actions={
          <Link href="/panel/products" className={buttonVariants({ variant: "ghost", className: "min-h-11" })}>
            بازگشت به محصولات
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>۱. قالب را بگیرید</CardTitle>
          <CardDescription className="leading-7">هر سطر یک تنوع است و سطرهایی که external_id یکسان دارند یک محصول‌اند.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <a href="/templates/products.xlsx" download className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              <Download strokeWidth={1.5} aria-hidden />
              قالب اکسل (xlsx)
            </a>
            <a href="/templates/products.csv" download className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              <Download strokeWidth={1.5} aria-hidden />
              قالب CSV
            </a>
          </div>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-sm leading-7 text-muted-foreground">
            <li>
              ستون‌های <bdi dir="ltr">external_id</bdi> (شناسه‌ی محصول) و <bdi dir="ltr">variant_external_id</bdi> (شناسه‌ی تنوع) لازم‌اند؛ فقط حروف و ارقام انگلیسی و خط تیره.
            </li>
            <li>
              ستون <bdi dir="ltr">price</bdi> در قالب به <strong className="font-semibold text-foreground">ریال</strong> است. اگر می‌خواهید تومان بنویسید، عنوان ستون را «قیمت (تومان)» بگذارید.
            </li>
            <li>
              ستون <bdi dir="ltr">stock_qty</bdi> موجودی است. برای عکس، ستون <bdi dir="ltr">image_urls</bdi> را با نشانی عکس‌ها اضافه کنید (حداکثر هشت عکس برای هر محصول).
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>۲. فایل را بفرستید</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-56 rounded-xl" />}>
            <ImportSection searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="recent-jobs">
        <h2 id="recent-jobs" className="text-lg font-semibold">
          فایل‌های قبلی
        </h2>
        <Suspense fallback={<ImportJobsSkeleton />}>
          <RecentJobs />
        </Suspense>
      </section>
    </div>
  );
}
