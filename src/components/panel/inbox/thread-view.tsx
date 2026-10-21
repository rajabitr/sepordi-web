"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowRight, Bot, Hand, Reply, ShoppingBag, UserRound } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, relativeTime } from "@/lib/date";
import { fa } from "@/lib/utils";
import { claimAction, moveQueueAction, releaseAction, replyAction, type ReplyInput } from "@/app/panel/inbox/actions";

import { Composer, type Draft } from "./composer";
import { MessageBubble } from "./message-bubble";
import {
  CHANNEL_LABEL,
  composerBlock,
  customerName,
  filtersFromSearch,
  filtersToSearch,
  mergeMessages,
  QUEUE_LABEL,
  QUEUES,
  type Conversation,
  type FaError,
  type HandoffQueue,
  type Message,
} from "./model";
import { explainHandoff } from "./handoff-reason";
import { ChannelIcon, InlineError, PriorityBadge, RequestId, StateBadge } from "./parts";
import { fetchResult, outcomeOf, usePoll } from "./use-poll";

const THREAD_POLL_MS = 5_000;
const NEAR_BOTTOM_PX = 96;

export const OPTED_OUT_MESSAGE = "این مشتری گفت‌وگوی خودکار را متوقف کرده است";
export const SENT_NOT_SAVED_MESSAGE = "ارسال شد ولی هنوز در تاریخچه ثبت نشده؛ دوباره نفرستید";

export interface MessagePage {
  messages: Message[];
  next_before: string | null;
  next_after: string | null;
  conversation?: Conversation;
}

type ClaimChoice = "claim" | "send" | "cancel";

const newKey = () => crypto.randomUUID();

