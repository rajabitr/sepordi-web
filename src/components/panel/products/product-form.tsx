"use client";

import Link from "next/link";
import * as React from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";

import { saveProductAction } from "@/app/panel/products/actions";
import { SuccessCheck } from "@/components/animations/success-check";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

import { RequestId } from "./api-error";
import {
  buildProductPut,
  groupDigits,
  hasErrors,
  LIMITS,
  newProductExt,
  newVariantExt,
  type DraftErrors,
  type ProductDraft,
  type VariantDraft,
} from "./catalog";

let rowSeq = 0;
const nextKey = () => `n${++rowSeq}`;

const emptyVariant = (key: string): VariantDraft => ({ key, ext: null, title: "", price: "", stock: "", unlimited: true });

export const EMPTY_DRAFT: ProductDraft = {
  title: "",
  description: "",
  category: "",
  sku: "",
  active: true,
  variants: [emptyVariant("n0")],
};

/** Server errors that name a field land under that field; the rest go in the form-level alert. */
function serverFieldErrors(draft: ProductDraft, code?: string, field?: string): DraftErrors | null {
  if (code === "sku_taken" || code === "sku_in_use" || field === "sku") return { sku: "محصول دیگری همین کد کالا را دارد." };
  if (code === "title_missing" || field === "title") return { title: "نام محصول را وارد کنید." };
  const m = field?.match(/^variants\[(\d+)\]\.(title|options|price|stock)$/);
  const row = m ? draft.variants[Number(m[1])] : undefined;
  if (m && row) {
    const key = m[2] === "options" ? "title" : (m[2] as "title" | "price" | "stock");
    return { rows: { [row.key]: { [key]: "این مقدار پذیرفته نشد. آن را بررسی کنید." } } };
  }
  return null;
}

