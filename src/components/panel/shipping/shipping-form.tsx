"use client";

import * as React from "react";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";

import { saveShippingAction } from "@/app/panel/shipping/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { AddressPicker } from "@/components/ui/address-picker";
import { Alert } from "@/components/ui/alert";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

import { MAX_FEE_TOMAN, MAX_RATES, toShippingBody, type ShippingFormValue } from "./model";

type Row = ShippingFormValue["rates"][number] & { key: number };

/** Bizin names a failing rate `rates[2].fee`; the form keys fields as `rates.2.fee`. */
const fieldKey = (f?: string) => f?.replace(/\[(\d+)\]/g, ".$1");

/** `readOnly` for a role that may see the rule but not change it (no `shipping.edit`); the action refuses it anyway. */
export function ShippingForm({ initial, readOnly = false }: { initial: ShippingFormValue; readOnly?: boolean }) {
  const { toast } = useToast();
  const next = React.useRef(initial.rates.length);
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [defaultFee, setDefaultFee] = React.useState(initial.default_fee);
  const [freeOver, setFreeOver] = React.useState(initial.free_over);
  const [rows, setRows] = React.useState<Row[]>(initial.rates.map((r, i) => ({ ...r, key: i })));
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null);
  const [pending, start] = React.useTransition();

  const value = (): ShippingFormValue => ({ enabled, default_fee: defaultFee, free_over: freeOver, rates: rows.map((r) => ({ province: r.province, city: r.city, fee: r.fee })) });
  const errFor = (f: string) => (error?.field === f ? error.message : undefined);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function save() {
    const v = value();
    const check = toShippingBody(v);
    if (!check.ok) {
      setError({ field: check.field, message: check.message });
      return;
    }
    setError(null);
    start(async () => {
      const r = await saveShippingAction(v);
      if (r.ok) {
        setEnabled(r.data.enabled);
        setDefaultFee(r.data.default_fee);
        setFreeOver(r.data.free_over);
        next.current = r.data.rates.length;
        setRows(r.data.rates.map((x, i) => ({ ...x, key: i })));
        toast({ title: "قانون ارسال ذخیره شد", variant: "success" });
      } else {
        setError({ field: fieldKey(r.field), message: r.message });
        toast({ title: "ذخیره نشد", description: failureText(r), variant: "error" });
      }
    });
  }

  const shownField = error?.field && (error.field === "enabled" || error.field === "default_fee" || error.field === "free_over" || error.field.startsWith("rates."));

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly) save();
      }}
    >
      {readOnly && (
        <Alert variant="info" title="فقط مشاهده">
          قانون ارسال را فقط مالک فروشگاه می‌تواند تغییر دهد.
        </Alert>
      )}
      <fieldset disabled={readOnly} className="contents">
        <Card>
          <CardHeader>
            <CardTitle>هزینه‌ی ارسال</CardTitle>
            <CardDescription>دستیار هزینه‌ی ارسال سفارش را از همین قانون حساب می‌کند. مبلغ‌ها به تومان است.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <label htmlFor="shipping-enabled" className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block font-medium">محاسبه‌ی خودکار هزینه‌ی ارسال</span>
                <span className="block text-sm text-muted-foreground">خاموش یعنی هزینه‌ی ارسال هر سفارش را خودتان می‌نویسید.</span>
              </span>
              <Switch id="shipping-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </label>
            {errFor("enabled") && <p className="text-sm text-destructive">{errFor("enabled")}</p>}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="هزینه‌ی پیش‌فرض" htmlFor="default-fee" hint="برای هر جایی که نرخ جدا ندارد. خالی یعنی آن سفارش‌ها را خودتان قیمت می‌گذارید.">
                <AmountInput id="default-fee" value={defaultFee} onChange={setDefaultFee} max={MAX_FEE_TOMAN} />
                {errFor("default_fee") && <p className="text-xs text-destructive">{errFor("default_fee")}</p>}
              </Field>
              <Field label="ارسال رایگان از" htmlFor="free-over" hint="خرید از این مبلغ به بالا (بعد از تخفیف) رایگان ارسال می‌شود. خالی یعنی هرگز.">
                <AmountInput id="free-over" value={freeOver} onChange={setFreeOver} min={1} />
                {errFor("free_over") && <p className="text-xs text-destructive">{errFor("free_over")}</p>}
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>نرخ استان‌ها و شهرها</CardTitle>
            <CardDescription>نرخ شهر بر نرخ استان مقدم است؛ شهر را خالی بگذارید تا نرخ برای کل استان باشد.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {rows.length === 0 && (
              <p className="flex items-center gap-2 rounded-control border border-dashed border-border p-4 text-muted-foreground">
                <MapPin className="size-5 shrink-0" strokeWidth={1.5} />
                نرخ جدایی ندارید؛ همه‌جا هزینه‌ی پیش‌فرض حساب می‌شود.
              </p>
            )}
            <ul className="flex flex-col gap-4">
              {rows.map((r, i) => {
                const bad = (f: string) => errFor(`rates.${i}.${f}`);
                const rowError = bad("province") ?? bad("city") ?? bad("fee") ?? errFor(`rates.${i}`);
                return (
                  <li key={r.key} className="flex flex-col gap-3 rounded-control border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-muted-foreground">نرخ {fa(i + 1)}</span>
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11 text-muted-foreground hover:text-destructive"
                          aria-label={`حذف نرخ ${fa(i + 1)}`}
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        >
                          <Trash2 className="size-4" strokeWidth={1.5} />
                        </Button>
                      )}
                    </div>
                    <AddressPicker
                      id={`rate-${r.key}`}
                      value={{ province: r.province, city: r.city }}
                      onChange={(a) => update(r.key, { province: a.province, city: a.city })}
                      labels={{ province: "استان", city: "شهر (اختیاری)" }}
                      invalid={Boolean(bad("province") || bad("city"))}
                    />
                    <Field label="هزینه" htmlFor={`rate-fee-${r.key}`}>
                      <AmountInput id={`rate-fee-${r.key}`} value={r.fee} onChange={(fee) => update(r.key, { fee })} max={MAX_FEE_TOMAN} />
                    </Field>
                    {rowError && <p className="text-sm text-destructive">{rowError}</p>}
                  </li>
                );
              })}
            </ul>
            {!readOnly && (
              <Button
                variant="outline"
                className="h-11 self-start"
                disabled={rows.length >= MAX_RATES}
                onClick={() => setRows((rs) => [...rs, { key: next.current++, province: "", city: "", fee: null }])}
              >
                <Plus className="size-4" strokeWidth={2} />
                افزودن نرخ
              </Button>
            )}
          </CardContent>
        </Card>
      </fieldset>

      {error && !shownField && (
        <Alert variant="destructive" title="ذخیره نشد">
          {error.message}
        </Alert>
      )}

      {!readOnly && (
        <div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner size="sm" className="text-current" /> : <Save className="size-4" strokeWidth={2} />}
            {pending ? "در حال ذخیره…" : "ذخیره‌ی قانون ارسال"}
          </Button>
        </div>
      )}
    </form>
  );
}