export function ThreadView({ initialConversation, initialPage }: { initialConversation: Conversation; initialPage: MessagePage }) {
  const id = initialConversation.id;
  const { toast } = useToast();
  const sp = useSearchParams();
  const backQs = filtersToSearch(filtersFromSearch(sp)).toString();

  const [conv, setConv] = React.useState(initialConversation);
  const [messages, setMessages] = React.useState(() => mergeMessages([], initialPage.messages));
  const [before, setBefore] = React.useState(initialPage.next_before);
  const [after, setAfter] = React.useState(initialPage.next_after);
  const [olderLoading, setOlderLoading] = React.useState(false);
  const [olderError, setOlderError] = React.useState<FaError | null>(null);
  const [busy, setBusy] = React.useState<"claim" | "release" | "queue" | null>(null);
  const [sending, setSending] = React.useState(false);
  const [confirmRelease, setConfirmRelease] = React.useState(false);
  const [askOpen, setAskOpen] = React.useState(false);
  const [now, setNow] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [unseen, setUnseen] = React.useState(0);
  const composerId = React.useId();

  const scroller = React.useRef<HTMLDivElement>(null);
  const nearBottom = React.useRef(true);
  const keepOffset = React.useRef<number | null>(null);
  const forceBottom = React.useRef(true);
  const known = React.useRef(new Set(initialPage.messages.map((m) => m.id)));
  const askResolve = React.useRef<((c: ClaimChoice) => void) | null>(null);
  const skipAsk = React.useRef(false);
  const reply = React.useRef<{ sig: string; key: string } | null>(null);

  const name = customerName(conv);

  const showError = React.useCallback(
    (e: FaError) => toast({ variant: "error", title: e.message, description: e.requestId ? <RequestId id={e.requestId} /> : undefined, duration: 8000 }),
    [toast],
  );
  const fail = (e: FaError): false => {
    showError(e);
    return false;
  };

  function absorb(incoming: Message[]) {
    const fresh = incoming.filter((m) => !known.current.has(m.id));
    for (const m of incoming) known.current.add(m.id);
    if (incoming.length) setMessages((cur) => mergeMessages(cur, incoming));
    return fresh;
  }

  const tick = React.useCallback(async () => {
    const q = after ? `?after=${encodeURIComponent(after)}` : "";
    const r = await fetchResult<MessagePage>(`/panel/inbox/data/conversations/${encodeURIComponent(id)}/messages${q}`);
    setNow(Date.now());
    if (r.ok) {
      const fresh = absorb(r.data.messages);
      if (r.data.next_after) setAfter(r.data.next_after);
      if (r.data.conversation) setConv(r.data.conversation);
      const fromCustomer = fresh.filter((m) => m.sender === "customer").length;
      if (fromCustomer > 0) {
        setAnnouncement(fromCustomer === 1 ? `پیام تازه از ${name}` : `${fa(fromCustomer)} پیام تازه از ${name}`);
        if (!nearBottom.current) setUnseen((n) => n + fresh.length);
      }
    }
    return outcomeOf(r);
  }, [after, id, name]);

  usePoll(tick, THREAD_POLL_MS);

  React.useEffect(() => {
    // The first clock reading happens after hydration so server and client render the same text.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (forceBottom.current || nearBottom.current) {
      el.scrollTop = el.scrollHeight;
      forceBottom.current = false;
    }
  }, [messages]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current && unseen) setUnseen(0);
  }

  function jumpToEnd() {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setUnseen(0);
  }

  async function loadOlder() {
    if (!before) return;
    setOlderLoading(true);
    setOlderError(null);
    const r = await fetchResult<MessagePage>(`/panel/inbox/data/conversations/${encodeURIComponent(id)}/messages?before=${encodeURIComponent(before)}`);
    setOlderLoading(false);
    if (!r.ok) return setOlderError(r.error);
    const el = scroller.current;
    keepOffset.current = el ? el.scrollHeight - el.scrollTop : null;
    absorb(r.data.messages);
    setBefore(r.data.next_before);
  }

  async function claim(): Promise<boolean> {
    setBusy("claim");
    const r = await claimAction(id, newKey()).catch(() => null);
    setBusy(null);
    if (!r) return fail({ message: "اتصال برقرار نشد. دوباره امتحان کنید.", code: "network_error" });
    if (!r.ok) return fail(r.error);
    setConv(r.data);
    toast({ variant: "success", title: "گفت‌وگو را در دست گرفتید؛ دستیار دیگر به این مشتری جواب نمی‌دهد." });
    return true;
  }

  async function release() {
    setBusy("release");
    const r = await releaseAction(id, newKey()).catch(() => null);
    setBusy(null);
    if (!r) return void showError({ message: "اتصال برقرار نشد. دوباره امتحان کنید.", code: "network_error" });
    if (!r.ok) {
      return void showError(r.error.code === "customer_opted_out" ? { ...r.error, message: OPTED_OUT_MESSAGE } : r.error);
    }
    const { assistant_active, ...next } = r.data;
    setConv(next);
    skipAsk.current = false;
    toast(
      assistant_active
        ? { variant: "success", title: "گفت‌وگو به دستیار برگشت؛ از پیام بعدی مشتری، دستیار جواب می‌دهد." }
        : { title: "گفت‌وگو برگشت، ولی دستیار فروشگاه خاموش است؛ تا روشنش نکنید جوابی داده نمی‌شود.", duration: 8000 },
    );
  }

  async function moveQueue(queue: HandoffQueue) {
    if (queue === conv.queue) return;
    setBusy("queue");
    const r = await moveQueueAction(id, queue, newKey()).catch(() => null);
    setBusy(null);
    if (!r) return void showError({ message: "اتصال برقرار نشد. دوباره امتحان کنید.", code: "network_error" });
    if (!r.ok) return void showError(r.error);
    setConv(r.data);
    toast({ variant: "success", title: `گفت‌وگو به صف «${QUEUE_LABEL[queue]}» رفت.` });
  }

  function askToClaim(): Promise<ClaimChoice> {
    setAskOpen(true);
    return new Promise((resolve) => {
      askResolve.current = resolve;
    });
  }

  function answerAsk(choice: ClaimChoice) {
    setAskOpen(false);
    askResolve.current?.(choice);
    askResolve.current = null;
  }

  async function send(draft: Draft): Promise<boolean> {
    if (conv.state === "ai" && !skipAsk.current) {
      const choice = await askToClaim();
      if (choice === "cancel") return false;
      if (choice === "claim" && !(await claim())) return false;
      skipAsk.current = true;
    }

    // The same draft retried keeps its key, so a reply that did reach the customer is never sent twice.
    const sig = JSON.stringify([draft.text, draft.image && [draft.image.name, draft.image.size, draft.image.lastModified]]);
    if (reply.current?.sig !== sig) reply.current = { sig, key: newKey() };
    const key = reply.current.key;

    setSending(true);
    try {
      let input: ReplyInput;
      if (draft.image) {
        const form = new FormData();
        form.set("file", draft.image);
        const up = await fetchResult<{ id: string }>("/panel/inbox/data/media", { method: "POST", body: form, timeoutMs: 90_000 });
        if (!up.ok) return fail(up.error);
        input = draft.text ? { mediaId: up.data.id, caption: draft.text } : { mediaId: up.data.id };
      } else {
        input = { text: draft.text };
      }
      const r = await replyAction(id, input, key).catch(() => null);
      if (!r) return fail({ message: "معلوم نیست پیام رسید یا نه. چند لحظه صبر کنید و گفت‌وگو را نگاه کنید؛ دوباره فرستادن همین پیام امن است.", code: "network_error" });
      if (!r.ok) return fail(r.error);
      reply.current = null;
      if (r.data.kind === "saved") {
        forceBottom.current = true;
        absorb([r.data.message]);
      } else {
        toast({ title: SENT_NOT_SAVED_MESSAGE, duration: 10_000 });
      }
      return true;
    } finally {
      setSending(false);
    }
  }

  const block = now === null ? null : composerBlock(conv, now);
  const groups = groupByDay(messages);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <Link
          href={backQs ? `/panel/inbox?${backQs}` : "/panel/inbox"}
          aria-label="بازگشت به فهرست گفت‌وگوها"
          className="-ms-2 flex size-11 items-center justify-center rounded-control text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <ArrowRight className="size-5" strokeWidth={1.5} />
        </Link>
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold leading-6">{conv.customer.display_name?.trim() ? name : <bdi dir="ltr">{fa(name)}</bdi>}</h2>
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ChannelIcon kind={conv.channel_kind} />
              {CHANNEL_LABEL[conv.channel_kind]}
            </span>
            {conv.customer.display_name?.trim() && conv.customer.phone && <bdi dir="ltr">{fa(conv.customer.phone)}</bdi>}
            <StateBadge state={conv.state} />
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select
            aria-label="صف گفت‌وگو"
            className="w-32"
            value={conv.queue ?? ""}
            placeholder="بدون صف"
            disabled={busy !== null || conv.state === "ai"}
            title={conv.state === "ai" ? "صف فقط برای گفت‌وگویی که به شما واگذار شده یا در دست شماست عوض می‌شود." : undefined}
            onChange={(e) => void moveQueue(e.target.value as HandoffQueue)}
            options={QUEUES.map((q) => ({ value: q, label: `صف ${QUEUE_LABEL[q]}` }))}
          />
          {conv.state !== "human" && (
            <Button variant={conv.state === "handoff" ? "outline" : "default"} className="min-h-11 flex-1 sm:flex-none" disabled={busy !== null} onClick={() => void claim()}>
              {busy === "claim" ? <Spinner size="sm" className="text-current" /> : <Hand strokeWidth={2} />}
              در دست گرفتن
            </Button>
          )}
          {conv.state === "human" && (
            <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" disabled={busy !== null} onClick={() => setConfirmRelease(true)}>
              {busy === "release" ? <Spinner size="sm" className="text-current" /> : <Bot strokeWidth={2} />}
              برگرداندن به دستیار
            </Button>
          )}
        </div>
      </header>

      <StatusStrip
        conv={conv}
        now={now}
        releasing={busy === "release"}
        disabled={busy !== null}
        onRelease={() => setConfirmRelease(true)}
        onReply={() => document.getElementById(composerId)?.focus()}
      />

      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {before && (
          <div className="mb-4 flex flex-col items-center gap-2">
            {olderError && <InlineError error={olderError} className="w-full" />}
            <Button variant="ghost" className="min-h-11" disabled={olderLoading} onClick={() => void loadOlder()}>
              {olderLoading ? <Spinner size="sm" label="در حال بارگذاری…" /> : "پیام‌های قبلی"}
            </Button>
          </div>
        )}
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">هنوز پیامی در این گفت‌وگو نیست.</p>
        ) : (
          <ol className="flex flex-col gap-4" aria-label={`پیام‌های گفت‌وگو با ${name}`}>
            {groups.map((g) => (
              <li key={g.day} className="flex flex-col gap-4">
                <p className="self-center rounded-full bg-muted px-3 text-xs leading-6 text-muted-foreground">{g.day}</p>
                {g.items.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
              </li>
            ))}
          </ol>
        )}
        {unseen > 0 && (
          <div className="pointer-events-none sticky bottom-0 flex justify-center">
            <Button size="sm" className="pointer-events-auto min-h-11 shadow-overlay" onClick={jumpToEnd}>
              <ArrowDown strokeWidth={2} />
              {fa(unseen)} پیام تازه
            </Button>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      <Composer channel={conv.channel_kind} block={block} sending={sending} onSend={send} inputId={composerId} />

      <AlertDialog
        open={confirmRelease}
        onOpenChange={setConfirmRelease}
        title="گفت‌وگو به دستیار برگردد؟"
        description="از پیام بعدی مشتری، دستیار دوباره جواب می‌دهد. پیامی برای مشتری فرستاده نمی‌شود."
        confirmText="برگرداندن به دستیار"
        onConfirm={release}
      />

      <Dialog
        open={askOpen}
        onOpenChange={(open) => !open && answerAsk("cancel")}
        title="اول گفت‌وگو را در دست بگیرید؟"
        description="الان دستیار به این مشتری جواب می‌دهد. اگر گفت‌وگو را در دست بگیرید، دستیار تا وقتی آن را برنگردانید جواب نمی‌دهد."
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" className="min-h-11" onClick={() => answerAsk("cancel")}>
              انصراف
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => answerAsk("send")}>
              فقط ارسال
            </Button>
            <Button className="min-h-11" data-autofocus onClick={() => answerAsk("claim")}>
              در دست گرفتن و ارسال
            </Button>
          </div>
        }
      />
    </div>
  );
}

