"use client";

import * as React from "react";
import { ImageIcon, MessageCircle, ReceiptText, RotateCcw, ShieldCheck } from "lucide-react";

import { LoadingDots } from "@/components/animations/loading-dots";
import { StreamingText } from "@/components/animations/streaming-text";
import { ThinkingStates } from "@/components/animations/thinking-states";
import { formatTomanValue } from "@/lib/money";
import { cn, fa } from "@/lib/utils";

const PRICE = 1_280_000;
const SHIPPING = 90_000;

const Q1 = "سلام، این مانتو سایز ۳۸ مشکی داره؟ قیمتش چنده؟";
const A1 = `سلام، خوش اومدید. مانتو کتان «ترمه» سایز ۳۸ مشکی ${fa(3)} تا موجوده و قیمتش ${formatTomanValue(PRICE)}ه. براتون ثبتش کنم؟`;
const Q2 = "آره لطفاً، تهران هستم.";
const A2 = "پیش‌فاکتورتون آماده‌ست. مبلغ را کارت‌به‌کارت کنید و عکس رسید را همین‌جا بفرستید.";
const A3 = "رسیدتون رسید، ممنون. فروشنده بررسیش می‌کنه و تأیید سفارش را همین‌جا خبر میدیم.";

type Beat =
  | { kind: "customer"; text: string }
  | { kind: "typing" }
  | { kind: "thinking"; states: string[] }
  | { kind: "assistant"; text: string }
  | { kind: "invoice" }
  | { kind: "receipt" }
  | { kind: "notice" };

const SCRIPT: { beat: Beat; ms: number }[] = [
  { beat: { kind: "customer", text: Q1 }, ms: 1200 },
  { beat: { kind: "thinking", states: ["دارم کاتالوگ را می‌گردم…", "موجودی سایز ۳۸ مشکی را چک می‌کنم…"] }, ms: 3200 },
  { beat: { kind: "assistant", text: A1 }, ms: 2600 },
  { beat: { kind: "customer", text: Q2 }, ms: 1200 },
  { beat: { kind: "thinking", states: ["هزینه‌ی ارسال تهران را حساب می‌کنم…"] }, ms: 1800 },
  { beat: { kind: "assistant", text: A2 }, ms: 1600 },
  { beat: { kind: "invoice" }, ms: 2400 },
  { beat: { kind: "typing" }, ms: 1600 },
  { beat: { kind: "receipt" }, ms: 1400 },
  { beat: { kind: "assistant", text: A3 }, ms: 2000 },
  { beat: { kind: "notice" }, ms: 0 },
];

