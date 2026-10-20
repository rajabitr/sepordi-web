import type { Metadata } from "next";

import { Accordion } from "@/components/ui/accordion";
import { FAQ } from "@/components/marketing/faq-data";
import { faqGraph, JsonLd } from "@/components/marketing/json-ld";
import { CtaBand, LinkButton, PageHeader } from "@/components/marketing/section";
import { pageMetadata } from "@/components/marketing/site";

export const metadata: Metadata = pageMetadata({
  path: "/faq",
  title: "سؤال‌های پرتکرار",
  description: "جواب صادقانه به سؤال‌های فروشنده‌ها درباره‌ی سپردی: اتصال واتس‌اپ و اینستاگرام، قیمت و موجودی، رسید کارت‌به‌کارت، تعرفه و محدودیت‌ها.",
});

export default function FaqPage() {
  return (
    <>
      <PageHeader eyebrow="سؤال‌های پرتکرار" title="قبل از شروع چی باید بدونید؟" description="جواب‌ها کوتاه و صادقانه‌ان؛ چیزی که سپردی نمی‌کنه را هم نوشتیم." />
      <div className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Accordion multiple defaultOpen={[FAQ[0].id]} items={FAQ.map((f) => ({ id: f.id, title: f.question, content: f.answer }))} />
          <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-bold leading-tight">سؤال‌تون این‌جا نبود؟</h2>
            <p className="text-sm leading-6 text-muted-foreground">از راه‌های ارتباطی صفحه‌ی تماس بپرسید؛ خودمون جواب میدیم.</p>
            <LinkButton href="/contact" variant="outline" size="md" arrow>تماس با ما</LinkButton>
          </div>
        </div>
      </div>
      <CtaBand />
      <JsonLd data={faqGraph(FAQ)} />
    </>
  );
}
