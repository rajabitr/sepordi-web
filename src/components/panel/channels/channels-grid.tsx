"use client";

import * as React from "react";
import { Camera, MessageCircle, Send, Unplug, type LucideIcon } from "lucide-react";

import { connectInstagramAction, disconnectChannelAction, type ChannelActionFailure } from "@/app/panel/channels/actions";
import { RequestId } from "@/components/panel/products/api-error";
import { jalaliDateTime } from "@/components/panel/products/format";
import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

import {
  CHANNEL_LABEL,
  CHANNEL_ORDER,
  HEALTH_LABEL,
  HEALTH_VARIANT,
  healthReasonFa,
  LOGGED_OUT_NOTE,
  STATUS_LABEL,
  STATUS_VARIANT,
  type ChannelKind,
  type ChannelView,
} from "./channel-meta";
import { TelegramDialog } from "./telegram-dialog";
import { WhatsAppDialog } from "./whatsapp-dialog";

const ICON: Record<ChannelKind, LucideIcon> = { whatsapp: MessageCircle, telegram: Send, instagram: Camera };

const INTRO: Record<ChannelKind, string> = {
  whatsapp: "شماره‌ی واتس‌اپ فروشگاه را با اسکن یک کد QR وصل کنید. اتصال به‌صورت دستگاه متصل است، نه API رسمی واتس‌اپ.",
  telegram: "ربات تلگرام فروشگاه را با توکنی که BotFather می‌دهد وصل کنید.",
  instagram: "حساب حرفه‌ای اینستاگرام را با ورود به اینستاگرام وصل کنید. تا پایان بررسی برنامه در متا، اینستاگرام به‌تدریج باز می‌شود و فعلاً فقط حساب‌های آزمایشی وصل می‌شوند.",
};

function AccountRow({
  c,
  onDisconnect,
  onResume,
}: {
  c: ChannelView;
  onDisconnect: (c: ChannelView) => void;
  onResume: (c: ChannelView) => void;
}) {
  const reason = c.health ? healthReasonFa(c.health.reason) : "";
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={STATUS_VARIANT[c.status]} className="gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-current" />
            {STATUS_LABEL[c.status]}
          </Badge>
          {c.status === "connected" && c.health && (
            <Badge variant={HEALTH_VARIANT[c.health.state]}>وضعیت دریافت: {HEALTH_LABEL[c.health.state]}</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {c.kind === "whatsapp" && c.status === "pairing" && (
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => onResume(c)}>
              ادامه‌ی اتصال
            </Button>
          )}
          <Button variant="ghost" size="sm" className="min-h-11 text-destructive" onClick={() => onDisconnect(c)}>
            <Unplug strokeWidth={1.5} aria-hidden />
            {c.status === "connected" ? "جدا کردن" : "حذف"}
          </Button>
        </div>
      </div>
      {c.connected_at && <p className="text-xs text-muted-foreground">وصل‌شده از {jalaliDateTime(c.connected_at)}</p>}
      {reason && <p className="text-sm leading-7 text-foreground/80">{reason}</p>}
    </li>
  );
}

function InstagramConnect({ hasConnected }: { hasConnected: boolean }) {
  const [state, formAction, pending] = React.useActionState<ChannelActionFailure | null>(async () => connectInstagramAction(), null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Button type="submit" variant="brand" size="lg" className="self-start" disabled={pending || hasConnected}>
        {pending ? "در حال رفتن به اینستاگرام…" : "اتصال اینستاگرام"}
      </Button>
      {hasConnected && <p className="text-xs text-muted-foreground">برای وصل کردن حساب دیگر، اول حساب فعلی را جدا کنید.</p>}
      {state && !state.ok && (
        <div className="flex flex-col gap-1" role="alert">
          <p className="text-sm text-destructive">{state.message}</p>
          {state.requestId && <RequestId id={state.requestId} />}
        </div>
      )}
    </form>
  );
}

export function ChannelsGrid({ channels }: { channels: ChannelView[] }) {
  const { toast } = useToast();
  const [whatsApp, setWhatsApp] = React.useState<{ resume: string | null } | null>(null);
  const [telegram, setTelegram] = React.useState(false);
  const [removing, setRemoving] = React.useState<ChannelView | null>(null);

  async function disconnect() {
    if (!removing) return;
    const res = await disconnectChannelAction(removing.channel_id);
    if (res.ok) toast({ variant: "success", title: `${CHANNEL_LABEL[removing.kind]} جدا شد`, description: "دستیار دیگر به پیام‌های این حساب جواب نمی‌دهد." });
    else toast({ variant: "error", title: "جدا کردن انجام نشد", description: res.requestId ? `${res.message} (کد پیگیری: ${res.requestId})` : res.message, duration: 8000 });
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {CHANNEL_ORDER.map((kind) => {
          const accounts = channels.filter((c) => c.kind === kind);
          const Icon = ICON[kind];
          const connected = accounts.some((c) => c.status === "connected");
          const pairing = accounts.some((c) => c.status === "pairing");
          return (
            <Card key={kind} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-brand-ink">
                    <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <CardTitle>{CHANNEL_LABEL[kind]}</CardTitle>
                </div>
                <CardDescription className="leading-7">{INTRO[kind]}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                {accounts.some((c) => c.status === "banned") && (
                  <Alert variant="warning" title={LOGGED_OUT_NOTE[kind].title}>
                    {LOGGED_OUT_NOTE[kind].body}
                  </Alert>
                )}
                {accounts.length > 0 ? (
                  <ul className="flex flex-col gap-3" aria-label={`حساب‌های ${CHANNEL_LABEL[kind]}`}>
                    {accounts.map((c) => (
                      <AccountRow key={c.channel_id} c={c} onDisconnect={setRemoving} onResume={(x) => setWhatsApp({ resume: x.channel_id })} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">هنوز وصل نشده است.</p>
                )}
                <div className="mt-auto">
                  {kind === "whatsapp" && (
                    <Button variant={connected ? "outline" : "brand"} size="lg" onClick={() => setWhatsApp({ resume: null })} disabled={pairing}>
                      {connected ? "افزودن شماره‌ی دیگر" : "اتصال واتس‌اپ"}
                    </Button>
                  )}
                  {kind === "whatsapp" && pairing && <p className="mt-2 text-xs text-muted-foreground">یک اتصال نیمه‌کاره دارید؛ «ادامه‌ی اتصال» را بزنید.</p>}
                  {kind === "telegram" && (
                    <Button variant={connected ? "outline" : "brand"} size="lg" onClick={() => setTelegram(true)}>
                      {connected ? "افزودن ربات دیگر" : "اتصال تلگرام"}
                    </Button>
                  )}
                  {kind === "instagram" && <InstagramConnect hasConnected={connected} />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {whatsApp && <WhatsAppDialog channelId={whatsApp.resume} onClose={() => setWhatsApp(null)} />}
      {telegram && <TelegramDialog onClose={() => setTelegram(false)} />}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `${CHANNEL_LABEL[removing.kind]} جدا شود؟` : ""}
        description="این کار حساب را از فروشگاه حذف می‌کند: دستیار دیگر به پیام‌های آن جواب نمی‌دهد و برای استفاده‌ی دوباره باید از اول وصلش کنید."
        confirmText="جدا کن"
        destructive
        onConfirm={disconnect}
      />
    </>
  );
}
