"use client";

import * as React from "react";
import { CreditCard, Landmark, Save, ShieldCheck } from "lucide-react";

import { savePaymentDetailsAction, type PaymentDetailsView } from "@/app/panel/payments/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardNumberInput } from "@/components/ui/card-number-input";
import { IbanInput } from "@/components/ui/iban-input";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { bankLabel, isCardNumber, isIban } from "@/lib/persian";
import { fa } from "@/lib/utils";

const masked = (last4: string | null) => (last4 ? `•••• ${fa(last4)}` : null);

export function PaymentDetailsForm({ saved: initial }: { saved: PaymentDetailsView }) {
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initial);
  const [card, setCard] = React.useState("");
  const [iban, setIban] = React.useState("IR");
  const [holder, setHolder] = React.useState(initial.holder_name);
  const [bank, setBank] = React.useState(initial.bank_name);
  const [bankTouched, setBankTouched] = React.useState(Boolean(initial.bank_name));
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [formKey, setFormKey] = React.useState(0);
  const [pending, start] = React.useTransition();

  const hasIban = iban.length > 2;
  const clearsCard = saved.card_number_last4 !== null && !card;
  const clearsIban = saved.iban_last4 !== null && !hasIban;

  function validate(): boolean {
    if (card && !isCardNumber(card)) return fail("card_number", "شماره‌ی کارت درست نیست؛ ۱۶ رقم روی کارت را دوباره بررسی کنید.");
    if (hasIban && !isIban(iban)) return fail("iban", "شماره‌ی شبا درست نیست؛ IR و ۲۴ رقم بعد از آن را بررسی کنید.");
    if (!card && !hasIban) return fail("card_number", "شماره‌ی کارت یا شبا را وارد کنید.");
    if (!holder.trim()) return fail("holder_name", "نام صاحب حساب را بنویسید.");
    setError(null);
    return true;
  }
  function fail(field: string, message: string) {
    setError({ field, message });
    return false;
  }

  function save() {
    start(async () => {
      const r = await savePaymentDetailsAction({ card_number: card, iban: hasIban ? iban : "", holder_name: holder, bank_name: bank });
      if (r.ok) {
        setSaved(r.data);
        setCard("");
        setIban("IR");
        setFormKey((k) => k + 1);
        toast({ title: "اطلاعات پرداخت ذخیره شد", variant: "success" });
      } else {
        setError({ field: r.field, message: r.message });
        toast({ title: "ذخیره نشد", description: failureText(r), variant: "error" });
      }
    });
  }

  const fieldError = (f: string) => (error?.field === f ? <p className="text-xs text-destructive">{error.message}</p> : null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>کارت ثبت‌شده</CardTitle>
          <CardDescription>دستیار این حساب را برای کارت‌به‌کارت به مشتری می‌دهد. شماره‌ی کامل هیچ‌جا نمایش داده نمی‌شود.</CardDescription>
        </CardHeader>
        <CardContent>
          {saved.configured ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <div>
                  <dt className="text-sm text-muted-foreground">شماره‌ی کارت</dt>
                  <dd dir="ltr" className="text-end font-medium tabular-nums">
                    {masked(saved.card_number_last4) ?? <span dir="rtl">ثبت نشده</span>}
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Landmark className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <div>
                  <dt className="text-sm text-muted-foreground">شماره‌ی شبا</dt>
                  <dd dir="ltr" className="text-end font-medium tabular-nums">
                    {saved.iban_last4 ? `IR •••• ${fa(saved.iban_last4)}` : <span dir="rtl">ثبت نشده</span>}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">صاحب حساب</dt>
                <dd className="font-medium">{saved.holder_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">بانک</dt>
                <dd className="font-medium">{saved.bank_name || "—"}</dd>
              </div>
            </dl>
          ) : (
            <Alert variant="warning" title="هنوز کارتی ثبت نکرده‌اید">
              تا کارت یا شبا ثبت نشود، دستیار نمی‌تواند به مشتری بگوید مبلغ را به کجا واریز کند.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{saved.configured ? "تغییر اطلاعات پرداخت" : "ثبت اطلاعات پرداخت"}</CardTitle>
          <CardDescription>
            {saved.configured
              ? "اطلاعات با هم جایگزین می‌شوند: شماره‌ی کارت و شبا را کامل وارد کنید؛ هر کدام را خالی بگذارید پاک می‌شود."
              : "کارت، شبا یا هر دو را وارد کنید."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            key={formKey}
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!validate()) return;
              if (clearsCard || clearsIban) setConfirm(true);
              else save();
            }}
          >
            <Field label="شماره‌ی کارت" htmlFor="card-number">
              <CardNumberInput
                id="card-number"
                onChange={(digits, _valid, detected) => {
                  setCard(digits);
                  if (detected && !bankTouched) setBank(bankLabel(detected));
                }}
              />
              {fieldError("card_number")}
            </Field>
            <Field label="شماره‌ی شبا" htmlFor="iban">
              <IbanInput id="iban" onChange={(v) => setIban(v)} />
              {fieldError("iban")}
            </Field>
            <Field label="نام صاحب حساب" htmlFor="holder" hint="همان نامی که مشتری بعد از واردکردن شماره‌ی کارت در اپ بانکش می‌بیند.">
              <Input id="holder" value={holder} maxLength={120} onChange={(e) => setHolder(e.target.value)} autoComplete="name" />
              {fieldError("holder_name")}
            </Field>
            <Field label="نام بانک" htmlFor="bank" hint="از روی شماره‌ی کارت پر می‌شود؛ می‌توانید عوضش کنید.">
              <Input
                id="bank"
               
                value={bank}
                maxLength={80}
                onChange={(e) => {
                  setBank(e.target.value);
                  setBankTouched(true);
                }}
              />
            </Field>
            {error && !["card_number", "iban", "holder_name"].includes(error.field ?? "") && <p className="text-sm text-destructive">{error.message}</p>}
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-1 size-4 shrink-0" strokeWidth={1.5} />
              هر رسیدی که مشتری بفرستد را شما تأیید می‌کنید؛ دستیار هیچ پرداختی را خودش تأییدشده حساب نمی‌کند.
            </p>
            <div>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? <Spinner size="sm" className="text-current" /> : <Save className="size-4" strokeWidth={2} />}
                {pending ? "در حال ذخیره…" : "ذخیره‌ی اطلاعات پرداخت"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={clearsCard && clearsIban ? "کارت و شبا پاک شوند؟" : clearsCard ? "شماره‌ی کارت پاک شود؟" : "شماره‌ی شبا پاک شود؟"}
        description="این قسمت را خالی گذاشته‌اید. با ذخیره، مقدار ثبت‌شده‌ی قبلی پاک می‌شود و دستیار دیگر آن را به مشتری نمی‌دهد."
        confirmText="بله، ذخیره کن"
        destructive
        onConfirm={() => {
          setConfirm(false);
          save();
        }}
      />
    </div>
  );
}
