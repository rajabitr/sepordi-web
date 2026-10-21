import { isOwnerOnlyHref, type PanelRole } from "@/components/panel/shell/nav";
import type { Ok } from "@/server/bizin/schema";

import type { Loaded } from "./settle";

export type StepState = "done" | "todo" | "unknown";

export interface Step {
  key: string;
  title: string;
  hint: string;
  /** Absent when the viewer cannot open the page: an agent sees the step read-only. */
  href?: string;
  action: string;
  state: StepState;
  error?: string;
}

export interface SetupReads {
  channels: Loaded<Ok<"getTenantChannels">>;
  products: Loaded<Ok<"listProducts">>;
  payment: Loaded<Ok<"getPaymentDetails">>;
  assistant: Loaded<Ok<"getAssistant">>;
}

/** A read that failed is "unknown", never "todo": the seller is not told to redo a step that may be done. */
export function setupSteps({ channels, products, payment, assistant }: SetupReads, role: PanelRole): Step[] {
  const state = <T,>(r: Loaded<T>, done: (d: T) => boolean): StepState => (r.ok ? (done(r.data) ? "done" : "todo") : "unknown");
  const err = (r: Loaded<unknown>) => (r.ok ? undefined : r.message);

  const steps: Step[] = [
    {
      key: "channel",
      title: "کانال وصل است؟",
      hint: "واتس‌اپ، اینستاگرام یا تلگرام فروشگاه را وصل کنید تا پیام‌ها به دستیار برسد.",
      href: "/panel/channels",
      action: "وصل کردن کانال",
      state: state(channels, (d) => d.channels.some((c) => c.status === "connected")),
      error: err(channels),
    },
    {
      key: "product",
      title: "حداقل یک محصول؟",
      hint: "دستیار فقط از روی محصولات شما قیمت و موجودی می‌گوید.",
      href: "/panel/products",
      action: "افزودن محصول",
      state: state(products, (d) => d.products.length > 0),
      error: err(products),
    },
    {
      key: "payment",
      title: "اطلاعات کارت ثبت شده؟",
      hint: "شماره‌ی کارتی که دستیار برای کارت‌به‌کارت به مشتری می‌دهد.",
      href: "/panel/payments",
      action: "ثبت کارت",
      state: state(payment, (d) => d.configured),
      error: err(payment),
    },
    {
      key: "assistant",
      title: "دستیار روشن است؟",
      hint: "دستیار و پاسخ خودکار هر دو باید روشن باشند.",
      href: "/panel/assistant",
      action: "روشن کردن دستیار",
      state: state(assistant, (d) => d.enabled && d.auto_reply),
      error: err(assistant),
    },
    {
      key: "profile",
      title: "معرفی کسب‌وکار نوشته شده؟",
      hint: "ساعت کاری، ارسال، خدمات و شرایط پرداخت را بنویسید تا دستیار کمتر گفت‌وگو را به شما بسپارد.",
      href: "/panel/assistant",
      action: "نوشتن معرفی",
      state: state(assistant, (d) => d.business_profile.trim() !== ""),
      error: err(assistant),
    },
  ];
  if (role === "owner") return steps;
  return steps.map((s) => (s.href && isOwnerOnlyHref(s.href) ? { ...s, href: undefined } : s));
}