function StatusStrip({
  conv,
  now,
  releasing,
  disabled,
  onRelease,
  onReply,
}: {
  conv: Conversation;
  now: number | null;
  releasing: boolean;
  disabled: boolean;
  onRelease: () => void;
  onReply: () => void;
}) {
  const at = (iso: string | null) => (iso ? (now ? relativeTime(iso, new Date(now)) : formatDateTime(iso)) : null);
  const order = conv.related_order;
  const windowOpen = conv.reply_window_closes_at && now !== null && Date.parse(conv.reply_window_closes_at) > now;

  if (conv.state !== "handoff" && conv.state !== "human" && !order && !windowOpen) return null;
  const explanation = explainHandoff(conv.handoff);
  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 text-sm">
      {conv.state === "handoff" && (
        <div role="note" className="flex flex-col gap-2 rounded-control bg-warning/10 px-3 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Hand className="size-4 shrink-0 text-warning" strokeWidth={2} aria-hidden />
            <span className="font-medium">{explanation.label}</span>
            {conv.handoff?.raised_at && (
              <time dateTime={conv.handoff.raised_at} className="text-xs text-muted-foreground">
                {at(conv.handoff.raised_at)}
              </time>
            )}
            <PriorityBadge priority={conv.handoff?.priority} />
          </div>
          <p className="leading-7">{explanation.detail}</p>
          <p className="font-medium leading-7">تا وقتی گفت‌وگو دست شماست، دستیار جواب نمی‌دهد.</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11 flex-1 sm:flex-none" disabled={disabled} onClick={onRelease}>
              {releasing ? <Spinner size="sm" className="text-current" /> : <Bot strokeWidth={2} />}
              برگرداندن به دستیار
            </Button>
            <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={onReply}>
              <Reply strokeWidth={2} />
              جواب دادن
            </Button>
          </div>
        </div>
      )}
      {conv.state === "human" && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <UserRound className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          این گفت‌وگو در دست شماست و دستیار جواب نمی‌دهد
          {conv.held_since && <time dateTime={conv.held_since}>(از {at(conv.held_since)})</time>}
        </p>
      )}
      {(order || windowOpen) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {order && (
            <Link href={`/panel/orders/${encodeURIComponent(order.id)}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-brand-ink underline-offset-4 hover:underline">
              <ShoppingBag className="size-4" strokeWidth={1.5} aria-hidden />
              سفارش <bdi dir="ltr">{order.code}</bdi>
            </Link>
          )}
          {windowOpen && conv.reply_window_closes_at && <span>مهلت پاسخ در {CHANNEL_LABEL[conv.channel_kind]}: {at(conv.reply_window_closes_at)}</span>}
        </div>
      )}
    </div>
  );
}

function groupByDay(messages: Message[]): { day: string; items: Message[] }[] {
  const out: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = formatDate(m.created_at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(m);
    else out.push({ day, items: [m] });
  }
  return out;
}

