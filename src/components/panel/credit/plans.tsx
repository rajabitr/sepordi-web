"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Check, Copy, CreditCard, ExternalLink, Sparkles } from "lucide-react";

import { cardToCardAction, startZarinpalAction } from "@/app/panel/credit/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatTomanValue } from "@/lib/money";
import { formatCardNumber } from "@/lib/persian";
import { cn, faNumber, faPercent } from "@/lib/utils";

export interface PlanView {
  code: string;
  name: string;
  price_toman: number | null;
  /** null: not purchasable (free, or «به‌زودی»). */
  payable_toman: number | null;
  replies_estimate: number;
  discount_percent: number;
  highlight: boolean;
}

export interface CardDestination {
  card_number: string;
  holder_name: string;
  bank_name: string;
}

export function Plans({ plans, gateway, card }: { plans: PlanView[]; gateway: boolean; card: CardDestination | null }) {
  const [buying, setBuying] = React.useState<PlanView | null>(null);
  const canBuy = gateway || card !== null;

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const free = p.price_toman === 0;
          const soon = p.price_toman === null;
          return (
            <li
              key={p.code}
              className={cn("relative flex flex-col gap-4 rounded-surface border bg-card p-5", p.highlight ? "border-brand shadow-surface" : "border-border")}
            >
              {p.highlight && (
                <Badge variant="brand" className="absolute -top-3 start-4 bg-card">
                  <Sparkles className="size-3.5" strokeWidth={2} />
                  پیشنهاد ما
                </Badge>
              )}
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold leading-tight">{p.name}</h3>
                <p className="text-sm text-muted-foreground">حدود {faNumber(p.replies_estimate)} پاسخ خودکار</p>
              </div>
              <div className="min-h-16">
                {soon ? (
                  <p className="text-xl font-bold">به‌زودی</p>
                ) : free ? (
                  <p className="text-xl font-bold">رایگان</p>
                ) : (
                  <p className="text-xl font-bold">{p.payable_toman !== null ? formatTomanValue(p.payable_toman) : "—"}</p>
                )}
                {p.discount_percent > 0 && (
                  <Badge variant="success" className="mt-2">
                    {faPercent(p.discount_percent)} تخفیف دائمی روی هر پاسخ
                  </Badge>
                )}
              </div>
              <div className="mt-auto">
                {p.payable_toman !== null ? (
                  <Button variant={p.highlight ? "default" : "outline"} className="h-11 w-full" disabled={!canBuy} onClick={() => setBuying(p)}>
                    خرید
                  </Button>
                ) : (
                  <p className="flex min-h-11 items-center text-sm text-muted-foreground">{soon ? "هنوز فروش این بسته شروع نشده است." : "بسته‌ی شروع؛ خریدنی نیست."}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!canBuy && <p className="text-sm text-muted-foreground">خرید فعلاً ممکن نیست؛ برای شارژ با پشتیبانی تماس بگیرید.</p>}
      {buying && <BuyDialog plan={buying} gateway={gateway} card={card} onClose={() => setBuying(null)} />}
    </>
  );
}

function BuyDialog({ plan, gateway, card, onClose }: { plan: PlanView; gateway: boolean; card: CardDestination | null; onClose: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const [method, setMethod] = React.useState<"zarinpal" | "card">(gateway ? "zarinpal" : "card");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [pending, start] = React.useTransition();
  const amount = plan.payable_toman ?? 0;

  function pay() {
    setError(null);
    start(async () => {
      const r = await startZarinpalAction(plan.code);
      if (r.ok) window.location.assign(r.data.url);
      else setError(failureText(r));
    });
  }

  function submitReference() {
    setError(null);
    start(async () => {
      const r = await cardToCardAction(plan.code, reference);
      if (r.ok) {
        toast({ title: "درخواست شارژ ثبت شد", description: "پشتیبانی واریز را بررسی می‌کند و اعتبار را شارژ می‌کند.", variant: "success" });
        onClose();
        router.refresh();
      } else setError(failureText(r));
    });
  }

  async function copy() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.card_number.replace(/\D/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "کپی نشد؛ شماره را دستی بنویسید.", variant: "error" });
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={`خرید بسته‌ی ${plan.name}`}
      description={`مبلغ قابل پرداخت: ${formatTomanValue(amount)}`}
      className="max-w-md"
    >
      <div className="flex flex-col gap-5">
        {gateway && card && (
          <SegmentedControl
            aria-label="روش پرداخت"
            fullWidth
            value={method}
            onChange={(v) => {
              setMethod(v === "card" ? "card" : "zarinpal");
              setError(null);
            }}
            options={[
              { value: "zarinpal", label: "پرداخت آنلاین" },
              { value: "card", label: "کارت‌به‌کارت" },
            ]}
          />
        )}

        {method === "zarinpal" ? (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground">به درگاه امن زرین‌پال می‌روید و با هر کارت عضو شتاب پرداخت می‌کنید. بعد از پرداخت به همین صفحه برمی‌گردید.</p>
            <Button size="lg" className="w-full" disabled={pending} onClick={pay}>
              {pending ? <Spinner size="sm" className="text-current" /> : <ExternalLink className="size-4" strokeWidth={2} />}
              {pending ? "در حال اتصال به درگاه…" : `پرداخت ${formatTomanValue(amount)}`}
            </Button>
          </div>
        ) : card ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitReference();
            }}
          >
            <div className="flex flex-col gap-3 rounded-control border border-border bg-secondary/40 p-4">
              <p className="text-sm text-muted-foreground">۱. مبلغ {formatTomanValue(amount)} را به این کارت واریز کنید:</p>
              <div className="flex items-center justify-between gap-2">
                <span dir="ltr" className="flex items-center gap-2 text-lg font-semibold tabular-nums">
                  <CreditCard className="size-5 text-muted-foreground" strokeWidth={1.5} />
                  {formatCardNumber(card.card_number)}
                </span>
                <Button variant="ghost" size="icon" className="size-11" aria-label="کپی شماره‌ی کارت" onClick={copy}>
                  {copied ? <Check className="size-4 text-success" strokeWidth={2} /> : <Copy className="size-4" strokeWidth={1.5} />}
                </Button>
              </div>
              <p className="text-sm">
                به نام {card.holder_name}
                {card.bank_name && `، ${card.bank_name}`}
              </p>
            </div>
            <Field label="۲. شماره‌ی پیگیری واریز" htmlFor="transfer-ref" hint="در رسید اپ بانک یا پیامک واریز آمده است.">
              <Input
                id="transfer-ref"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
               
                value={reference}
                maxLength={48}
                onChange={(e) => setReference(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={pending || reference.trim().length < 4}>
              {pending && <Spinner size="sm" className="text-current" />}
              {pending ? "در حال ثبت…" : "ثبت درخواست شارژ"}
            </Button>
            <p className="text-sm text-muted-foreground">بعد از بررسی واریز، پشتیبانی اعتبار را شارژ می‌کند؛ وضعیت را در فهرست خریدها می‌بینید.</p>
          </form>
        ) : null}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
