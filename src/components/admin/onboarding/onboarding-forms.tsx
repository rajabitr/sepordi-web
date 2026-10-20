"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Upload } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Label } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

import { LIST_COLUMNS, parseOnboardingList } from "../model/onboarding";
import type { ActionResult } from "../model/result";
import { RequestId } from "../page-parts";

type Fail = Extract<ActionResult<unknown>, { ok: false }>;

const ON_ERRORS = [
  { value: "skip", label: "سطرهای سالم ثبت شوند" },
  { value: "abort", label: "با هر خطا هیچ‌کدام ثبت نشود" },
];

/** Files go to a Route Handler: a Server Action body stops at 1 MB and Bizin takes up to 10 MiB. */
async function uploadFile(form: FormData): Promise<ActionResult<{ jobId: string }>> {
  try {
    const res = await fetch("/admin/onboarding/upload", { method: "POST", body: form });
    return (await res.json()) as ActionResult<{ jobId: string }>;
  } catch {
    return { ok: false, message: "ارسال فایل انجام نشد. اتصال اینترنت را بررسی کنید و دوباره بفرستید." };
  }
}

export function NewOnboardingJob({
  createFromList,
}: {
  createFromList: (input: { text: string; onErrors: string }) => Promise<ActionResult<{ jobId: string }>>;
}) {
  const router = useRouter();
  const [onErrors, setOnErrors] = useState("skip");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<Fail | null>(null);
  const [pending, start] = useTransition();
  const parsed = text.trim() ? parseOnboardingList(text) : null;

  function done(r: ActionResult<{ jobId: string }>) {
    if (r.ok) router.push(`/admin/onboarding/${r.data.jobId}`);
    else setError(r);
  }

  function sendFile() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("on_errors", onErrors);
    start(async () => done(await uploadFile(form)));
  }

  function sendList() {
    start(async () => done(await createFromList({ text, onErrors })));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">اگر سطری خطا داشت</span>
        <SegmentedControl options={ON_ERRORS} value={onErrors} onChange={setOnErrors} aria-label="رفتار با سطرهای خطادار" />
      </div>
      <Tabs defaultValue="file">
        <TabsList>
          <TabsTrigger value="file">فایل CSV یا اکسل</TabsTrigger>
          <TabsTrigger value="list">فهرست دستی</TabsTrigger>
        </TabsList>
        <TabsContent value="file" className="flex flex-col gap-3 pt-4">
          <FileUpload
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple={false}
            onFiles={(f) => setFile(f[0] ?? null)}
            hint="ستون‌ها: external_business_id، business_name، owner_external_user_id، owner_email، owner_display_name و اختیاری owner_phone. عنوان فارسی ستون‌ها هم پذیرفته می‌شود."
          />
          <div>
            <Button size="lg" disabled={!file || pending} onClick={sendFile}>
              <Upload strokeWidth={2} />
              {pending ? "در حال بررسی…" : "بررسی فایل"}
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="list" className="flex flex-col gap-3 pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-list">هر فروشگاه در یک سطر، ستون‌ها با ویرگول یا Tab</Label>
            <Textarea id="onboarding-list" dir="auto" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={LIST_COLUMNS.join("، ")} />
            <p className="text-xs text-muted-foreground">ترتیب ستون‌ها: {LIST_COLUMNS.join("، ")}</p>
          </div>
          {parsed && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {fa(parsed.rows.length)} فروشگاه خوانده شد{parsed.errors.length ? `، ${fa(parsed.errors.length)} سطر ایراد دارد` : ""}.
            </p>
          )}
          {parsed && parsed.errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-destructive">
              {parsed.errors.slice(0, 8).map((e) => (
                <li key={e.line}>{e.message}</li>
              ))}
            </ul>
          )}
          <div>
            <Button size="lg" disabled={!parsed || parsed.rows.length === 0 || parsed.errors.length > 0 || pending} onClick={sendList}>
              {pending ? "در حال بررسی…" : "بررسی فهرست"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      {error && (
        <Alert variant="destructive" title="بررسی انجام نشد">
          <p>{error.message}</p>
          {error.requestId && <RequestId id={error.requestId} />}
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">بررسی هیچ فروشگاهی نمی‌سازد؛ بعد از دیدن نتیجه، «ثبت» را بزنید.</p>
    </div>
  );
}

export function JobActions({
  commit,
  cancel,
  failed,
  willCreate,
  onErrors,
}: {
  commit: () => Promise<ActionResult>;
  cancel: () => Promise<ActionResult>;
  failed: number;
  willCreate: number;
  onErrors: "skip" | "abort";
}) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<"commit" | "cancel" | null>(null);
  const blocked = onErrors === "abort" && failed > 0;

  async function run() {
    const r = confirm === "commit" ? await commit() : await cancel();
    if (r.ok) toast({ title: confirm === "commit" ? "ثبت شروع شد." : "این نوبت لغو شد.", variant: "success" });
    else toast({ title: "انجام نشد", description: r.requestId ? `${r.message} (کد پیگیری: ${r.requestId})` : r.message, variant: "error" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="lg" disabled={blocked || willCreate === 0} onClick={() => setConfirm("commit")}>
        ثبت {fa(willCreate)} فروشگاه
      </Button>
      <Button variant="outline" size="lg" onClick={() => setConfirm("cancel")}>
        لغو این نوبت
      </Button>
      {blocked && <span className="text-sm text-destructive">تا سطرهای خطادار درست نشوند، ثبت ممکن نیست. فایل اصلاح‌شده را دوباره بفرستید.</span>}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "commit" ? `${fa(willCreate)} فروشگاه در بیزین ساخته شود؟` : "این نوبت لغو شود؟"}
        description={
          confirm === "commit"
            ? `فروشگاه‌ها ساخته می‌شوند و از سقف قرارداد کم می‌شوند.${failed ? ` ${fa(failed)} سطر خطادار ثبت نمی‌شود.` : ""}`
            : "هیچ فروشگاهی ساخته نمی‌شود و این نوبت دیگر قابل ثبت نیست."
        }
        confirmText={confirm === "commit" ? "ثبت" : "لغو نوبت"}
        destructive={confirm === "cancel"}
        onConfirm={run}
      />
    </div>
  );
}
