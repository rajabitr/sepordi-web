"use client";

import * as React from "react";
import { Ban, CalendarClock, Check, CheckCheck, UserX, X } from "lucide-react";

import { bookingAction, loadSlotsAction, rescheduleAction } from "@/app/panel/booking/actions";
import { useIntent } from "@/components/panel/orders/use-intent";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateShort, formatDateWithWeekday, formatTime } from "@/lib/date";
import { cn, fa } from "@/lib/utils";
import type { BookingSlots } from "@/server/bizin/booking/types";

import { ACTION_LABEL, PAYMENT_ACTIONS, allowedActions, reasonRule, type DeskAction } from "./model";

const ICON: Record<DeskAction, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  approve: Check,
  reject: X,
  cancel: Ban,
  reschedule: CalendarClock,
  complete: CheckCheck,
  "no-show": UserX,
  "confirm-payment": Check,
  "reject-payment": X,
};

const DESTRUCTIVE = new Set<DeskAction>(["reject", "cancel", "reject-payment", "no-show"]);

export interface BookingActionsProps {
  bookingId: string;
  code: string;
  status: string;
  serviceId: string;
  /** The customer and the time, for the confirmation sentence. */
  summary: string;
  canVerifyPayments: boolean;
  /** `booking.manage`: approve, reject, cancel, complete, «نیامد» and reschedule. */
  canManage: boolean;
  /** Set while it is still too early for «نیامد» (422 no_show_too_early before it); null once it may be recorded. */
  noShowNotBefore: string | null;
  today: string;
}

/** The moves the booking's status allows, each behind a confirmation, each with one idempotency key per intent. */
export function BookingActions({ bookingId, code, status, serviceId, summary, canVerifyPayments, canManage, noShowNotBefore, today }: BookingActionsProps) {
  const actions = allowedActions({ status }).filter((a) => (PAYMENT_ACTIONS.includes(a) ? canVerifyPayments : canManage));
  const [asking, setAsking] = React.useState<DeskAction | null>(null);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { begin, run } = useIntent();

  if (actions.length === 0) return null;
  const rule = asking ? reasonRule(asking, status) : "none";
  const tooEarly = (a: DeskAction) => a === "no-show" && noShowNotBefore !== null;

  function open(a: DeskAction) {
    begin();
    setReason("");
    setError(null);
    setAsking(a);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => {
          const Icon = ICON[a];
          return (
            <Button
              key={a}
              variant={i === 0 ? "default" : DESTRUCTIVE.has(a) ? "ghost" : "outline"}
              className={cn("min-h-11", DESTRUCTIVE.has(a) && i !== 0 && "text-destructive hover:text-destructive")}
              disabled={tooEarly(a)}
              onClick={() => open(a)}
            >
              <Icon className="size-4" strokeWidth={2} />
              {ACTION_LABEL[a].button}
            </Button>
          );
        })}
      </div>
      {actions.includes("no-show") && noShowNotBefore && (
        <p className="text-xs text-muted-foreground">«مشتری نیامد» از {formatDateShort(noShowNotBefore)}، ساعت {formatTime(noShowNotBefore)} فعال می‌شود.</p>
      )}

      {asking && asking !== "reschedule" && rule === "none" && (
        <AlertDialog
          open
          onOpenChange={(o) => !o && setAsking(null)}
          title={ACTION_LABEL[asking].ask}
          description={`نوبت ${fa(code)}: ${summary}`}
          confirmText={ACTION_LABEL[asking].button}
          cancelText="منصرف شدم"
          destructive={DESTRUCTIVE.has(asking)}
          onConfirm={async () => {
            const a = asking;
            await run((key) => bookingAction(bookingId, a, "", key), ACTION_LABEL[a].done);
          }}
        />
      )}

      {asking && rule !== "none" && (
        <Dialog
          open
          onOpenChange={(o) => !o && setAsking(null)}
          role="alertdialog"
          title={ACTION_LABEL[asking].ask}
          description={`نوبت ${fa(code)}: ${summary}`}
          footer={
            <>
              <Button variant="ghost" className="min-h-11" onClick={() => setAsking(null)}>
                منصرف شدم
              </Button>
              <Button
                variant="destructive"
                className="min-h-11"
                onClick={async () => {
                  if (rule === "required" && !reason.trim()) {
                    setError("برای لغو نوبت تأییدشده، دلیل را بنویسید؛ مشتری آن را می‌بیند.");
                    return;
                  }
                  const a = asking;
                  const r = await run((key) => bookingAction(bookingId, a, reason, key), ACTION_LABEL[a].done);
                  if (r.ok) setAsking(null);
                }}
              >
                {ACTION_LABEL[asking].button}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-reason">{rule === "required" ? "دلیل" : "دلیل (اختیاری)"}</Label>
            <Textarea id="bk-reason" value={reason} maxLength={500} showCount onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: آن روز سالن تعطیل است." />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </Dialog>
      )}

      {asking === "reschedule" && (
        <ReschedulePicker
          serviceId={serviceId}
          today={today}
          title={`تغییر زمان نوبت ${fa(code)}`}
          onClose={() => setAsking(null)}
          onPick={async (startsAt, resourceId) => {
            const r = await run((key) => rescheduleAction(bookingId, startsAt, resourceId, key), ACTION_LABEL.reschedule.done);
            if (r.ok) setAsking(null);
          }}
        />
      )}
    </div>
  );
}

