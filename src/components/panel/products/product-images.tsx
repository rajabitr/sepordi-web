"use client";

import Image from "next/image";
import * as React from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

import { RequestId } from "./api-error";
import { fetchJson } from "./fetch-json";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, MAX_IMAGES, type ProductImagesView, type SendOutcome } from "./images-model";
import { useVisibleInterval } from "./use-visible-interval";

const POLL_MS = 3000;

type Problem = { message: string; requestId?: string };

/** Unsent pictures in the seller's chosen order; files the server added since go last. */
function arrange(view: ProductImagesView, order: string[]) {
  const sent = view.images.filter((i) => i.sent);
  const unsent = view.images.filter((i) => !i.sent);
  const rank = (f: string) => {
    const r = order.indexOf(f);
    return r === -1 ? order.length : r;
  };
  return { sent, unsent: [...unsent].sort((a, b) => rank(a.file) - rank(b.file)) };
}

export function ProductImages({ productExt, initial }: { productExt: string; initial: ProductImagesView }) {
  const { toast } = useToast();
  const [view, setView] = React.useState(initial);
  const [order, setOrder] = React.useState<string[]>(() => initial.images.filter((i) => !i.sent).map((i) => i.file));
  const [busy, setBusy] = React.useState<"upload" | "send" | null>(null);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [pickerKey, setPickerKey] = React.useState(0);

  const base = `/panel/products/${encodeURIComponent(productExt)}/images`;
  const { sent, unsent } = arrange(view, order);
  const pending = view.pendingJobId !== null;
  const free = MAX_IMAGES - view.images.length;

  useVisibleInterval(
    async () => {
      if (!view.pendingJobId) return;
      const res = await fetchJson<{ outcome: SendOutcome | null; state: ProductImagesView }>(`${base}/jobs/${encodeURIComponent(view.pendingJobId)}`);
      if (!res.ok) {
        setProblem({ message: res.message, requestId: res.requestId });
        return;
      }
      setProblem(null);
      setView(res.data.state);
      const o = res.data.outcome;
      if (!o || o.status === "running") return;
      const ok = o.status === "done" && o.ok;
      setResult({ ok, message: o.message });
      toast(ok ? { variant: "success", title: "عکس‌ها ذخیره شدند" } : { variant: "error", title: "عکس‌ها کامل ذخیره نشدند", description: o.message, duration: 8000 });
    },
    POLL_MS,
    pending,
  );

  async function upload(files: File[]) {
    setPickerKey((k) => k + 1);
    if (!files.length) return;
    setProblem(null);
    setResult(null);
    if (files.length > free) setProblem({ message: `هر محصول حداکثر ${fa(MAX_IMAGES)} عکس دارد؛ فقط ${fa(Math.max(free, 0))} عکس دیگر اضافه شد.` });
    setBusy("upload");
    for (const file of files.slice(0, Math.max(free, 0))) {
      const form = new FormData();
      form.set("file", file, file.name);
      const res = await fetchJson<ProductImagesView>(base, { method: "POST", body: form });
      if (!res.ok) {
        setProblem({ message: `«${file.name}»: ${res.message}`, requestId: res.requestId });
        break;
      }
      setView(res.data);
    }
    setBusy(null);
  }

  async function remove(file: string) {
    setProblem(null);
    const res = await fetchJson<ProductImagesView>(`${base}/${encodeURIComponent(file)}`, { method: "DELETE" });
    if (!res.ok) setProblem({ message: res.message, requestId: res.requestId });
    else setView(res.data);
  }

  function move(file: string, by: -1 | 1) {
    const files = unsent.map((i) => i.file);
    const at = files.indexOf(file);
    const to = at + by;
    if (at === -1 || to < 0 || to >= files.length) return;
    [files[at], files[to]] = [files[to], files[at]];
    setOrder(files);
  }

  async function send() {
    setProblem(null);
    setResult(null);
    setBusy("send");
    const res = await fetchJson<ProductImagesView>(`${base}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: unsent.map((i) => i.file) }),
    });
    setBusy(null);
    if (!res.ok) setProblem({ message: res.message, requestId: res.requestId });
    else setView(res.data);
  }

  const tiles = [...sent, ...unsent];

  return (
    <Card>
      <CardHeader>
        <CardTitle>عکس‌ها</CardTitle>
        <CardDescription>
          تا {fa(MAX_IMAGES)} عکس JPEG، PNG یا WebP، هر کدام حداکثر ۵ مگابایت. اولین عکس، عکس اصلی محصول است.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {tiles.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="عکس‌های محصول">
            {tiles.map((img, i) => {
              const u = unsent.indexOf(img);
              return (
                <li key={img.file} className="flex flex-col gap-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                    <Image src={img.url} alt={`عکس ${fa(i + 1)} محصول`} fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover" />
                  </div>
                  <div className="flex min-h-11 items-center justify-between gap-1">
                    <span className="text-xs text-muted-foreground">{fa(i + 1)}</span>
                    {img.sent ? (
                      <Badge variant="success">ثبت‌شده</Badge>
                    ) : (
                      <div className="flex items-center">
                        <Button variant="ghost" size="icon" className="size-11" aria-label="جلوتر" disabled={pending || u <= 0} onClick={() => move(img.file, -1)}>
                          <ChevronRight strokeWidth={1.5} aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-11" aria-label="عقب‌تر" disabled={pending || u === unsent.length - 1} onClick={() => move(img.file, 1)}>
                          <ChevronLeft strokeWidth={1.5} aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-11 text-destructive" aria-label="حذف عکس" disabled={pending || busy !== null} onClick={() => remove(img.file)}>
                          <Trash2 strokeWidth={1.5} aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {free > 0 && !pending && (
          <FileUpload
            key={pickerKey}
            accept={IMAGE_ACCEPT}
            maxSize={MAX_IMAGE_BYTES}
            onFiles={upload}
            hint={busy === "upload" ? "در حال بارگذاری…" : `${fa(free)} جای خالی دیگر`}
          />
        )}

        <p className="text-xs leading-6 text-muted-foreground">
          عکس‌ها به ترتیب بالا به محصول اضافه می‌شوند. عکسی که یک بار ثبت شد، از این‌جا جابه‌جا یا پاک نمی‌شود؛ پیش از ذخیره ترتیب را بررسی کنید.
        </p>

        {problem && (
          <Alert variant="destructive" title="کار انجام نشد">
            <p className="leading-7">{problem.message}</p>
            {problem.requestId && <RequestId id={problem.requestId} />}
          </Alert>
        )}
        {result && (
          <Alert variant={result.ok ? "success" : "warning"} title={result.ok ? "ذخیره شد" : "کامل ذخیره نشد"}>
            {result.message}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="brand" className="min-h-11" disabled={!unsent.length || pending || busy !== null} onClick={send}>
            {pending || busy === "send" ? <Spinner aria-hidden /> : <ImagePlus strokeWidth={2} aria-hidden />}
            {pending ? "در حال ثبت عکس‌ها…" : "ذخیره‌ی عکس‌ها"}
          </Button>
          {unsent.length > 0 && !pending && (
            <span className="text-sm text-muted-foreground">{fa(unsent.length)} عکس هنوز ذخیره نشده است.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
