"use client";

import * as React from "react";
import Link from "next/link";
import { Save } from "lucide-react";

import { saveSettingsAction, type SettingsInput } from "@/app/panel/booking/setup-actions";
import { useIntent } from "@/components/panel/orders/use-intent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Label } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fa } from "@/lib/utils";
import type { BookingSettings } from "@/server/bizin/booking/types";

const mins = (m: number) => (m === 0 ? "بدون فاصله" : m < 60 ? `${fa(m)} دقیقه` : m < 1440 ? `${fa(m / 60)} ساعت` : `${fa(m / 1440)} روز`);
const options = (values: number[], current: number) => [...new Set([...values, current])].sort((a, b) => a - b).map((v) => ({ value: String(v), label: mins(v) }));

/** The shop's booking rules (`PUT …/settings`); assistant_enabled is the switch that lets the assistant book in chat. */
export function SettingsForm({ settings }: { settings: BookingSettings }) {
  const [v, setV] = React.useState<SettingsInput>({
    assistantEnabled: settings.assistant_enabled,
    holidaysCloseBooking: settings.holidays_close_booking,
    horizonDays: settings.horizon_days,
    minNoticeMin: settings.min_notice_min,
    slotStepMin: settings.slot_step_min,
    maxPerDay: settings.max_per_day,
    cancelCutoffMin: settings.cancel_cutoff_min,
    paymentWindowMin: settings.payment_window_min,
    paymentInstructions: settings.payment_instructions,
    noShowAfterMin: settings.no_show_after_min,
  });
  const [saving, setSaving] = React.useState(false);
  const { begin, run } = useIntent();
  const set = <K extends keyof SettingsInput>(k: K, value: SettingsInput[K]) => setV((p) => ({ ...p, [k]: value }));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">نوبت‌دهی دستیار در گفت‌وگو</CardTitle>
          <CardDescription>روشن باشد، دستیار خدمت‌هایی را که «در گفت‌وگو پیشنهاد شود» دارند به مشتری پیشنهاد می‌دهد و نوبت می‌گیرد.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex min-h-11 items-center justify-between gap-4">
            <span className="font-medium">دستیار نوبت بگیرد</span>
            <Switch checked={v.assistantEnabled} onCheckedChange={(c) => set("assistantEnabled", c)} aria-label="دستیار نوبت بگیرد" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4">
            <span>
              <span className="font-medium">تعطیلات رسمی نوبت داده نشود</span>
              <span className="block text-xs text-muted-foreground">روزهای تعطیل رسمی تقویم ایران بسته حساب می‌شوند.</span>
            </span>
            <Switch checked={v.holidaysCloseBooking} onCheckedChange={(c) => set("holidaysCloseBooking", c)} aria-label="تعطیلات رسمی نوبت داده نشود" />
          </label>
          <p className="text-xs text-muted-foreground">
            روش تأیید هر نوبت (خودکار، با تأیید شما یا با بیعانه) در هر خدمت جدا تنظیم می‌شود؛ از{" "}
            <Link href="/panel/booking/services" className="text-brand-ink underline">
              خدمات
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">قانون‌های نوبت</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="نوبت تا چند روز آینده" hint={`مشتری تا ${fa(v.horizonDays)} روز بعد نوبت می‌بیند.`}>
            <NumberField value={v.horizonDays} min={1} max={365} onChange={(n) => set("horizonDays", n)} aria-label="نوبت تا چند روز آینده" />
          </Field>
          <Field label="کمترین فاصله تا نوبت" htmlFor="st-notice">
            <Select id="st-notice" className="min-h-11" options={options([0, 30, 60, 120, 240, 720, 1440, 2880], v.minNoticeMin)} value={String(v.minNoticeMin)} onChange={(e) => set("minNoticeMin", Number(e.target.value))} />
          </Field>
          <Field label="فاصله‌ی شروع نوبت‌ها" htmlFor="st-step">
            <Select id="st-step" className="min-h-11" options={options([5, 10, 15, 20, 30, 60], v.slotStepMin)} value={String(v.slotStepMin)} onChange={(e) => set("slotStepMin", Number(e.target.value))} />
          </Field>
          <Field label="سقف نوبت در روز" hint="خالی یعنی بدون سقف.">
            <div className="flex items-center gap-2">
              <NumberField value={v.maxPerDay ?? 0} min={0} max={1000} onChange={(n) => set("maxPerDay", n > 0 ? n : null)} aria-label="سقف نوبت در روز" />
              <span className="text-sm text-muted-foreground">{v.maxPerDay ? `${fa(v.maxPerDay)} نوبت` : "بدون سقف"}</span>
            </div>
          </Field>
          <Field label="مهلت لغو توسط مشتری" htmlFor="st-cancel">
            <Select id="st-cancel" className="min-h-11" options={options([0, 60, 180, 360, 720, 1440, 2880], v.cancelCutoffMin)} value={String(v.cancelCutoffMin)} onChange={(e) => set("cancelCutoffMin", Number(e.target.value))} />
          </Field>
          <Field label="ثبت «نیامد» بعد از شروع" htmlFor="st-noshow">
            <Select id="st-noshow" className="min-h-11" options={options([0, 15, 30, 60, 120], v.noShowAfterMin)} value={String(v.noShowAfterMin)} onChange={(e) => set("noShowAfterMin", Number(e.target.value))} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">بیعانه</CardTitle>
          <CardDescription>برای خدمت‌هایی که با بیعانه تأیید می‌شوند.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="مهلت واریز" htmlFor="st-pay">
            <Select id="st-pay" className="min-h-11" options={options([15, 30, 60, 120, 240, 720, 1440], v.paymentWindowMin)} value={String(v.paymentWindowMin)} onChange={(e) => set("paymentWindowMin", Number(e.target.value))} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-instr">راهنمای واریز برای مشتری</Label>
            <Textarea id="st-instr" value={v.paymentInstructions} maxLength={2000} showCount onChange={(e) => set("paymentInstructions", e.target.value)} placeholder="مثلاً: بیعانه را به کارت سالن واریز کنید و عکس رسید را بفرستید." />
          </div>
        </CardContent>
      </Card>

      <div>
        <Button
          className="min-h-11"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            begin();
            await run(() => saveSettingsAction(v), "تنظیمات نوبت‌دهی ذخیره شد");
            setSaving(false);
          }}
        >
          <Save className="size-4" strokeWidth={2} />
          ذخیره‌ی تنظیمات
        </Button>
      </div>
    </div>
  );
}