const DAY_REASON: Record<string, string> = {
  in_the_past: "گذشته",
  outside_horizon: "خارج از بازه",
  closed_holiday: "تعطیل",
  closed_by_seller: "تعطیل",
  no_schedule: "بدون ساعت کاری",
  blocked: "بسته",
  before_min_notice: "خیلی نزدیک",
  fully_booked: "پر",
  max_per_day: "پر",
  duration_does_not_fit: "وقت کافی نیست",
};

/** Free times from the contract's `GET /slots` (never computed here), a day strip above the times of the chosen day. */
function ReschedulePicker({ serviceId, today, title, onClose, onPick }: { serviceId: string; today: string; title: string; onClose: () => void; onPick: (startsAt: string, resourceId: string) => Promise<void> }) {
  const [data, setData] = React.useState<BookingSlots | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [day, setDay] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<{ starts_at: string; resource_id: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    loadSlotsAction(serviceId, today).then(
      (r) => {
        if (!live) return;
        if (r.ok) {
          setData(r.slots);
          setDay(r.slots.days.find((d) => d.slots > 0)?.date ?? null);
        } else setFailed(r.message);
      },
      () => live && setFailed("اتصال برقرار نشد. دوباره امتحان کنید."),
    );
    return () => {
      live = false;
    };
  }, [serviceId, today]);

  const times = data && day ? data.slots.filter((s) => s.local_date === day) : [];
  const unique = times.filter((s, i) => times.findIndex((x) => x.starts_at === s.starts_at) === i);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="زمان‌های آزاد دو هفته‌ی پیش رو، از روی ساعات کاری و نوبت‌های گرفته‌شده."
      footer={
        <>
          <Button variant="ghost" className="min-h-11" onClick={onClose}>
            منصرف شدم
          </Button>
          <Button
            className="min-h-11"
            disabled={!picked || busy}
            onClick={async () => {
              if (!picked) return;
              setBusy(true);
              await onPick(picked.starts_at, picked.resource_id);
              setBusy(false);
            }}
          >
            {picked ? `انتقال به ${formatDateShort(picked.starts_at)}، ساعت ${formatTime(picked.starts_at)}` : "یک زمان انتخاب کنید"}
          </Button>
        </>
      }
    >
      <div className="flex min-h-64 flex-col gap-4">
        {failed && <p className="text-sm text-destructive">{failed}</p>}
        {!data && !failed && (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="در حال بارگذاری زمان‌های آزاد">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {data && (
          <>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="listbox" aria-label="روز">
              {data.days.map((d) => {
                const free = d.slots > 0;
                const label = formatDateWithWeekday(`${d.date}T09:00:00Z`).split(" ");
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="option"
                    aria-selected={day === d.date}
                    disabled={!free}
                    onClick={() => {
                      setDay(d.date);
                      setPicked(null);
                    }}
                    className={cn(
                      "flex min-h-16 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-sm transition-colors duration-150",
                      day === d.date ? "border-brand bg-accent" : "border-border",
                      !free && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="text-xs text-muted-foreground">{label[0]}</span>
                    <span className="font-medium">{label.slice(1, 3).join(" ")}</span>
                    <span className="text-xs text-muted-foreground">{free ? `${fa(d.slots)} وقت` : (DAY_REASON[d.reason ?? ""] ?? "بسته")}</span>
                  </button>
                );
              })}
            </div>
            {unique.length === 0 ? (
              <p className="text-sm text-muted-foreground">در این دو هفته وقت آزادی برای این خدمت نیست.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label="ساعت">
                {unique.map((s) => (
                  <button
                    key={s.starts_at}
                    type="button"
                    role="option"
                    aria-selected={picked?.starts_at === s.starts_at}
                    onClick={() => setPicked({ starts_at: s.starts_at, resource_id: s.resource_id })}
                    className={cn(
                      "min-h-11 rounded-lg border text-sm font-medium transition-colors duration-150",
                      picked?.starts_at === s.starts_at ? "border-brand bg-brand-strong text-brand-strong-foreground" : "border-border hover:bg-accent",
                    )}
                  >
                    {formatTime(s.starts_at)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
