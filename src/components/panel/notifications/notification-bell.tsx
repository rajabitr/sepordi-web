"use client";

import Link from "next/link";
import * as React from "react";
import { Bell, Cable, CalendarClock, CheckCheck, Download, MessageCircle, MessagesSquare, Receipt, Settings2, ShoppingBag, Undo2, Wallet, type LucideIcon } from "lucide-react";

import { Popover } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/persian";
import { startPoller } from "@/lib/poller";
import { cn, fa } from "@/lib/utils";

import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

/** One row of GET /api/notifications. */
interface BellItem {
  id: string;
  kind: "handoff" | "message" | "order" | "receipt" | "credit" | "channel" | "case" | "import" | "booking";
  title: string;
  description?: string;
  href: string;
  at: string;
  read: boolean;
}

const ICONS: Record<BellItem["kind"], LucideIcon> = {
  handoff: MessagesSquare,
  message: MessageCircle,
  order: ShoppingBag,
  receipt: Receipt,
  credit: Wallet,
  channel: Cable,
  case: Undo2,
  import: Download,
  booking: CalendarClock,
};

const POLL_MS = 30_000;

/** The topbar bell: unread webhook events of the seller's shop, loaded at once and polled every 30 s while the tab is visible. */
export function NotificationBell({ className }: { className?: string }) {
  const [items, setItems] = React.useState<BellItem[] | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { items: BellItem[]; unread: number };
      setItems(body.items);
      setUnread(body.unread);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  React.useEffect(() => startPoller(load, { intervalMs: POLL_MS, immediate: true }), [load]);

  function readOne(id: string) {
    const item = items?.find((i) => i.id === id);
    if (!item || item.read) return;
    setItems((list) => list?.map((i) => (i.id === id ? { ...i, read: true } : i)) ?? null);
    setUnread((n) => Math.max(0, n - 1));
    void markNotificationReadAction(id).catch(() => void load());
  }

  function readAll() {
    setItems((list) => list?.map((i) => ({ ...i, read: true })) ?? null);
    setUnread(0);
    void markAllNotificationsReadAction().catch(() => void load());
  }

  const label = unread > 0 ? `اعلان‌ها، ${fa(unread)} خوانده‌نشده` : "اعلان‌ها";

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void load();
      }}
      align="end"
      className="w-80 p-0"
      trigger={
        <button
          type="button"
          aria-label={label}
          className={cn(
            "relative flex size-11 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--motion) ease-motion hover:bg-secondary hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Bell className="size-5" strokeWidth={1.5} />
          {unread > 0 && (
            <span className="absolute end-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold leading-none text-white">
              {unread > 99 ? "۹۹+" : fa(unread)}
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border ps-4 pe-2">
        <p className="py-3 font-semibold">اعلان‌ها</p>
        <button
          type="button"
          onClick={readAll}
          disabled={unread === 0}
          className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-control px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-default disabled:opacity-50"
        >
          <CheckCheck className="size-4" strokeWidth={1.5} />
          خواندن همه
        </button>
      </div>
      <div className="max-h-96 min-h-24 overflow-y-auto" aria-live="polite">
        {items === null && !failed && (
          <div className="flex flex-col gap-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}
        {items === null && failed && <p className="p-6 text-center text-sm text-muted-foreground">اعلان‌ها بارگذاری نشد. کمی بعد دوباره باز کنید.</p>}
        {items?.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">اعلان تازه‌ای ندارید.</p>}
        {items && items.length > 0 && (
          <ul>
            {items.map((n) => {
              const Icon = ICONS[n.kind] ?? Bell;
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      readOne(n.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-h-11 gap-3 px-4 py-3 transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                      !n.read && "bg-accent/40",
                    )}
                  >
                    <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <Icon className="size-4" strokeWidth={1.5} />
                      {!n.read && <span className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-brand" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm leading-6", !n.read && "font-semibold")}>
                        {n.title}
                        {!n.read && <span className="sr-only">، خوانده‌نشده</span>}
                      </span>
                      {n.description && <span className="block text-xs leading-5 text-muted-foreground">{n.description}</span>}
                      <span className="block text-xs leading-5 text-muted-foreground">{timeAgo(new Date(n.at))}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Link
        href="/panel/settings/notifications"
        onClick={() => setOpen(false)}
        className="flex min-h-11 items-center justify-center gap-2 border-t border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:outline-none"
      >
        <Settings2 className="size-4" strokeWidth={1.5} />
        تنظیم اعلان‌ها
      </Link>
    </Popover>
  );
}
