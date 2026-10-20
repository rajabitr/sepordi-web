"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Plus, RefreshCw, Send, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/date";
import { fa } from "@/lib/utils";

import { EVENT_TYPE_FA, WEBHOOK_DISABLED_FA, label } from "../model/labels";
import type { ActionResult } from "../model/result";
import { Pill, RequestId } from "../page-parts";
import { SecretOnce } from "../secret-once";

export interface WebhookView {
  id: string;
  url: string;
  event_types: string[];
  status: "active" | "disabled";
  disabled_reason: string | null;
  consecutive_failures: number;
  description: string;
  updated_at: string;
}

export interface WebhookActions {
  create: (input: { url: string; eventTypes: string[]; description: string }) => Promise<ActionResult<{ secret: string | null }>>;
  ping: (id: string) => Promise<ActionResult<{ eventId: string }>>;
  rotate: (id: string) => Promise<ActionResult<{ secret: string | null; previousValidUntil: string | null }>>;
  setStatus: (id: string, status: "active" | "disabled") => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
}

type Shown = { title: string; secret: string; previousValidUntil: string | null } | null;

const SPECIFIC_EVENTS = Object.keys(EVENT_TYPE_FA).filter((k) => k !== "*" && k !== "ping");

function errText(r: Extract<ActionResult<unknown>, { ok: false }>) {
  return r.requestId ? `${r.message} (کد پیگیری: ${r.requestId})` : r.message;
}