export function ProductForm({
  productExt,
  initial,
  panelOnlyVariants = [],
}: {
  /** null for a new product: its id is made on the first save and kept for every retry. */
  productExt: string | null;
  initial: ProductDraft;
  panelOnlyVariants?: string[];
}) {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<ProductDraft>(initial);
  const [errors, setErrors] = React.useState<DraftErrors>({});
  const [formError, setFormError] = React.useState<{ message: string; requestId?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [created, setCreated] = React.useState(false);
  const extRef = React.useRef<string | null>(productExt);
  const formRef = React.useRef<HTMLFormElement>(null);
  const isNew = productExt === null;

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setRow = (key: string, patch: Partial<VariantDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));
  const addRow = () => setDraft((d) => (d.variants.length >= LIMITS.variantsMax ? d : { ...d, variants: [...d.variants, emptyVariant(nextKey())] }));
  const removeRow = (key: string) => setDraft((d) => (d.variants.length <= 1 ? d : { ...d, variants: d.variants.filter((v) => v.key !== key) }));

  function focusFirstError() {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    extRef.current ??= newProductExt();
    const ext = extRef.current;
    const withIds: ProductDraft = { ...draft, variants: draft.variants.map((v) => (v.ext ? v : { ...v, ext: newVariantExt() })) };
    setDraft(withIds);

    const local = buildProductPut(withIds);
    if (!local.body) {
      setErrors(local.errors);
      focusFirstError();
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await saveProductAction(ext, withIds);
      if (res.ok) {
        toast({ variant: "success", title: isNew ? "محصول ساخته شد" : "تغییرات ذخیره شد", description: "دستیار از پیام بعدی همین اطلاعات را می‌گوید." });
        if (isNew) setCreated(true);
        return;
      }
      const fieldErrors = res.errors ?? serverFieldErrors(withIds, res.code, res.field);
      if (fieldErrors && hasErrors(fieldErrors)) {
        setErrors(fieldErrors);
        focusFirstError();
      }
      setFormError({ message: res.message, requestId: res.requestId });
    });
  }

  if (created) {
    return (
      <Card className="mx-auto w-full max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <SuccessCheck size={64} />
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold">«{draft.title.trim()}» ساخته شد</p>
            <p className="text-sm leading-7 text-muted-foreground">از همین حالا دستیار قیمت و موجودی این محصول را به مشتری می‌گوید.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/panel/products" className={buttonVariants({ variant: "brand", className: "min-h-11" })}>
              بازگشت به فهرست
            </Link>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                extRef.current = null;
                setDraft({ ...EMPTY_DRAFT, variants: [emptyVariant(nextKey())] });
                setCreated(false);
              }}
            >
              ساخت محصول دیگر
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const rowErr = errors.rows ?? {};

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>مشخصات محصول</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="نام محصول" htmlFor="p-title" className="sm:col-span-2">
            <Input id="p-title" value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={LIMITS.title} error={errors.title} placeholder="مثلاً: تی‌شرت نخی کلاسیک" autoComplete="off" />
          </Field>
          <Field label="توضیحات" htmlFor="p-desc" hint="جنس، اندازه و هر چیزی که مشتری معمولاً می‌پرسد. دستیار از همین متن جواب می‌دهد." className="sm:col-span-2">
            <Textarea id="p-desc" value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={LIMITS.description} showCount autoResize rows={4} aria-invalid={errors.description ? true : undefined} />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </Field>
          <Field label="دسته" htmlFor="p-cat" hint="برای زیردسته از «>» استفاده کنید: پوشاک > تی‌شرت">
            <Input id="p-cat" value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="مثلاً: پوشاک" autoComplete="off" />
          </Field>
          <Field label="کد کالا (SKU)" htmlFor="p-sku" hint="اختیاری؛ دو محصول نمی‌توانند یک کد داشته باشند.">
            <Input id="p-sku" dir="ltr" value={draft.sku} onChange={(e) => set("sku", e.target.value)} maxLength={LIMITS.sku} error={errors.sku} autoComplete="off" />
          </Field>
          <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 sm:col-span-2">
            <div className="flex flex-col">
              <label htmlFor="p-active" className="text-sm font-medium">
                فعال
              </label>
              <p className="text-xs text-muted-foreground">{draft.active ? "دستیار این محصول را به مشتری پیشنهاد می‌دهد." : "بایگانی است و دستیار آن را پیشنهاد نمی‌دهد."}</p>
            </div>
            <Switch id="p-active" checked={draft.active} onCheckedChange={(v) => set("active", v)} aria-label="فعال بودن محصول" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تنوع‌ها و قیمت</CardTitle>
          <CardDescription className="leading-7">
            محصول ساده یک ردیف بدون نام دارد. برای اندازه یا رنگ، هر حالت را یک ردیف کنید. قیمت به تومان است.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errors.variants && (
            <p className="text-sm text-destructive" role="alert">
              {errors.variants}
            </p>
          )}
          <ol className="flex flex-col gap-3">
            {draft.variants.map((v, i) => {
              const re = rowErr[v.key] ?? {};
              return (
                <li key={v.key} className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-12 md:items-start">
                  <Field label={`نام تنوع ${fa(i + 1)}`} htmlFor={`v-${v.key}-t`} className="md:col-span-4">
                    <Input
                      id={`v-${v.key}-t`}
                      value={v.title}
                      onChange={(e) => setRow(v.key, { title: e.target.value })}
                      maxLength={LIMITS.variantTitle}
                      error={re.title}
                      placeholder={draft.variants.length > 1 ? "مثلاً: سایز M، مشکی" : "برای محصول ساده خالی بگذارید"}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="قیمت" htmlFor={`v-${v.key}-p`} className="md:col-span-3">
                    <Input
                      id={`v-${v.key}-p`}
                      dir="ltr"
                      inputMode="numeric"
                      value={v.price}
                      onChange={(e) => setRow(v.key, { price: e.target.value })}
                      onBlur={(e) => setRow(v.key, { price: groupDigits(e.target.value) })}
                      error={re.price}
                      endAddon="تومان"
                      placeholder="۰"
                      autoComplete="off"
                    />
                  </Field>
                  <div className="flex flex-col gap-1.5 md:col-span-4">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`v-${v.key}-s`} className="text-sm font-medium text-foreground/90">
                        موجودی
                      </label>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        نامحدود
                        <Switch
                          checked={v.unlimited}
                          onCheckedChange={(on) => setRow(v.key, { unlimited: on, stock: on ? "" : v.stock })}
                          aria-label={`موجودی نامحدود برای تنوع ${fa(i + 1)}`}
                        />
                      </span>
                    </div>
                    <Input
                      id={`v-${v.key}-s`}
                      dir="ltr"
                      inputMode="numeric"
                      value={v.unlimited ? "" : v.stock}
                      disabled={v.unlimited}
                      onChange={(e) => setRow(v.key, { stock: e.target.value })}
                      onBlur={(e) => !v.unlimited && setRow(v.key, { stock: groupDigits(e.target.value) })}
                      error={re.stock}
                      endAddon="عدد"
                      placeholder={v.unlimited ? "شمرده نمی‌شود" : "۰"}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex justify-end md:col-span-1 md:pt-7">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive"
                      disabled={draft.variants.length <= 1}
                      onClick={() => removeRow(v.key)}
                      aria-label={`حذف تنوع ${fa(i + 1)}`}
                    >
                      <Trash2 strokeWidth={1.5} aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <Button variant="outline" className="min-h-11 self-start" onClick={addRow} disabled={draft.variants.length >= LIMITS.variantsMax}>
            <Plus strokeWidth={2} aria-hidden />
            افزودن تنوع
          </Button>
          <p className="text-xs leading-6 text-muted-foreground">
            ذخیره، فهرست تنوع‌ها را کامل جایگزین می‌کند: تنوعی که حذف کنید پاک نمی‌شود، غیرفعال می‌شود تا سفارش‌های قبلی سالم بمانند. موجودی با هر ذخیره دقیقاً همین عدد می‌شود؛ اگر در این فاصله فروشی داشته‌اید، صفحه را تازه کنید.
          </p>
          {panelOnlyVariants.length > 0 && (
            <Alert variant="warning" title="تنوع‌های ساخته‌شده در پنل پیشرفته">
              این تنوع‌ها این‌جا قابل ویرایش نیستند و با ذخیره غیرفعال می‌شوند: {panelOnlyVariants.join("، ")}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Alert icon={ImagePlus} title="عکس محصول">
        عکس محصول را از راه ورود اکسل با ستون image_urls اضافه کنید.{" "}
        <Link href="/panel/products/import" className="font-medium text-brand-ink underline underline-offset-4">
          ورود از اکسل
        </Link>
      </Alert>

      {formError && (
        <Alert variant="destructive" title="ذخیره نشد">
          <p className="leading-7">{formError.message}</p>
          {formError.requestId && <RequestId id={formError.requestId} />}
        </Alert>
      )}

      <div className="sticky bottom-20 z-10 flex flex-wrap gap-2 rounded-surface border border-border bg-background/95 p-3 backdrop-blur lg:bottom-4">
        <Button type="submit" variant="brand" size="lg" disabled={pending}>
          {pending ? "در حال ذخیره…" : isNew ? "ساخت محصول" : "ذخیره‌ی تغییرات"}
        </Button>
        <Link href="/panel/products" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          انصراف
        </Link>
      </div>
    </form>
  );
}
