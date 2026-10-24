"use client";

import * as React from "react";
import { Archive, Pencil, Plus, Save } from "lucide-react";

import { archiveResourceAction, saveResourceAction } from "@/app/panel/booking/setup-actions";
import { useIntent } from "@/components/panel/orders/use-intent";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { fa } from "@/lib/utils";
import { RESOURCE_KINDS, type BookingInterval, type BookingResource, type BookingSchedule, type ResourceKind } from "@/server/bizin/booking/types";

import { checkResourceInput } from "./inputs";
import { IntervalsEditor, readRows, rowsFromIntervals, type IntervalRow } from "./intervals-editor";

const KIND_FA: Record<ResourceKind, string> = { person: "پرسنل", room: "اتاق", equipment: "دستگاه", line: "صف" };

interface Draft {
  ext: string | null;
  scheduleExt: string | null;
  title: string;
  kind: ResourceKind;
  capacity: number;
  own: boolean;
  rows: IntervalRow[];
}

/** Staff, rooms and equipment (`PUT/DELETE …/resources`); a resource may keep its own week (`PUT …/schedules`). */
export function ResourcesManager({ resources, schedules, shopHours }: { resources: BookingResource[]; schedules: BookingSchedule[]; shopHours: BookingInterval[] }) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [archiving, setArchiving] = React.useState<BookingResource | null>(null);
  const { begin, run } = useIntent();
  const live = resources.filter((r) => !r.archived_at && !r.is_default);
  const scheduleOf = (r: BookingResource) => schedules.find((s) => s.id === r.schedule_id) ?? null;

  function edit(r: BookingResource | null) {
    const sch = r ? scheduleOf(r) : null;
    setDraft({
      ext: r?.external_id ?? null,
      scheduleExt: sch?.external_id ?? null,
      title: r?.title ?? "",
      kind: r?.kind ?? "person",
      capacity: r?.capacity ?? 1,
      own: Boolean(sch && !sch.is_default),
      rows: rowsFromIntervals(sch && !sch.is_default ? sch.intervals : shopHours),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight">پرسنل و اتاق‌ها</h2>
        <Button className="min-h-11" onClick={() => edit(null)}>
          <Plus className="size-4" strokeWidth={2} />
          افزودن
        </Button>
      </div>
      {live.length === 0 ? (
        <EmptyState className="min-h-48 justify-center" title="هنوز پرسنل یا اتاقی تعریف نشده" description="بدون آن، همه‌ی نوبت‌ها روی کل سالن و ساعات کاری فروشگاه گرفته می‌شوند." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {live.map((r) => {
            const sch = scheduleOf(r);
            return (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{r.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {KIND_FA[r.kind] ?? "سایر"} · ظرفیت هم‌زمان {fa(r.capacity)} · {sch && !sch.is_default ? "ساعات کاری جدا" : "ساعات کاری فروشگاه"}
                  </span>
                  {!r.external_id && <span className="text-xs text-muted-foreground">در پنل بیزین ساخته شده و اینجا فقط دیده می‌شود.</span>}
                </div>
                {r.external_id && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="size-11" aria-label={`ویرایش ${r.title}`} onClick={() => edit(r)}>
                      <Pencil className="size-4" strokeWidth={1.5} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive hover:text-destructive"
                      aria-label={`بایگانی ${r.title}`}
                      onClick={() => {
                        begin();
                        setArchiving(r);
                      }}
                    >
                      <Archive className="size-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {draft && <ResourceSheet key={draft.ext ?? "new"} initial={draft} onClose={() => setDraft(null)} />}

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={archiving ? `«${archiving.title}» بایگانی شود؟` : ""}
        description="نوبت تازه‌ای برای او گرفته نمی‌شود. نوبت‌های آینده‌اش با هشدار «پرسنل بایگانی شد» در فهرست می‌مانند تا جابه‌جا یا لغو شوند."
        confirmText="بایگانی"
        cancelText="منصرف شدم"
        destructive
        onConfirm={async () => {
          const ext = archiving?.external_id;
          if (ext) await run((key) => archiveResourceAction(ext, key), "بایگانی شد");
        }}
      />
    </div>
  );
}

function ResourceSheet({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const [d, setD] = React.useState<Draft>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [tried, setTried] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { begin, run } = useIntent();
  const read = readRows(d.rows);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={d.ext ? "ویرایش" : "پرسنل یا اتاق تازه"} side="start" className="sm:max-w-2xl">
      <div className="flex flex-col gap-4 pb-4">
        <Field label="نام" htmlFor="rs-title">
          <Input id="rs-title" value={d.title} maxLength={60} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="مثلاً: سارا محمدی" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="نوع" htmlFor="rs-kind">
            <Select id="rs-kind" className="min-h-11" options={RESOURCE_KINDS.map((k) => ({ value: k, label: KIND_FA[k] }))} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as ResourceKind })} />
          </Field>
          <Field label="ظرفیت هم‌زمان" hint="چند نوبت در یک زمان؛ برای یک نفر ۱.">
            <NumberField value={d.capacity} min={1} max={50} onChange={(n) => setD({ ...d, capacity: n })} aria-label="ظرفیت هم‌زمان" />
          </Field>
        </div>
        <label className="flex min-h-11 items-center justify-between gap-4">
          <span>
            <span className="font-medium">ساعات کاری جدا</span>
            <span className="block text-xs text-muted-foreground">خاموش باشد، ساعات کاری فروشگاه حساب می‌شود.</span>
          </span>
          <Switch checked={d.own} onCheckedChange={(c) => setD({ ...d, own: c })} aria-label="ساعات کاری جدا" />
        </label>
        {d.own && <IntervalsEditor rows={d.rows} onChange={(rows) => setD({ ...d, rows })} problems={tried ? read.problems : new Map()} />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="min-h-11"
          disabled={saving}
          onClick={async () => {
            setTried(true);
            if (d.own && (read.problems.size > 0 || read.week)) {
              setError(read.week ?? "بازه‌های ساعت کاری را درست کنید.");
              return;
            }
            const input = { title: d.title, kind: d.kind, capacity: d.capacity, ownHours: d.own ? read.intervals : null };
            const checked = checkResourceInput(input);
            if (!checked.ok) {
              setError(checked.message);
              return;
            }
            setError(null);
            setSaving(true);
            begin();
            const r = await run(() => saveResourceAction(d.ext, d.scheduleExt, input), "ذخیره شد");
            setSaving(false);
            if (r.ok) onClose();
          }}
        >
          <Save className="size-4" strokeWidth={2} />
          ذخیره
        </Button>
      </div>
    </Sheet>
  );
}
