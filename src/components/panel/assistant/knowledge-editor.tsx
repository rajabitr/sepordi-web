"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Info, Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { Field, Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { fa, faNumber } from "@/lib/utils";

import { compileKnowledge, profileLength, PROFILE_WARN, type FaqItem, type KnowledgeDraft } from "./knowledge";
import { PROFILE_MAX } from "./limits";

type TextKey = Exclude<keyof KnowledgeDraft, "faq">;

const shopLink = (href: string, label: string) => (
  <Link href={href} className="font-medium text-brand-ink underline underline-offset-4">
    {label}
  </Link>
);

const TEXT_SECTIONS: { key: TextKey; label: string; hint: React.ReactNode; placeholder: string }[] = [
  {
    key: "about",
    label: "درباره‌ی کسب‌وکار",
    hint: "چه می‌فروشید، برای چه کسانی و چه چیزی شما را از بقیه جدا می‌کند. آدرس حضوری و راه تماس هم این‌جا.",
    placeholder: "مثال: پوشاک زنانه‌ی نخی با دوخت خودمان در تهران؛ فروشگاه حضوری نداریم.",
  },
  {
    key: "hours",
    label: "ساعت کاری و پاسخ‌گویی",
    hint: "چه روزها و ساعت‌هایی سفارش می‌گیرید و جواب می‌دهید و چه روزهایی تعطیل‌اید.",
    placeholder: "مثال: شنبه تا پنجشنبه ۱۰ تا ۲۰؛ جمعه‌ها تعطیل‌ایم.",
  },
  {
    key: "shipping",
    label: "ارسال و تحویل",
    hint: <>با چه روشی، چند روزه و به کدام شهرها می‌فرستید. هزینه‌ی ارسال را ننویسید؛ دستیار آن را از صفحه‌ی {shopLink("/panel/shipping", "«ارسال»")} می‌خواند.</>,
    placeholder: "مثال: تهران با پیک همان روز، شهرستان‌ها با پست پیشتاز ۲ تا ۴ روز کاری.",
  },
  {
    key: "payment",
    label: "پرداخت",
    hint: <>با چه روش‌هایی پرداخت می‌شود و سفارش کِی قطعی است. شماره‌ی کارت را ننویسید؛ دستیار آن را از صفحه‌ی {shopLink("/panel/payments", "«پرداخت»")} می‌خواند.</>,
    placeholder: "مثال: کارت‌به‌کارت؛ سفارش بعد از تأیید رسید ارسال می‌شود.",
  },
  {
    key: "warranty",
    label: "ضمانت و خدمات پس از فروش",
    hint: "گارانتی، تعویض، تعمیر و راه پیگیری بعد از خرید. شرایط مرجوعی را در کارت «قانون مرجوعی» همین صفحه بنویسید.",
    placeholder: "مثال: تعویض سایز تا ۷ روز، به شرط سالم بودن برچسب.",
  },
];

const NOTES = {
  key: "notes" as const,
  label: "نکته‌های مهم برای دستیار",
  hint: "مشتری را چطور خطاب کند، چه کلمه‌هایی را به کار نبرد و کنار خرید چه پیشنهادی بدهد.",
  placeholder: "مثال: مشتری را «شما» خطاب کن. با هر مانتو، شال هم‌رنگش را پیشنهاد بده.",
};

export type KnowledgeError = { field?: string; message: string } | null;