const LAST = SCRIPT.length - 1;
const transient = (b: Beat) => b.kind === "thinking" || b.kind === "typing";

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Bubble({ from, children, muted }: { from: "customer" | "assistant"; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={cn("flex", from === "customer" ? "justify-start" : "justify-end")} style={{ animation: "slide-in 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
      <div
        className={cn(
          "max-w-xs rounded-2xl px-4 py-2 text-sm leading-6",
          from === "customer" && "rounded-ss-md bg-surface-lavender text-surface-lavender-foreground",
          from === "assistant" && (muted ? "rounded-se-md bg-accent text-accent-foreground" : "rounded-se-md bg-primary text-primary-foreground"),
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Invoice() {
  return (
    <div className="flex justify-end" style={{ animation: "slide-in 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
      <div className="w-64 rounded-2xl border border-border bg-card p-4 text-sm shadow-surface">
        <div className="flex items-center gap-2 font-semibold">
          <ReceiptText strokeWidth={2} aria-hidden className="size-4 text-brand-ink" />
          پیش‌فاکتور
        </div>
        <dl className="mt-2 flex flex-col gap-1 text-xs leading-6">
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">مانتو کتان ترمه، ۳۸، مشکی × ۱</dt><dd className="tabular-nums">{formatTomanValue(PRICE)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">ارسال به تهران</dt><dd className="tabular-nums">{formatTomanValue(SHIPPING)}</dd></div>
          <div className="mt-1 flex justify-between gap-2 border-t border-border pt-2 text-sm font-semibold"><dt>جمع کل</dt><dd className="tabular-nums">{formatTomanValue(PRICE + SHIPPING)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

function Receipt() {
  return (
    <div className="flex justify-start" style={{ animation: "slide-in 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
      <div className="flex w-48 flex-col overflow-hidden rounded-2xl rounded-ss-md bg-surface-lavender">
        <div className="flex aspect-video items-center justify-center bg-accent-peach-soft text-accent-peach-ink">
          <ImageIcon strokeWidth={1.5} aria-hidden className="size-8" />
        </div>
        <p className="px-4 py-2 text-xs leading-6 text-surface-lavender-foreground">عکس رسید کارت‌به‌کارت</p>
      </div>
    </div>
  );
}

function Notice() {
  return (
    <div className="flex justify-center" style={{ animation: "slide-in 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-medium leading-8 text-success">
        <ShieldCheck strokeWidth={2} aria-hidden className="size-4" />
        رسید برای بررسی به شما فرستاده شد
      </p>
    </div>
  );
}

/** The hero's DM: plays once when it scrolls into view; reduced motion gets the finished conversation. */
export function ChatDemo() {
  const reduced = React.useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
  const [step, setStep] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    if (reduced || !visible || step >= LAST) return;
    const id = window.setTimeout(() => setStep((s) => s + 1), SCRIPT[step].ms);
    return () => window.clearTimeout(id);
  }, [reduced, visible, step]);

  const shown = reduced ? LAST : step;
  const replay = () => {
    setStep(0);
    setRun((r) => r + 1);
  };

  return (
    <div ref={ref} className="relative w-full max-w-md rounded-3xl border border-border bg-card shadow-overlay">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-accent text-brand-ink">
            <MessageCircle strokeWidth={2} className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-6">فروشگاه نمونه</p>
            <p className="text-xs leading-6 text-muted-foreground">نمونه‌ی گفت‌وگو در دایرکت</p>
          </div>
        </div>
        <button
          type="button"
          onClick={replay}
          disabled={reduced || shown < LAST}
          aria-label="پخش دوباره‌ی گفت‌وگو"
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-0"
        >
          <RotateCcw strokeWidth={1.5} className="size-5" />
        </button>
      </div>

      <p className="sr-only">
        {`مشتری: ${Q1} دستیار: ${A1} مشتری: ${Q2} دستیار: ${A2} پیش‌فاکتور: جمع کل ${formatTomanValue(PRICE + SHIPPING)}. مشتری عکس رسید را می‌فرسته. دستیار: ${A3} رسید برای بررسی به فروشنده فرستاده شد.`}
      </p>

      <div aria-hidden className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-linear-to-b from-card to-transparent" />
        <div className="flex h-120 flex-col justify-end gap-3 overflow-hidden px-4 py-4">
          {SCRIPT.slice(0, shown + 1).map(({ beat }, i) => {
            if (transient(beat) && i < shown) return null;
            const key = `${run}-${i}`;
            switch (beat.kind) {
              case "customer":
                return <Bubble key={key} from="customer">{beat.text}</Bubble>;
              case "typing":
                return <Bubble key={key} from="customer"><LoadingDots label="در حال فرستادن عکس" /></Bubble>;
              case "thinking":
                return (
                  <Bubble key={key} from="assistant" muted>
                    <ThinkingStates states={beat.states} hold={1500} loop={false} />
                  </Bubble>
                );
              case "assistant":
                return (
                  <Bubble key={key} from="assistant">
                    {i === shown && !reduced ? <StreamingText text={beat.text} gap={70} className="leading-6" /> : <p>{beat.text}</p>}
                  </Bubble>
                );
              case "invoice":
                return <Invoice key={key} />;
              case "receipt":
                return <Receipt key={key} />;
              case "notice":
                return <Notice key={key} />;
            }
          })}
        </div>
      </div>
    </div>
  );
}
