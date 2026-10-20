"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toDataURL } from "qrcode";
import { Link2, MessageCircle, QrCode, Smartphone } from "lucide-react";

import { restartWhatsAppAction, startWhatsAppAction } from "@/app/panel/channels/actions";
import { SuccessCheck } from "@/components/animations/success-check";
import { RequestId } from "@/components/panel/products/api-error";
import { fetchJson } from "@/components/panel/products/fetch-json";
import { useVisibleInterval } from "@/components/panel/products/use-visible-interval";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

import { PAIRING_POLL_MS, pairingNext, type PairingStatus } from "./channel-meta";

type Phase = "starting" | "waiting" | "connected" | "restart" | "timeout" | "error";

const STEPS = [
  { icon: MessageCircle, title: "واتس‌اپ را باز کنید", body: "روی گوشی‌ای که شماره‌ی فروشگاه در آن است." },
  { icon: Smartphone, title: "دستگاه‌های متصل", body: "در اندروید از منوی ⋮ و در آیفون از «تنظیمات»، «دستگاه‌های متصل» را بزنید." },
  { icon: Link2, title: "اتصال دستگاه", body: "«اتصال دستگاه» را بزنید و دوربین گوشی را روی کد روبه‌رو بگیرید." },
];

export function WhatsAppDialog({ channelId: resumeId, onClose }: { channelId: string | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = React.useState<Phase>(resumeId ? "waiting" : "starting");
  const [channelId, setChannelId] = React.useState<string | null>(resumeId);
  const [qr, setQr] = React.useState<string | null>(null);
  const [drawn, setDrawn] = React.useState<{ qr: string; url: string } | null>(null);
  const qrImage = qr && drawn?.qr === qr ? drawn.url : null;
  const [lastStatus, setLastStatus] = React.useState<PairingStatus | null>(null);
  const [error, setError] = React.useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const startedAt = React.useRef(0);
  const started = React.useRef(false);

  const begin = React.useCallback((id: string) => {
    startedAt.current = Date.now();
    setChannelId(id);
    setQr(null);
    setError(null);
    setPhase("waiting");
  }, []);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    startedAt.current = Date.now();
    if (resumeId) return;
    void startWhatsAppAction().then((res) => {
      if (res.ok) begin(res.channelId);
      else {
        setError({ message: res.message, requestId: res.requestId });
        setPhase("error");
      }
    });
  }, [resumeId, begin]);

  React.useEffect(() => {
    if (!qr) return;
    let live = true;
    toDataURL(qr, { errorCorrectionLevel: "M", margin: 1, width: 512 })
      .then((url) => live && setDrawn({ qr, url }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [qr]);

  useVisibleInterval(
    async () => {
      if (!channelId) return;
      const res = await fetchJson<{ status: PairingStatus; qr: string | null; expires_at: string | null }>(
        `/panel/channels/whatsapp/${encodeURIComponent(channelId)}/pairing`,
      );
      if (!res.ok) {
        setError({ message: res.message, requestId: res.requestId });
        setPhase("error");
        return;
      }
      setLastStatus(res.data.status);
      setQr(res.data.qr);
      const next = pairingNext(res.data.status, Date.now() - startedAt.current);
      if (next === "connected") {
        setPhase("connected");
        toast({ variant: "success", title: "واتس‌اپ وصل شد", description: "از این لحظه دستیار به پیام‌های مشتریان این شماره جواب می‌دهد." });
        router.refresh();
      } else if (next === "restart") setPhase("restart");
      else if (next === "timeout") setPhase("timeout");
    },
    PAIRING_POLL_MS,
    phase === "waiting" && channelId !== null,
  );

  async function restart() {
    setBusy(true);
    const res = channelId ? await restartWhatsAppAction(channelId) : await startWhatsAppAction();
    setBusy(false);
    if (res.ok) begin(res.channelId);
    else {
      setError({ message: res.message, requestId: res.requestId });
      setPhase("error");
    }
  }

  function close() {
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title="اتصال واتس‌اپ"
      description="شماره‌ی واتس‌اپ فروشگاه مثل واتس‌اپ وب به سپردی وصل می‌شود."
      className="max-w-2xl"
      footer={
        <Button variant={phase === "connected" ? "brand" : "outline"} className="min-h-11" onClick={close}>
          {phase === "connected" ? "تمام" : "بستن"}
        </Button>
      }
    >
      {phase === "connected" ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-2 text-center">
          <SuccessCheck size={72} label="واتس‌اپ وصل شد" />
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">گوشی را به اینترنت وصل نگه دارید؛ اگر بیش از دو هفته خاموش بماند، اتصال قطع می‌شود.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
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

          <div className="flex flex-col items-center gap-3">
            <div className="flex aspect-square w-full max-w-64 items-center justify-center rounded-xl border border-border bg-card p-2">
              {phase === "waiting" && qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn in the browser, never a file
                <img src={qrImage} alt="کد QR اتصال واتس‌اپ" width={512} height={512} className="aspect-square size-full" />
              ) : phase === "waiting" || phase === "starting" ? (
                <div className="flex size-full flex-col items-center justify-center gap-3">
                  <Skeleton className="size-3/4" />
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Spinner size="xs" /> {lastStatus === null || lastStatus === "pending" ? "در حال ساختن کد…" : "در حال تازه کردن کد…"}
                  </span>
                </div>
              ) : (
                <QrCode className="size-16 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              )}
            </div>
            {phase === "waiting" && qrImage && <p className="text-center text-xs leading-6 text-muted-foreground">کد هر چند ثانیه عوض می‌شود؛ همین صفحه را باز نگه دارید.</p>}

            {phase === "restart" && (
              <Alert variant="warning" title={lastStatus === "expired" ? "مهلت کد تمام شد" : "اتصال انجام نشد"}>
                <p className="leading-7">کد اسکن نشد یا اتصال قطع شد. یک کد تازه بسازید.</p>
              </Alert>
            )}
            {phase === "timeout" && (
              <Alert variant="warning" title="هنوز اسکن نشده">
                <p className="leading-7">سه دقیقه گذشت و گوشی کد را اسکن نکرد. اگر آماده‌اید، یک کد تازه بسازید.</p>
              </Alert>
            )}
            {phase === "error" && error && (
              <Alert variant="destructive" title="اتصال شروع نشد">
                <p className="leading-7">{error.message}</p>
                {error.requestId && <RequestId id={error.requestId} />}
              </Alert>
            )}
            {(phase === "restart" || phase === "timeout" || phase === "error") && (
              <Button variant="brand" className="min-h-11" disabled={busy} onClick={restart}>
                {busy ? "در حال ساختن کد…" : "ساختن کد تازه"}
              </Button>
            )}
          </div>

          <p className="text-xs leading-6 text-muted-foreground sm:col-span-2">
            اتصال به‌صورت دستگاه متصل است، نه API رسمی واتس‌اپ. واتس‌اپ روی گوشی شما مثل قبل کار می‌کند.
          </p>
        </div>
      )}
    </Dialog>
  );
}
