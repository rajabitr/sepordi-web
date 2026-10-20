"use client";

import * as React from "react";
import { Bot, KeyRound, Send } from "lucide-react";

import { connectTelegramAction } from "@/app/panel/channels/actions";
import { RequestId } from "@/components/panel/products/api-error";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

import { isTelegramToken } from "./channel-meta";

const STEPS = [
  { icon: Send, title: "ربات BotFather را باز کنید", body: "در تلگرام BotFather را جست‌وجو کنید؛ کنار نامش تیک آبی دارد." },
  { icon: Bot, title: "ربات تازه بسازید", body: "فرمان /newbot را بفرستید، بعد یک نام و یک نام کاربری که به bot ختم شود برای ربات بنویسید." },
  { icon: KeyRound, title: "توکن را کپی کنید", body: "BotFather یک توکن مثل 123456:ABC… می‌دهد. آن را کامل کپی و این‌جا وارد کنید." },
];

export function TelegramDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [token, setToken] = React.useState("");
  const [error, setError] = React.useState<{ message: string; requestId?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isTelegramToken(token)) {
      setError({ message: "این توکن ربات تلگرام نیست. توکن را کامل از BotFather کپی کنید." });
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await connectTelegramAction(token);
      if (res.ok) {
        setToken("");
        toast({ variant: "success", title: "ربات تلگرام وصل شد", description: "از این لحظه دستیار به پیام‌های ربات جواب می‌دهد." });
        onClose();
      } else setError({ message: res.message, requestId: res.requestId });
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="اتصال ربات تلگرام" description="دستیار از راه ربات تلگرام فروشگاه به مشتری‌ها جواب می‌دهد." className="max-w-lg">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-brand-ink">
                <s.icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div className="flex flex-col">
                <p className="font-medium">
                  {fa(i + 1)}. {s.title}
                </p>
                <p className="text-sm leading-7 text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tg-token">توکن ربات</Label>
          <PasswordInput
            id="tg-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="123456789:AA…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "tg-token-error" : "tg-token-hint"}
           
          />
          {error ? (
            <div id="tg-token-error" className="flex flex-col gap-1">
              <p className="text-xs text-destructive">{error.message}</p>
              {error.requestId && <RequestId id={error.requestId} />}
            </div>
          ) : (
            <p id="tg-token-hint" className="text-xs text-muted-foreground">
              توکن فقط یک بار به سرور دستیار فرستاده می‌شود و هیچ‌جا نمایش داده نمی‌شود.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="brand" size="lg" disabled={pending || !token.trim()}>
            {pending ? "در حال بررسی توکن…" : "اتصال ربات"}
          </Button>
          <Button variant="ghost" size="lg" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
