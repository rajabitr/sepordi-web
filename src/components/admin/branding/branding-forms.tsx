"use client";

import { useState, useTransition } from "react";
import { Check, Circle, ImageUp } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";

import { checkDisclosure, checkLogoFile, checkLogoSize, DISCLOSURE_MAX, DISCLOSURE_MIN, LOGO_MAX_BYTES } from "../model/branding";
import type { ActionResult } from "../model/result";

type Fail = Extract<ActionResult<unknown>, { ok: false }>;
const errText = (r: Fail) => (r.requestId ? `${r.message} (کد پیگیری: ${r.requestId})` : r.message);

const LOCALES = [
  { code: "fa", label: "فارسی", dir: "rtl" },
  { code: "en", label: "انگلیسی", dir: "ltr" },
  { code: "ar", label: "عربی", dir: "rtl" },
] as const;

export function BrandIdentityForm({
  names,
  supportLabel,
  supportUrl,
  save,
}: {
  names: Record<string, string>;
  supportLabel: Record<string, string>;
  supportUrl: string | null;
  save: (input: { names: Record<string, string>; supportLabel: Record<string, string>; supportUrl: string }) => Promise<ActionResult>;
}) {
  const { toast } = useToast();
  const [n, setN] = useState<Record<string, string>>({ ...names });
  const [s, setS] = useState<Record<string, string>>({ ...supportLabel });
  const [url, setUrl] = useState(supportUrl ?? "");
  const [urlError, setUrlError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await save({ names: n, supportLabel: s, supportUrl: url });
      setUrlError(r.ok ? undefined : r.fields?.supportUrl);
      toast(r.ok ? { title: "برند ذخیره شد.", variant: "success" } : { title: "ذخیره نشد", description: errText(r), variant: "error" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">نام سپردی در بیزین</legend>
        {LOCALES.map((l) => (
          <div key={l.code} className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${l.code}`}>{l.label}</Label>
            <Input id={`name-${l.code}`} dir={l.dir} maxLength={80} value={n[l.code] ?? ""} onChange={(e) => setN((v) => ({ ...v, [l.code]: e.target.value }))} />
          </div>
        ))}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">عنوان پشتیبانی در گزارش فعالیت فروشگاه</legend>
        {LOCALES.map((l) => (
          <div key={l.code} className="flex flex-col gap-1.5">
            <Label htmlFor={`support-${l.code}`}>{l.label}</Label>
            <Input id={`support-${l.code}`} dir={l.dir} maxLength={80} value={s[l.code] ?? ""} onChange={(e) => setS((v) => ({ ...v, [l.code]: e.target.value }))} />
          </div>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5 sm:max-w-lg">
        <Label htmlFor="support-url">آدرس پشتیبانی</Label>
        <Input id="support-url" dir="ltr" type="url" placeholder="https://sepordi.ir/support" value={url} onChange={(e) => setUrl(e.target.value)} error={urlError} />
      </div>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "در حال ذخیره…" : "ذخیره‌ی برند"}
        </Button>
      </div>
    </form>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? Check : Circle;
  return (
    <li className={cn("flex items-center gap-2 text-sm", ok ? "text-success" : "text-muted-foreground")}>
      <Icon className="size-4 shrink-0" strokeWidth={ok ? 2 : 1.5} />
      {children}
    </li>
  );
}

export function DisclosureForm({
  text,
  isDefault,
  save,
}: {
  text: string;
  isDefault: boolean;
  save: (text: string | null) => Promise<ActionResult>;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(text);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, start] = useTransition();
  const c = checkDisclosure(value);
  const lengthOk = !c.tooShort && !c.tooLong;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await save(value);
      toast(r.ok ? { title: "متن اطلاع‌رسانی ذخیره شد.", variant: "success" } : { title: "ذخیره نشد", description: errText(r), variant: "error" });
    });
  }

  async function reset() {
    const r = await save(null);
    toast(r.ok ? { title: "متن پیش‌فرض بیزین برگشت.", variant: "success" } : { title: "انجام نشد", description: errText(r), variant: "error" });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="disclosure-fa">متن فارسی</Label>
          <span className={cn("text-xs tabular-nums", lengthOk ? "text-muted-foreground" : "text-destructive")} aria-live="polite">
            {fa(c.length)} از {fa(DISCLOSURE_MAX)} نویسه
          </span>
        </div>
        <Textarea id="disclosure-fa" rows={3} value={value} onChange={(e) => setValue(e.target.value)} aria-describedby="disclosure-rules" />
        {isDefault && <p className="text-xs text-muted-foreground">الان متن پیش‌فرض بیزین فرستاده می‌شود.</p>}
      </div>
      <ul id="disclosure-rules" className="flex flex-col gap-1">
        <Rule ok={lengthOk}>
          بین {fa(DISCLOSURE_MIN)} تا {fa(DISCLOSURE_MAX)} نویسه
        </Rule>
        <Rule ok={c.saysAutomated}>صریح بگوید پاسخ‌ها خودکار است («دستیار خودکار»، «ربات»)</Rule>
        <Rule ok={c.offersHuman}>بگوید مشتری چطور با یک انسان گفت‌وگو کند («بنویسید: اپراتور»)</Rule>
      </ul>
      <p className="text-xs text-muted-foreground">نمونه: «سلام! من دستیار خودکار این فروشگاه هستم. هر وقت خواستید با همکار ما گفت‌وگو کنید، بنویسید: اپراتور»</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending || !lengthOk}>
          {pending ? "در حال ذخیره…" : "ذخیره‌ی متن"}
        </Button>
        {!isDefault && (
          <Button variant="ghost" size="lg" disabled={pending} onClick={() => setConfirmReset(true)}>
            برگشت به متن پیش‌فرض
          </Button>
        )}
      </div>
      <AlertDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="متن پیش‌فرض بیزین برگردد؟"
        description="متن فعلی سپردی پاک می‌شود و از پیام بعدی متن پیش‌فرض بیزین فرستاده می‌شود."
        confirmText="برگردان"
        destructive
        onConfirm={reset}
      />
    </form>
  );
}

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("unreadable"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function LogoUpload({ logoUrl, upload }: { logoUrl: string | null; upload: (form: FormData) => Promise<ActionResult> }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [key, setKey] = useState(0);

  async function pick(files: File[]) {
    const f = files[0] ?? null;
    setError(null);
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!f) return;
    const bad = checkLogoFile(f);
    if (bad) return setError(bad);
    try {
      const { width, height } = await imageSize(f);
      const tooBig = checkLogoSize(width, height);
      if (tooBig) return setError(tooBig);
    } catch {
      return setError("این تصویر خوانده نشد.");
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function submit() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const r = await upload(form);
      if (r.ok) {
        toast({ title: "لوگو بارگذاری شد.", variant: "success" });
        setFile(null);
        setPreview(null);
        setKey((k) => k + 1);
      } else toast({ title: "بارگذاری نشد", description: errText(r), variant: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {logoUrl && (
        <p className="text-sm">
          لوگوی فعلی:{" "}
          <a href={logoUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink underline-offset-4 hover:underline">
            مشاهده در بیزین
          </a>
        </p>
      )}
      <FileUpload
        key={key}
        accept="image/png,image/webp"
        multiple={false}
        maxSize={LOGO_MAX_BYTES}
        onFiles={pick}
        hint="PNG یا WebP، حداکثر ۲۵۶ کیلوبایت و ۵۱۲ در ۵۱۲ پیکسل. مربعی با پس‌زمینه‌ی شفاف بهتر دیده می‌شود."
      />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {preview && (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview of the operator's own file */}
          <img src={preview} alt="پیش‌نمایش لوگو" width={64} height={64} className="aspect-square size-16 rounded-xl border border-border object-contain" />
          <Button size="lg" disabled={pending} onClick={submit}>
            <ImageUp strokeWidth={2} />
            {pending ? "در حال بارگذاری…" : "بارگذاری لوگو"}
          </Button>
        </div>
      )}
    </div>
  );
}