export function WebhooksManager({ webhooks, defaultUrl, actions }: { webhooks: WebhookView[]; defaultUrl: string; actions: WebhookActions }) {
  const { toast } = useToast();
  const [shown, setShown] = useState<Shown>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "rotate" | "delete" | "disable"; hook: WebhookView } | null>(null);
  const [pending, start] = useTransition();

  function ping(hook: WebhookView) {
    start(async () => {
      const r = await actions.ping(hook.id);
      toast(r.ok ? { title: "رویداد آزمایشی فرستاده شد.", description: "نتیجه را در فهرست تحویل‌ها ببینید.", variant: "success" } : { title: "آزمایش انجام نشد", description: errText(r), variant: "error" });
    });
  }

  function enable(hook: WebhookView) {
    start(async () => {
      const r = await actions.setStatus(hook.id, "active");
      toast(r.ok ? { title: "وب‌هوک فعال شد.", variant: "success" } : { title: "فعال نشد", description: errText(r), variant: "error" });
    });
  }

  async function runConfirmed() {
    if (!confirm) return;
    const { kind, hook } = confirm;
    if (kind === "rotate") {
      const r = await actions.rotate(hook.id);
      if (!r.ok) return void toast({ title: "کلید تازه ساخته نشد", description: errText(r), variant: "error" });
      if (r.data.secret) setShown({ title: "کلید تازه‌ی وب‌هوک", secret: r.data.secret, previousValidUntil: r.data.previousValidUntil });
      else toast({ title: "کلید قبلاً عوض شده بود", description: "بیزین کلید تکراری را دوباره نشان نمی‌دهد.", variant: "default" });
    } else if (kind === "delete") {
      const r = await actions.remove(hook.id);
      toast(r.ok ? { title: "وب‌هوک حذف شد.", variant: "success" } : { title: "حذف نشد", description: errText(r), variant: "error" });
    } else {
      const r = await actions.setStatus(hook.id, "disabled");
      toast(r.ok ? { title: "وب‌هوک غیرفعال شد.", variant: "success" } : { title: "غیرفعال نشد", description: errText(r), variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {shown && (
        <SecretOnce title={shown.title} value={shown.secret} onDone={() => setShown(null)}>
          <p className="text-sm">
            همین حالا این کلید را در متغیر <code dir="ltr" className="font-mono">BIZIN_WEBHOOK_SECRETS</code> سرور سپردی بگذارید (چند کلید را با ویرگول جدا کنید و کلید تازه را اول بنویسید) و سرویس را دوباره راه بیندازید. تا این کار نشود، رویدادهای بیزین رد می‌شوند.
          </p>
          {shown.previousValidUntil && (
            <p className="text-sm">کلید قبلی تا {formatDateTime(shown.previousValidUntil)} هنوز پذیرفته می‌شود؛ بعد از آن از متغیر حذفش کنید.</p>
          )}
        </SecretOnce>
      )}

      <div>
        <Button size="lg" onClick={() => setCreating(true)} disabled={pending}>
          <Plus strokeWidth={2} />
          وب‌هوک تازه
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <EmptyState title="هنوز وب‌هوکی ساخته نشده است" description="بدون وب‌هوک، پیام‌ها و سفارش‌های تازه فقط با تازه کردن صفحه دیده می‌شوند." />
      ) : (
        <ul className="flex flex-col gap-3">
          {webhooks.map((h) => (
            <li key={h.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <bdi dir="ltr" className="block break-all font-mono text-sm">{h.url}</bdi>
                  {h.description && <p className="mt-1 text-sm text-muted-foreground">{h.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {h.status === "active" ? <Pill tone="success">فعال</Pill> : <Pill tone="danger">غیرفعال{h.disabled_reason ? ` (${label(WEBHOOK_DISABLED_FA, h.disabled_reason)})` : ""}</Pill>}
                    {h.consecutive_failures > 0 && <Pill tone="warning">{fa(h.consecutive_failures)} خطای پشت‌سرهم</Pill>}
                    <span>{h.event_types.map((t) => label(EVENT_TYPE_FA, t)).join("، ")}</span>
                    <span>· آخرین تغییر {formatDateTime(h.updated_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`hook-${h.id}`} className="text-xs text-muted-foreground">فعال</Label>
                  <Switch
                    id={`hook-${h.id}`}
                    checked={h.status === "active"}
                    disabled={pending}
                    onCheckedChange={(on) => (on ? enable(h) : setConfirm({ kind: "disable", hook: h }))}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="outline" size="lg" disabled={pending || h.status !== "active"} onClick={() => ping(h)}>
                  <Send strokeWidth={1.5} />
                  آزمایش
                </Button>
                <Button variant="outline" size="lg" disabled={pending} onClick={() => setConfirm({ kind: "rotate", hook: h })}>
                  <RefreshCw strokeWidth={1.5} />
                  کلید تازه
                </Button>
                <Link href={`/admin/webhooks/${h.id}`} className="inline-flex h-12 items-center gap-1 rounded-control px-4 font-semibold text-brand-ink hover:bg-secondary">
                  تحویل‌ها
                  <ArrowLeft className="size-4" strokeWidth={2} />
                </Link>
                <Button variant="ghost" size="lg" className="ms-auto text-destructive" disabled={pending} onClick={() => setConfirm({ kind: "delete", hook: h })}>
                  <Trash2 strokeWidth={1.5} />
                  حذف
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateWebhookDialog
        open={creating}
        onOpenChange={setCreating}
        defaultUrl={defaultUrl}
        create={actions.create}
        onCreated={(secret) => {
          setCreating(false);
          if (secret) setShown({ title: "وب‌هوک ساخته شد؛ کلید امضا", secret, previousValidUntil: null });
          else toast({ title: "وب‌هوک ساخته شد", description: "این درخواست تکراری بود و بیزین کلید را دوباره نشان نمی‌دهد. اگر کلید را ندارید، «کلید تازه» بزنید.", variant: "default" });
        }}
      />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "delete" ? "وب‌هوک حذف شود؟" : confirm?.kind === "rotate" ? "کلید تازه ساخته شود؟" : "وب‌هوک غیرفعال شود؟"}
        description={
          confirm?.kind === "delete"
            ? "رویدادهای بیزین دیگر به این آدرس فرستاده نمی‌شوند و این کار برگشت ندارد."
            : confirm?.kind === "rotate"
              ? "کلید تازه فقط یک بار نمایش داده می‌شود. کلید قبلی تا مدت کوتاهی هنوز پذیرفته می‌شود تا متغیر سرور را عوض کنید."
              : "تا دوباره فعالش نکنید، رویدادی به این آدرس فرستاده نمی‌شود."
        }
        confirmText={confirm?.kind === "delete" ? "حذف" : confirm?.kind === "rotate" ? "ساخت کلید تازه" : "غیرفعال کن"}
        destructive={confirm?.kind !== "rotate"}
        onConfirm={runConfirmed}
      />
    </div>
  );
}

function CreateWebhookDialog({
  open,
  onOpenChange,
  defaultUrl,
  create,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultUrl: string;
  create: WebhookActions["create"];
  onCreated: (secret: string | null) => void;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [all, setAll] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [description, setDescription] = useState("سایت سپردی");
  const [error, setError] = useState<Extract<ActionResult<unknown>, { ok: false }> | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!all && types.length === 0) {
      setError({ ok: false, message: "دست‌کم یک رویداد را انتخاب کنید." });
      return;
    }
    start(async () => {
      const r = await create({ url, eventTypes: all ? ["*"] : types, description });
      if (r.ok) {
        setError(null);
        onCreated(r.data.secret);
      } else setError(r);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="وب‌هوک تازه"
      description="بیزین رویدادهای فروشگاه‌های سپردی را با امضا به این آدرس می‌فرستد."
      className="max-w-lg"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hook-url">آدرس</Label>
          <Input id="hook-url" dir="ltr" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} error={error?.fields?.url} />
          <p className="text-xs text-muted-foreground">باید https روی پورت ۴۴۳ و دامنه‌ی عمومی باشد.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hook-desc">توضیح</Label>
          <Input id="hook-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">رویدادها</legend>
          <Checkbox checked={all} onCheckedChange={setAll} label="همه‌ی رویدادها" description="رویدادهایی که بیزین بعداً اضافه کند هم می‌رسند. پیشنهاد سپردی همین است." />
          {!all && (
            <div className="grid gap-2 ps-4 sm:grid-cols-2">
              {SPECIFIC_EVENTS.map((t) => (
                <Checkbox
                  key={t}
                  checked={types.includes(t)}
                  onCheckedChange={(on) => setTypes((l) => (on ? [...l, t] : l.filter((x) => x !== t)))}
                  label={label(EVENT_TYPE_FA, t)}
                />
              ))}
            </div>
          )}
        </fieldset>
        {error && (
          <Alert variant="destructive">
            <p>{error.message}</p>
            {error.requestId && <RequestId id={error.requestId} />}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "در حال ساخت…" : "ساخت وب‌هوک"}
          </Button>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
