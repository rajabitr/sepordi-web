"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { CardNumberInput } from "@/components/ui/card-number-input";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cardBank } from "@/lib/persian";
import { en, fa } from "@/lib/utils";

import type { ActionResult } from "../model/result";
import { validateCardToCard, validatePlans, validateSupport, type AdminSettings, type Plan } from "../model/settings";
import { Section } from "../page-parts";

function FieldError({ text }: { text?: string }) {
  return text ? <p className="text-sm text-destructive">{text}</p> : null;
}

export function SettingsForm({ initial, save }: { initial: AdminSettings; save: (s: AdminSettings) => Promise<ActionResult<AdminSettings>> }) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>(initial.plans);
  const [support, setSupport] = useState(initial.support);
  const [card, setCard] = useState(initial.card_to_card);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const setPlan = (i: number, patch: Partial<Plan>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const highlight = (i: number, on: boolean) => setPlans((ps) => ps.map((p, j) => ({ ...p, highlight: j === i ? on : on ? false : p.highlight })));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value: AdminSettings = { plans, support, card_to_card: card };
    const p = validatePlans(value.plans);
    const s = validateSupport(value.support);
    const c = validateCardToCard(value.card_to_card);
    const local = { ...(p.ok ? {} : p.errors), ...(s.ok ? {} : s.errors), ...(c.ok ? {} : c.errors) };
    setErrors(local);
    if (Object.keys(local).length) {
      toast({ title: "چند مورد را باید درست کنید.", variant: "error" });
      return;
    }
    start(async () => {
      const r = await save(value);
      if (r.ok) {
        setPlans(r.data.plans);
        setSupport(r.data.support);
        setCard(r.data.card_to_card);
        setErrors({});
        toast({ title: "تنظیمات ذخیره شد.", variant: "success" });
      } else {
        setErrors(r.fields ?? {});
        toast({ title: "ذخیره نشد", description: r.message, variant: "error" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Section title="طرح‌های اعتبار" description="قیمت خالی یعنی هنوز قیمتی اعلام نشده؛ سایت به‌جای آن «تماس بگیرید» نشان می‌دهد.">
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((p, i) => (
            <fieldset key={p.code} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                {p.highlight && <Star className="size-4 text-brand-ink" strokeWidth={2} />}
                <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">{p.code}</bdi>
              </legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`plan-${p.code}-name`}>نام طرح</Label>
                <Input id={`plan-${p.code}-name`} value={p.name} maxLength={40} onChange={(e) => setPlan(i, { name: e.target.value })} error={errors[`plans.${i}.name`]} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`plan-${p.code}-price`}>قیمت</Label>
                <AmountInput id={`plan-${p.code}-price`} value={p.price_toman} onChange={(v) => setPlan(i, { price_toman: v })} min={0} />
                <FieldError text={errors[`plans.${i}.price_toman`]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`plan-${p.code}-replies`}>پاسخ تقریبی</Label>
                  <Input
                    id={`plan-${p.code}-replies`}
                    dir="ltr"
                    inputMode="numeric"
                    value={fa(p.replies_estimate)}
                    onChange={(e) => setPlan(i, { replies_estimate: Number(en(e.target.value).replace(/\D/g, "") || 0) })}
                    error={errors[`plans.${i}.replies_estimate`]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`plan-${p.code}-discount`}>تخفیف دائمی روی هر پاسخ (٪)</Label>
                  <Input
                    id={`plan-${p.code}-discount`}
                    dir="ltr"
                    inputMode="numeric"
                    value={fa(p.discount_percent)}
                    onChange={(e) => setPlan(i, { discount_percent: Number(en(e.target.value).replace(/\D/g, "").slice(0, 2) || 0) })}
                    error={errors[`plans.${i}.discount_percent`]}
                  />
                </div>
              </div>
              <div className="flex min-h-11 items-center justify-between gap-3">
                <Label htmlFor={`plan-${p.code}-highlight`}>پیشنهاد ویژه در سایت</Label>
                <Switch id={`plan-${p.code}-highlight`} checked={p.highlight} onCheckedChange={(on) => highlight(i, on)} />
              </div>
            </fieldset>
          ))}
        </div>
        {errors["plans.highlight"] && <FieldError text={errors["plans.highlight"]} />}
      </Section>

      <Section title="پشتیبانی" description="در سایت و پنل فروشنده نمایش داده می‌شود؛ هر کدام خالی بماند، پنهان می‌شود.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="support-phone">تلفن</Label>
            <Input id="support-phone" dir="ltr" type="tel" inputMode="tel" placeholder="02112345678" value={support.phone} onChange={(e) => setSupport((s) => ({ ...s, phone: e.target.value }))} error={errors["support.phone"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="support-telegram">تلگرام</Label>
            <Input id="support-telegram" dir="ltr" placeholder="sepordi_support" startAddon="@" value={support.telegram} onChange={(e) => setSupport((s) => ({ ...s, telegram: e.target.value }))} error={errors["support.telegram"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="support-email">ایمیل</Label>
            <Input id="support-email" dir="ltr" type="email" placeholder="support@sepordi.ir" value={support.email} onChange={(e) => setSupport((s) => ({ ...s, email: e.target.value }))} error={errors["support.email"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="support-hours">ساعت پاسخ‌گویی</Label>
            <Input id="support-hours" maxLength={80} value={support.hours} onChange={(e) => setSupport((s) => ({ ...s, hours: e.target.value }))} />
          </div>
        </div>
      </Section>

      <Section title="کارت‌به‌کارت" description="کارتی که فروشنده‌ها برای خرید اعتبار به آن واریز می‌کنند. اگر هر سه خالی بماند، کارت‌به‌کارت در پنل نمایش داده نمی‌شود.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2 sm:max-w-md">
            <Label htmlFor="card-number">شماره‌ی کارت</Label>
            <CardNumberInput
              id="card-number"
              value={card.card_number}
              onChange={(digits, _valid, bank) => setCard((c) => ({ ...c, card_number: digits, bank_name: c.bank_name || (bank ?? "") }))}
            />
            <FieldError text={errors["card_to_card.card_number"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-holder">نام صاحب کارت</Label>
            <Input id="card-holder" maxLength={60} value={card.holder_name} onChange={(e) => setCard((c) => ({ ...c, holder_name: e.target.value }))} error={errors["card_to_card.holder_name"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-bank">بانک</Label>
            <Input id="card-bank" maxLength={40} placeholder={cardBank(card.card_number) ?? "مثلاً ملت"} value={card.bank_name} onChange={(e) => setCard((c) => ({ ...c, bank_name: e.target.value }))} />
          </div>
        </div>
      </Section>

      {Object.keys(errors).length > 0 && <Alert variant="destructive" title="چند مورد را باید درست کنید.">خطای هر فیلد زیر همان فیلد نوشته شده است.</Alert>}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "در حال ذخیره…" : "ذخیره‌ی تنظیمات"}
        </Button>
      </div>
    </form>
  );
}
