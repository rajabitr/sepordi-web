import { Bot, Check, CheckCheck, Clock, FileDown, TriangleAlert, UserRound } from "lucide-react";

import { formatTime } from "@/lib/date";
import { cn, faFileSize } from "@/lib/utils";

import { MESSAGE_STATUS_LABEL, type Message } from "./model";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const DOWNLOAD_LABEL: Record<Message["kind"], string> = {
  text: "دانلود فایل",
  image: "دانلود عکس",
  video: "دانلود ویدیو",
  audio: "دانلود پیام صوتی",
  document: "دانلود فایل",
  sticker: "دانلود استیکر",
  other: "دانلود پیوست",
};

export function mediaUrl(id: string): string {
  return `/panel/media/${encodeURIComponent(id)}`;
}

function isImage(m: Message): boolean {
  if (!m.media) return false;
  if (m.media.mime) return IMAGE_MIMES.has(m.media.mime);
  return m.kind === "image" || m.kind === "sticker";
}

export function MessageBubble({ m }: { m: Message }) {
  const mine = m.sender !== "customer";
  const caption = m.text.trim();
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-5/6 flex-col gap-1 sm:max-w-md", mine ? "items-end" : "items-start")}>
        {mine && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {m.sender === "ai" ? <Bot className="size-3" strokeWidth={2} aria-hidden /> : <UserRound className="size-3" strokeWidth={2} aria-hidden />}
            {m.sender === "ai" ? "دستیار" : "شما"}
          </span>
        )}
        <div
          className={cn(
            "overflow-hidden rounded-surface text-sm leading-7",
            m.sender === "customer" && "bg-secondary text-secondary-foreground",
            m.sender === "ai" && "border border-border bg-background text-foreground",
            m.sender === "human" && "bg-primary text-primary-foreground",
            m.status === "failed" && "ring-2 ring-destructive/60",
          )}
        >
          {m.media && isImage(m) ? (
            <a href={mediaUrl(m.media.id)} target="_blank" rel="noopener" className="block w-64 max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {/* eslint-disable-next-line @next/next/no-img-element -- private bytes through our own no-store proxy */}
              <img src={mediaUrl(m.media.id)} alt={caption || (mine ? "عکس فرستاده‌شده" : "عکس مشتری")} loading="lazy" decoding="async" className="aspect-4/3 w-full bg-muted object-cover" />
            </a>
          ) : m.media ? (
            <a
              href={mediaUrl(m.media.id)}
              download
              className={cn(
                "flex min-h-11 items-center gap-2 px-4 py-2 font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              )}
            >
              <FileDown className="size-4 shrink-0" strokeWidth={2} aria-hidden />
              {DOWNLOAD_LABEL[m.kind]}
              {m.media.size ? <span className="text-xs opacity-80">({faFileSize(m.media.size)})</span> : null}
            </a>
          ) : m.kind !== "text" ? (
            <p className="px-4 py-2 text-xs opacity-80">پیوست این پیام در دسترس نیست.</p>
          ) : null}
          {caption && <p className="whitespace-pre-wrap break-words px-4 py-2">{caption}</p>}
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
          {mine && <StatusMark status={m.status} />}
        </span>
      </div>
    </div>
  );
}

function StatusMark({ status }: { status: Message["status"] }) {
  const label = MESSAGE_STATUS_LABEL[status];
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <TriangleAlert className="size-3" strokeWidth={2} aria-hidden />
        {label}
      </span>
    );
  }
  const Icon = status === "sent" ? Check : status === "received" ? Clock : CheckCheck;
  return (
    <span className={cn("inline-flex", status === "read" && "text-brand-ink")} title={label}>
      <Icon className="size-3" strokeWidth={2} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
