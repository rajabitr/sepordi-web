"use client";

import * as React from "react";
import { CalendarOff, CalendarPlus, Plus, Trash2, Undo2 } from "lucide-react";

import { clearDayOverrideAction, createExceptionAction, deleteExceptionAction, setDayOverrideAction, type ExceptionInput } from "@/app/panel/booking/setup-actions";
import { pickedDay } from "@/components/panel/orders/model";
import { useIntent } from "@/components/panel/orders/use-intent";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { formatDateWithWeekday } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { BookingDay, BookingException, BookingResource, BookingService, ExceptionKind } from "@/server/bizin/booking/types";

import { hmToMin, minLabel, rowToInterval } from "./model";

const civil = (day: string) => formatDateWithWeekday(`${day}T09:00:00Z`);
const KIND_FA: Record<ExceptionKind, string> = { closed: "تعطیل", open: "باز", hours: "ساعت ویژه", block: "بسته از ساعت" };

function dayLine(d: BookingDay): { label: string; tone: "success" | "secondary" | "warning" } {
  const holiday = d.reasons.find((r) => r.code === "holiday");
  const override = d.reasons.find((r) => r.code === "override_open" || r.code === "override_closed");
  if (override?.code === "override_closed") return { label: override.note ? `تعطیلی شما: ${override.note}` : "تعطیلی شما", tone: "warning" };
  if (override?.code === "override_open") return { label: holiday ? `باز با وجود تعطیلی ${holiday.title_fa ?? ""}`.trim() : "باز به‌خواست شما", tone: "success" };
  if (holiday) return { label: `تعطیل رسمی: ${holiday.title_fa ?? ""}`.trim(), tone: "secondary" };
  if (d.weekend) return { label: "تعطیل آخر هفته", tone: "secondary" };
  if (d.status === "half_day") return { label: "نیمه‌تعطیل", tone: "secondary" };
  return { label: "باز", tone: "success" };
}

