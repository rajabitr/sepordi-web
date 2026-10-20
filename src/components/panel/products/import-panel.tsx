"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { FileWarning } from "lucide-react";

import { cancelImportAction, commitImportAction } from "@/app/panel/products/actions";
import { SuccessCheck } from "@/components/animations/success-check";
import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Spinner } from "@/components/ui/spinner";
import { Stat } from "@/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

import { RequestId } from "./api-error";
import {
  importRowErrorFa,
  importWarningFa,
  isJobRunning,
  JOB_STATUS_LABEL,
  type ImportJobStatus,
  type ImportJobView,
  type ImportRowView,
} from "./catalog";
import { fetchJson } from "./fetch-json";
import { jalaliDateTime } from "./format";
import { useVisibleInterval } from "./use-visible-interval";

export interface JobSnapshotView {
  job: ImportJobView;
  failedRows: ImportRowView[];
  moreFailed: boolean;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const POLL_MS = 3000;

export const JOB_STATUS_VARIANT: Record<ImportJobStatus, "success" | "warning" | "destructive" | "secondary" | "brand"> = {
  ready: "brand",
  committing: "warning",
  done: "success",
  error: "destructive",
  expired: "secondary",
  cancelled: "secondary",
};

const JOB_ERROR_FA: Record<string, string> = {
  market_changed: "بازار فروشگاه بین بررسی و ثبت عوض شد و هیچ محصولی ثبت نشد. فایل را دوباره بفرستید.",
  commit_interrupted: "ثبت نیمه‌کاره ماند. محصولاتی که پیش از قطع ثبت شده بودند سر جایشان هستند؛ همین فایل را دوباره بفرستید تا بقیه ثبت شوند.",
};

function setJobInUrl(jobId: string | null) {
  const url = new URL(window.location.href);
  if (jobId) url.searchParams.set("job", jobId);
  else url.searchParams.delete("job");
  window.history.replaceState(null, "", url);
}

function FailedRows({ snapshot }: { snapshot: JobSnapshotView }) {
  const errors = snapshot.failedRows.flatMap((r) =>
    (r.errors.length ? r.errors : [{ code: "row_unreadable", params: {} }]).map((e, i) => ({ key: `${r.line}-${r.external_id}-${i}`, row: r, e })),
  );
  if (!errors.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">ردیف‌های خطادار</h3>
      <p className="text-sm leading-7 text-muted-foreground">این محصولات ثبت نمی‌شوند. خطا را در فایل درست کنید و فایل را دوباره بفرستید.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>سطر</TableHead>
            <TableHead>محصول</TableHead>
            <TableHead>ستون</TableHead>
            <TableHead>خطا</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {errors.map(({ key, row, e }) => (
            <TableRow key={key}>
              <TableCell numeric>{fa(e.line ?? row.line)}</TableCell>
              <TableCell className="max-w-48">
                <p className="truncate">{row.title || "—"}</p>
                {row.external_id && (
                  <bdi dir="ltr" className="block truncate text-xs text-muted-foreground">
                    {row.external_id}
                  </bdi>
                )}
              </TableCell>
              <TableCell>
                {e.column || e.field ? (
                  <bdi dir="auto" className="text-xs">
                    {e.column ?? e.field}
                  </bdi>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="min-w-48 leading-7">{importRowErrorFa(e)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {snapshot.moreFailed && <p className="text-xs text-muted-foreground">فقط اولین ردیف‌های خطادار نشان داده شده‌اند.</p>}
    </div>
  );
}

export function ImportPanel({ initial }: { initial: JobSnapshotView | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [snapshot, setSnapshot] = React.useState<JobSnapshotView | null>(initial);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; requestId?: string } | null>(null);
  const [confirmCommit, setConfirmCommit] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [uploadKey, setUploadKey] = React.useState(0);

  const job = snapshot?.job;
  const running = job ? isJobRunning(job.status) : false;

  useVisibleInterval(
    async () => {
      if (!job) return;
      const res = await fetchJson<JobSnapshotView>(`/panel/products/import/jobs/${encodeURIComponent(job.id)}`);
      if (!res.ok) {
        setError({ message: res.message, requestId: res.requestId });
        return;
      }
      setError(null);
      setSnapshot(res.data);
      if (res.data.job.status === "done") {
        const r = res.data.job.result;
        toast({ variant: "success", title: "محصولات ثبت شدند", description: r ? `${fa(r.created)} محصول ساخته و ${fa(r.updated)} محصول به‌روز شد.` : undefined });
        router.refresh();
      } else if (res.data.job.status === "error") {
        router.refresh();
      }
    },
    POLL_MS,
    running,
  );

  async function upload() {
    if (!file) return;
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.set("file", file, file.name);
    const res = await fetchJson<JobSnapshotView>("/panel/products/import/upload", {
      method: "POST",
      body: form,
      headers: { "x-upload-key": crypto.randomUUID() },
    });
    setUploading(false);
    if (!res.ok) {
      setError({ message: res.message, requestId: res.requestId });
      return;
    }
    setSnapshot(res.data);
    setJobInUrl(res.data.job.id);
    router.refresh();
  }

  async function commit() {
    if (!job) return;
    const res = await commitImportAction(job.id);
    if (!res.ok) {
      setError({ message: res.message, requestId: res.requestId });
      return;
    }
    setError(null);
    setSnapshot((s) => (s ? { ...s, job: res.job } : s));
  }

  async function cancel() {
    if (!job) return;
    setCancelling(true);
    const res = await cancelImportAction(job.id);
    setCancelling(false);
    if (!res.ok) {
      setError({ message: res.message, requestId: res.requestId });
      return;
    }
    toast({ title: "فایل لغو شد", description: "هیچ محصولی از این فایل ثبت نشد." });
    startOver();
  }

  function startOver() {
    setSnapshot(null);
    setFile(null);
    setError(null);
    setUploadKey((k) => k + 1);
    setJobInUrl(null);
  }

  const errorBox = error && (
    <Alert variant="destructive" title="کار انجام نشد">
      <p className="leading-7">{error.message}</p>
      {error.requestId && <RequestId id={error.requestId} />}
    </Alert>
  );

  if (!job) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload
          key={uploadKey}
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple={false}
          maxSize={MAX_FILE_BYTES}
          onFiles={(files) => setFile(files[0] ?? null)}
          hint="CSV با کدگذاری UTF-8 یا اکسل xlsx، حداکثر ۱۰ مگابایت"
          className="min-h-40"
        />
        {errorBox}
        <Button variant="brand" size="lg" className="self-start" disabled={!file || uploading} onClick={upload}>
          {uploading ? (
            <>
              <Spinner size="sm" /> در حال بررسی فایل…
            </>
          ) : (
            "بررسی فایل"
          )}
        </Button>
        <p className="text-xs leading-6 text-muted-foreground">بررسی چیزی را ثبت نمی‌کند: اول پیش‌نمایش و خطاها را می‌بینید، بعد تصمیم می‌گیرید.</p>
      </div>
    );
  }

  const c = job.counts;
  const r = job.result;

  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <bdi dir="auto" className="min-w-0 truncate font-semibold">
            {job.filename || "فایل بدون نام"}
          </bdi>
          <Badge variant={JOB_STATUS_VARIANT[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          فرستاده‌شده در {jalaliDateTime(job.created_at)}
          {job.status === "ready" && <> · تا {jalaliDateTime(job.expires_at)} فرصت ثبت دارید</>}
        </p>
      </div>

      {job.status === "done" && r ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <SuccessCheck size={64} label="ثبت محصولات تمام شد" />
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="ساخته شد" value={fa(r.created)} />
            <Stat label="به‌روز شد" value={fa(r.updated)} />
            <Stat label="ناموفق" value={fa(r.failed)} />
            <Stat label="انجام‌نشده" value={fa(r.not_attempted)} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="محصول در فایل" value={fa(c.rows)} />
          <Stat label="ساخته می‌شود" value={fa(c.will_create)} />
          <Stat label="به‌روز می‌شود" value={fa(c.will_update)} />
          <Stat label="خطادار" value={fa(c.failed)} />
        </div>
      )}

      {job.warnings.length > 0 && (
        <Alert variant="warning" title="نکته‌های فایل">
          <ul className="flex list-disc flex-col gap-1 ps-4">
            {job.warnings.map((w, i) => (
              <li key={`${w.code}-${w.line}-${i}`}>
                {importWarningFa(w.code)}
                {w.line > 0 && <span className="text-muted-foreground"> (سطر {fa(w.line)})</span>}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {job.status === "committing" && (
        <div className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-4" role="status">
          <Spinner size="md" className="text-brand-ink" />
          <p className="text-sm leading-7">
            در حال ثبت {fa(c.valid)} محصول… می‌توانید این صفحه را باز بگذارید یا بعداً از «فایل‌های قبلی» نتیجه را ببینید.
          </p>
        </div>
      )}
      {job.status === "error" && (
        <Alert variant="destructive" title="ثبت کامل نشد">
          {JOB_ERROR_FA[job.error ?? ""] ?? "ثبت این فایل با خطا تمام شد. فایل را دوباره بفرستید."}
        </Alert>
      )}
      {job.status === "expired" && <Alert variant="warning" title="مهلت ثبت گذشت">این پیش‌نمایش منقضی شده است. فایل را دوباره بفرستید.</Alert>}
      {job.status === "cancelled" && <Alert title="لغو شده">این فایل لغو شد و هیچ محصولی از آن ثبت نشد.</Alert>}

      <FailedRows snapshot={snapshot} />
      {errorBox}

      <div className="flex flex-wrap gap-2">
        {job.status === "ready" && (
          <>
            <Button variant="brand" size="lg" disabled={c.valid === 0} onClick={() => setConfirmCommit(true)}>
              ثبت نهایی
            </Button>
            <Button variant="outline" size="lg" disabled={cancelling} onClick={cancel}>
              {cancelling ? "در حال لغو…" : "لغو"}
            </Button>
          </>
        )}
        {job.status === "done" && (
          <Link href="/panel/products" className={buttonVariants({ variant: "brand", size: "lg" })}>
            دیدن محصولات
          </Link>
        )}
        {job.status !== "ready" && job.status !== "committing" && (
          <Button variant="outline" size="lg" onClick={startOver}>
            فرستادن فایل دیگر
          </Button>
        )}
      </div>
      {job.status === "ready" && c.valid === 0 && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <FileWarning className="size-4" strokeWidth={1.5} aria-hidden />
          هیچ محصول سالمی در فایل نیست. خطاها را درست کنید و دوباره بفرستید.
        </p>
      )}

      <AlertDialog
        open={confirmCommit}
        onOpenChange={setConfirmCommit}
        title="محصولات ثبت شوند؟"
        description={`${fa(c.will_create)} محصول ساخته و ${fa(c.will_update)} محصول به‌روز می‌شود${c.failed ? `؛ ${fa(c.failed)} محصول خطادار ثبت نمی‌شود` : ""}. محصولی که به‌روز می‌شود، فهرست تنوع‌هایش با فایل جایگزین می‌شود.`}
        confirmText="ثبت نهایی"
        onConfirm={commit}
      />
    </div>
  );
}
