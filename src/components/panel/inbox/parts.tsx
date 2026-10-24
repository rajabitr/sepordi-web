import Link from "next/link";
import { Camera, LockKeyhole, MessageCircle, Send, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

import { CHANNEL_LABEL, PRIORITY_LABEL, STATE_LABEL, type ChannelKind, type FaError, type HandoffPriority, type HandoffState } from "./model";

const CHANNEL_ICON = { whatsapp: MessageCircle, instagram: Camera, telegram: Send } as const;

export function ChannelIcon({ kind, className }: { kind: ChannelKind; className?: string }) {
  const Icon = CHANNEL_ICON[kind];
  return (
    <span className={cn("inline-flex shrink-0 items-center text-muted-foreground", className)} title={CHANNEL_LABEL[kind]}>
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
      <span className="sr-only">{CHANNEL_LABEL[kind]}</span>
    </span>
  );
}

const STATE_VARIANT = { handoff: "warning", human: "brand", ai: "secondary" } as const;

export function StateBadge({ state }: { state: HandoffState }) {
  return (
    <Badge variant={STATE_VARIANT[state]} className="gap-1">
      <span aria-hidden className={cn("size-2 rounded-full", state === "handoff" ? "bg-warning" : state === "human" ? "bg-brand" : "bg-muted-foreground")} />
      {STATE_LABEL[state]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority?: HandoffPriority }) {
  if (!priority || priority === "normal" || priority === "low") return null;
  return <Badge variant={priority === "urgent" ? "destructive" : "warning"}>{PRIORITY_LABEL[priority]}</Badge>;
}

/** The request id, for support; ids stay Latin and left-to-right. */
export function RequestId({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <span className="block text-xs text-muted-foreground">
      کد پیگیری: <bdi dir="ltr" className="select-all font-mono">{id}</bdi>
    </span>
  );
}

export function InlineError({ error, onRetry, className }: { error: FaError; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-surface border border-destructive/30 bg-destructive/5 p-4 text-sm", className)}>
      <TriangleAlert className="mt-1 size-4 shrink-0 text-destructive" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="leading-7">{error.message}</p>
        <RequestId id={error.requestId} />
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 shrink-0 cursor-pointer rounded-control px-3 font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          تلاش دوباره
        </button>
      )}
    </div>
  );
}

/** The shop's plan has no inbox: a calm explanation and the way to the plan, never an error box. */
export function NotEntitledState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={LockKeyhole}
      title="این بخش در پلن فروشگاه شما فعال نیست"
      description="صندوق پیام جزو پلن فعلی فروشگاه نیست. برای دیدن پیام مشتری‌ها و جواب دادن به آن‌ها، به بخش «اعتبار» سر بزنید."
      action={
        <Link href="/panel/credit" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
          رفتن به بخش اعتبار
        </Link>
      }
      className={className}
    />
  );
}