/** Remount it (a new `key`) whenever `value` is replaced from outside, so the row ids start over. */
export function KnowledgeEditor({ value, onChange, error }: { value: KnowledgeDraft; onChange: (d: KnowledgeDraft) => void; error: KnowledgeError }) {
  const compiled = compileKnowledge(value);
  const len = profileLength(compiled);
  const nextId = React.useRef(value.faq.length);
  const [ids, setIds] = React.useState(() => value.faq.map((_, i) => i));

  const setText = (key: TextKey, text: string) => onChange({ ...value, [key]: text });
  const setFaq = (faq: FaqItem[], nextIds: number[]) => {
    setIds(nextIds);
    onChange({ ...value, faq });
  };
  const editFaq = (i: number, patch: Partial<FaqItem>) => setFaq(value.faq.map((x, j) => (j === i ? { ...x, ...patch } : x)), ids);
  const move = (i: number, to: number) => {
    const faq = [...value.faq];
    const order = [...ids];
    [faq[i], faq[to]] = [faq[to], faq[i]];
    [order[i], order[to]] = [order[to], order[i]];
    setFaq(faq, order);
  };
  const remove = (i: number) => setFaq(value.faq.filter((_, j) => j !== i), ids.filter((_, j) => j !== i));
  const add = () => setFaq([...value.faq, { q: "", a: "" }], [...ids, nextId.current++]);

  const textField = (s: { key: TextKey; label: string; hint: React.ReactNode; placeholder: string }) => (
    <Field key={s.key} label={s.label} htmlFor={`kb-${s.key}`} hint={s.hint}>
      <Textarea id={`kb-${s.key}`} rows={3} autoResize value={value[s.key]} placeholder={s.placeholder} onChange={(e) => setText(s.key, e.target.value)} />
    </Field>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>دانش‌نامه‌ی دستیار</CardTitle>
        <CardDescription>
          دستیار از روی این بخش‌ها به سؤال‌هایی جواب می‌دهد که در محصولات نیست. هر بخش اختیاری است؛ هر چه کامل‌تر، گفت‌وگوهای کمتری به شما می‌رسد.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="flex gap-2 text-sm text-muted-foreground">
          <Info className="mt-1 size-4 shrink-0" strokeWidth={1.5} />
          <span>قیمت و موجودی را این‌جا ننویسید؛ دستیار آن‌ها را فقط از محصولات می‌خواند.</span>
        </p>

        {TEXT_SECTIONS.map(textField)}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1.5 text-sm font-medium">سؤال‌های پرتکرار</legend>
          <p className="text-sm text-muted-foreground">سؤال‌هایی که مشتری‌ها زیاد می‌پرسند، با جوابی که دوست دارید دستیار بدهد.</p>
          {value.faq.map((item, i) => (
            <div key={ids[i] ?? `extra-${i}`} className="flex flex-col gap-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">سؤال {fa(i + 1)}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-11" aria-label={`بردن سؤال ${fa(i + 1)} به بالا`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`بردن سؤال ${fa(i + 1)} به پایین`}
                    disabled={i === value.faq.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown strokeWidth={2} />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-11 text-destructive" aria-label={`حذف سؤال ${fa(i + 1)}`} onClick={() => remove(i)}>
                    <Trash2 strokeWidth={2} />
                  </Button>
                </div>
              </div>
              <Input aria-label={`متن سؤال ${fa(i + 1)}`} placeholder="مثال: برای شهرستان هم می‌فرستید؟" value={item.q} onChange={(e) => editFaq(i, { q: e.target.value })} />
              <Textarea
                aria-label={`جواب سؤال ${fa(i + 1)}`}
                rows={2}
                autoResize
                placeholder="مثال: بله، به همه‌ی شهرها با پست پیشتاز."
                value={item.a}
                onChange={(e) => editFaq(i, { a: e.target.value.replace(/\n/g, " ") })}
              />
            </div>
          ))}
          <Button variant="outline" className="min-h-11 self-start" onClick={add}>
            <Plus strokeWidth={2} />
            افزودن سؤال
          </Button>
          {error?.field === "faq" && <p className="text-xs text-destructive">{error.message}</p>}
        </fieldset>

        {textField(NOTES)}

        <div className="flex flex-col gap-3">
          <Progress
            value={Math.min(len, PROFILE_MAX)}
            max={PROFILE_MAX}
            label={
              <span className="tabular-nums" aria-live="polite">
                {faNumber(len)} از {faNumber(PROFILE_MAX)} نویسه
              </span>
            }
          />
          {len > PROFILE_MAX ? (
            <Alert variant="destructive" title="متن دانش‌نامه از سقف بیشتر است">
              دستیار حداکثر {faNumber(PROFILE_MAX)} نویسه را می‌خواند. تا {faNumber(len - PROFILE_MAX)} نویسه کوتاه‌ترش نکنید، ذخیره نمی‌شود.
            </Alert>
          ) : len >= PROFILE_WARN ? (
            <Alert variant="warning" title="به سقف متن نزدیک شده‌اید">
              {faNumber(PROFILE_MAX - len)} نویسه جا مانده است. جمله‌های تکراری را کوتاه کنید تا برای نکته‌های بعدی جا بماند.
            </Alert>
          ) : null}
          {error?.field === "business_profile" && len <= PROFILE_MAX && <p className="text-xs text-destructive">{error.message}</p>}
        </div>

        <Collapsible trigger={<span className="inline-flex min-h-11 items-center">دستیار این متن را می‌بیند</span>}>
          <p className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-7">{compiled || "هنوز چیزی ننوشته‌اید."}</p>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