/** Holidays and day states (`GET …/days`), whole-day closures (`…/day-overrides`) and one-day exceptions (`…/exceptions`). */
export function ExceptionsManager({
  days,
  exceptions,
  services,
  resources,
}: {
  days: BookingDay[];
  exceptions: BookingException[];
  services: BookingService[];
  resources: BookingResource[];
}) {
  const [closing, setClosing] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<BookingException | null>(null);
  const { begin, run } = useIntent();
  const svcTitle = Object.fromEntries(services.map((s) => [s.id, s.title]));
  const resTitle = Object.fromEntries(resources.map((r) => [r.id, r.title]));
  const special = days.filter((d) => d.status !== "open" || d.reasons.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="روزهای تعطیل و ویژه" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold leading-tight">روزها</h2>
        {special.length === 0 ? (
          <p className="text-sm text-muted-foreground">در این بازه همه‌ی روزها طبق ساعات کاری باز است.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {special.map((d) => {
              const line = dayLine(d);
              const overridden = d.reasons.some((r) => r.code === "override_open" || r.code === "override_closed");
              return (
                <li key={d.date} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{civil(d.date)}</span>
                    <Badge variant={line.tone}>{line.label}</Badge>
                  </div>
                  {overridden ? (
                    <Button variant="ghost" className="min-h-11" onClick={async () => {
                      begin();
                      await run((key) => clearDayOverrideAction(d.date, key), "تغییر این روز برداشته شد");
                    }}>
                      <Undo2 className="size-4" strokeWidth={1.5} />
                      برگرداندن به حالت عادی
                    </Button>
                  ) : d.status === "closed" ? (
                    <Button variant="outline" className="min-h-11" onClick={async () => {
                      begin();
                      await run(() => setDayOverrideAction(d.date, "open", ""), "این روز برای نوبت باز شد");
                    }}>
                      <CalendarPlus className="size-4" strokeWidth={1.5} />
                      باز کردن این روز
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div>
          <Button variant="outline" className="min-h-11" onClick={() => { setNote(""); setClosing(""); }}>
            <CalendarOff className="size-4" strokeWidth={1.5} />
            تعطیل کردن یک روز
          </Button>
        </div>
      </section>

      <section aria-label="استثناها" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold leading-tight">استثناهای یک روز</h2>
          <Button className="min-h-11" onClick={() => setAdding(true)}>
            <Plus className="size-4" strokeWidth={2} />
            استثنای تازه
          </Button>
        </div>
        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">استثنایی ثبت نشده؛ مثلاً «سارا پنجشنبه ساعت ۱۳ تا ۱۴ نیست».</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {exceptions.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium">
                    {civil(x.on_date)} · {KIND_FA[x.kind] ?? "سایر"}
                    {x.start_min !== null && x.end_min !== null ? ` ${minLabel(x.start_min)} تا ${minLabel(x.end_min)}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {x.service_id ? `خدمت: ${svcTitle[x.service_id] ?? "—"}` : x.resource_id ? `پرسنل: ${resTitle[x.resource_id] ?? "—"}` : "کل فروشگاه"}
                    {x.note ? ` · ${x.note}` : ""}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="size-11 text-destructive hover:text-destructive" aria-label="حذف استثنا" onClick={() => { begin(); setRemoving(x); }}>
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {closing !== null && (
        <Dialog
          open
          onOpenChange={(o) => !o && setClosing(null)}
          title="تعطیل کردن یک روز"
          description="در این روز هیچ نوبتی گرفته نمی‌شود. نوبت‌هایی که از قبل گرفته شده، با هشدار در فهرست می‌آیند."
          footer={
            <>
              <Button variant="ghost" className="min-h-11" onClick={() => setClosing(null)}>منصرف شدم</Button>
              <Button className="min-h-11" disabled={!closing} onClick={async () => {
                begin();
                const r = await run(() => setDayOverrideAction(closing, "closed", note), "این روز تعطیل شد");
                if (r.ok) setClosing(null);
              }}>تعطیل شود</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="روز">
              <DatePicker value={closing ? new Date(`${closing}T12:00:00`) : null} onChange={(d) => setClosing(d ? pickedDay(d) : "")} />
            </Field>
            <Field label="یادداشت (اختیاری)" htmlFor="ov-note">
              <Input id="ov-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: تعمیرات سالن" />
            </Field>
          </div>
        </Dialog>
      )}

      {adding && <ExceptionDialog services={services} resources={resources} onClose={() => setAdding(false)} />}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="این استثنا حذف شود؟"
        description={removing ? `${civil(removing.on_date)} دوباره طبق ساعات کاری حساب می‌شود.` : undefined}
        confirmText="حذف"
        cancelText="منصرف شدم"
        destructive
        onConfirm={async () => {
          const id = removing?.id;
          if (id) await run((key) => deleteExceptionAction(id, key), "استثنا حذف شد");
        }}
      />
    </div>
  );
}

function ExceptionDialog({ services, resources, onClose }: { services: BookingService[]; resources: BookingResource[]; onClose: () => void }) {
  const [day, setDay] = React.useState<string>("");
  const [kind, setKind] = React.useState<ExceptionKind>("block");
  const [scope, setScope] = React.useState<string>("");
  const [start, setStart] = React.useState<string | null>("13:00");
  const [end, setEnd] = React.useState<string | null>("14:00");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { begin, run } = useIntent();
  const timed = kind === "hours" || kind === "block";
  const scopeOptions = [
    ...(timed ? [{ value: "", label: "کل فروشگاه" }] : [{ value: "", label: "انتخاب کنید" }]),
    ...resources.map((r) => ({ value: `r:${r.id}`, label: `پرسنل: ${r.title}` })),
    ...services.map((s) => ({ value: `s:${s.id}`, label: `خدمت: ${s.title}` })),
  ];

  async function save() {
    if (!day) return setError("روز را انتخاب کنید.");
    if (!timed && !scope) return setError("برای تعطیل یا باز کردن، پرسنل یا خدمت را انتخاب کنید؛ کل فروشگاه از «تعطیل کردن یک روز» است.");
    let startMin: number | null = null;
    let endMin: number | null = null;
    if (timed) {
      const iv = start && end ? rowToInterval(0, start, end) : null;
      if (!iv || hmToMin(start!) === null) return setError("ساعت شروع و پایان را کامل کنید.");
      startMin = iv.start_min;
      endMin = iv.end_min;
    }
    const input: ExceptionInput = {
      onDate: day,
      kind,
      startMin,
      endMin,
      serviceId: scope.startsWith("s:") ? scope.slice(2) : null,
      resourceId: scope.startsWith("r:") ? scope.slice(2) : null,
      note,
    };
    setError(null);
    begin();
    const r = await run((key) => createExceptionAction(input, key), "استثنا ثبت شد");
    if (r.ok) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="استثنای تازه"
      description="برای یک روز: ساعت ویژه، بستن چند ساعت، یا تعطیل یا باز کردن یک پرسنل یا یک خدمت."
      footer={
        <>
          <Button variant="ghost" className="min-h-11" onClick={onClose}>منصرف شدم</Button>
          <Button className="min-h-11" onClick={save}>ثبت استثنا</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="روز">
          <DatePicker value={day ? new Date(`${day}T12:00:00`) : null} onChange={(d) => setDay(d ? pickedDay(d) : "")} />
        </Field>
        <Field label="نوع" htmlFor="ex-kind">
          <Select id="ex-kind" className="min-h-11" options={(["block", "hours", "closed", "open"] as const).map((k) => ({ value: k, label: KIND_FA[k] }))} value={kind} onChange={(e) => setKind(e.target.value as ExceptionKind)} />
        </Field>
        <Field label="برای" htmlFor="ex-scope">
          <Select id="ex-scope" className="min-h-11" options={scopeOptions} value={scope} onChange={(e) => setScope(e.target.value)} />
        </Field>
        {timed && (
          <div className={cn("flex flex-wrap items-end gap-2")}>
            <Field label="از ساعت"><TimePicker value={start} onChange={setStart} step={15} clearable={false} className="w-32" /></Field>
            <Field label="تا ساعت"><TimePicker value={end} onChange={setEnd} step={15} clearable={false} className="w-32" /></Field>
          </div>
        )}
        <Field label="یادداشت (اختیاری)" htmlFor="ex-note">
          <Input id="ex-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Dialog>
  );
}
