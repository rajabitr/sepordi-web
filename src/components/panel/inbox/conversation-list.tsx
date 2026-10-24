"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cable, FilterX, MessagesSquare, SearchX, SlidersHorizontal } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { relativeTime } from "@/lib/date";
import { cn, fa } from "@/lib/utils";
import { dayToPicker, pickedDay } from "@/components/panel/orders/model";

import {
  CHANNEL_LABEL,
  CHANNELS,
  customerName,
  filtersFromSearch,
  filtersToSearch,
  messagePreview,
  notEntitled,
  PRIORITIES,
  PRIORITY_LABEL,
  QUEUE_LABEL,
  QUEUES,
  REASON_CLASSES,
  sheetFilterCount,
  STATUS_LABEL,
  STATUSES,
  type Conversation,
  type FaError,
  type ListFilters,
  type StateTab,
} from "./model";
import { handoffClassLabel, handoffReasonLabel } from "./handoff-reason";
import { ChannelIcon, InlineError, NotEntitledState, PriorityBadge, StateBadge } from "./parts";
import { ConversationListSkeleton } from "./skeletons";
import { isUnread, onSeen, type SeenMap } from "./unread";
import { fetchResult, outcomeOf, usePoll } from "./use-poll";

const LIST_POLL_MS = 10_000;

const TABS: { value: StateTab; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "handoff", label: "نیازمند شما" },
  { value: "human", label: "در دست شما" },
  { value: "ai", label: "دستیار" },
];

type Page = { conversations: Conversation[]; next_cursor: string | null; seen?: SeenMap };

/** Keeps the refreshed first page on top and the older pages already loaded below it, newest activity first. */
function mergePages(fresh: Conversation[], loaded: Conversation[]): Conversation[] {
  const ids = new Set(fresh.map((c) => c.id));
  return [...fresh, ...loaded.filter((c) => !ids.has(c.id))].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}

export function ConversationList({ hasChannel, canConnect }: { hasChannel: boolean; canConnect: boolean }) {
  const sp = useSearchParams();
  const filters = filtersFromSearch(sp);
  const filterKey = filtersToSearch(filters).toString();
  // A filter change starts over from the first page, as the API asks.
  return <ListBody key={filterKey} filters={filters} filterKey={filterKey} hasChannel={hasChannel} canConnect={canConnect} />;
}

function ListBody({
  filters,
  filterKey,
  hasChannel,
  canConnect,
}: {
  filters: ListFilters;
  filterKey: string;
  hasChannel: boolean;
  canConnect: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = React.useState<Conversation[] | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [error, setError] = React.useState<FaError | null>(null);
  const [moreError, setMoreError] = React.useState<FaError | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [now, setNow] = React.useState<Date | null>(null);
  const [seen, setSeen] = React.useState<SeenMap>({});
  const [planOff, setPlanOff] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const morePages = React.useRef(false);

  const absorbSeen = React.useCallback((incoming: SeenMap | undefined) => {
    if (!incoming) return;
    setSeen((cur) => {
      const next = { ...cur };
      for (const [id, at] of Object.entries(incoming)) if (!next[id] || Date.parse(at) > Date.parse(next[id])) next[id] = at;
      return next;
    });
  }, []);

  React.useEffect(() => onSeen((id, at) => absorbSeen({ [id]: at })), [absorbSeen]);

  const url = React.useCallback(
    (c?: string) => {
      const q = new URLSearchParams(filterKey);
      if (c) q.set("cursor", c);
      return `/panel/inbox/data/conversations?${q}`;
    },
    [filterKey],
  );

  const refresh = React.useCallback(async () => {
    const r = await fetchResult<Page>(url());
    if (r.ok) {
      setItems((cur) => (cur && morePages.current ? mergePages(r.data.conversations, cur) : r.data.conversations));
      if (!morePages.current) setCursor(r.data.next_cursor);
      absorbSeen(r.data.seen);
      setError(null);
    } else if (notEntitled(r.error)) {
      setPlanOff(true);
    } else {
      setError(r.error);
    }
    setNow(new Date());
    return outcomeOf(r);
  }, [url, absorbSeen]);

  usePoll(refresh, LIST_POLL_MS, { immediate: true, enabled: !planOff });

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    const r = await fetchResult<Page>(url(cursor));
    setLoadingMore(false);
    if (!r.ok) return setMoreError(r.error);
    morePages.current = true;
    setItems((cur) => mergePages(cur ?? [], r.data.conversations));
    setCursor(r.data.next_cursor);
    absorbSeen(r.data.seen);
  }

  function setFilters(next: Partial<ListFilters>) {
    const qs = filtersToSearch({ ...filters, ...next }).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const inSheet = sheetFilterCount(filters);
  const filtered = filters.state !== "all" || !!filters.channel || !!filters.q || inSheet > 0;
  const activeId = pathname.split("/")[3];
  const clock = now?.getTime() ?? 0;

  if (planOff) return <NotEntitledState className="m-4" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <SearchInput
          defaultValue={filters.q ?? ""}
          onSearch={(v) => setFilters({ q: v.trim().length >= 2 ? v.trim() : undefined })}
          placeholder="جست‌وجو فقط در نام یا شماره‌ی مشتری"
          aria-label="جست‌وجو در نام یا شماره‌ی مشتری"
          maxLength={64}
          debounce={600}
        />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select
              aria-label="کانال"
              value={filters.channel ?? ""}
              onChange={(e) => setFilters({ channel: (e.target.value || undefined) as ListFilters["channel"] })}
              options={[{ value: "", label: "همه‌ی کانال‌ها" }, ...CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))]}
            />
          </div>
          <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
            <SlidersHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
            فیلترها
            {inSheet > 0 && (
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand/15 px-2 text-xs font-semibold leading-6 text-brand tabular-nums">
                {fa(inSheet)}
              </span>
            )}
          </Button>
        </div>
      </div>

      <FiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} filters={filters} setFilters={setFilters} />

      <Tabs value={filters.state} defaultValue="all" onValueChange={(v) => setFilters({ state: v as StateTab })} className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3">
          <TabsList aria-label="وضعیت گفت‌وگو" className="flex w-full overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="min-h-11 flex-1 whitespace-nowrap">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={filters.state} className="min-h-0 flex-1 overflow-y-auto">
          {error && items !== null && <InlineError error={error} onRetry={() => void refresh()} className="m-4" />}
          {items === null ? (
            error ? (
              <InlineError error={error} onRetry={() => void refresh()} className="m-4" />
            ) : (
              <ConversationListSkeleton />
            )
          ) : items.length === 0 ? (
            <div className="p-4">
              {!hasChannel && !filtered ? (
                canConnect ? (
                  <EmptyState
                    icon={Cable}
                    title="هنوز کانالی وصل نکرده‌اید"
                    description="برای دیدن پیام مشتری‌ها، واتس‌اپ، اینستاگرام یا تلگرام فروشگاه را وصل کنید."
                    action={<Link href="/panel/channels" className={buttonVariants({ className: "min-h-11" })}>وصل کردن کانال</Link>}
                  />
                ) : (
                  <EmptyState
                    icon={Cable}
                    title="هنوز کانالی وصل نشده است"
                    description="پیام مشتری‌ها وقتی این‌جا می‌آید که واتس‌اپ، اینستاگرام یا تلگرام فروشگاه وصل شود. این بخش را مالک فروشگاه تنظیم می‌کند."
                  />
                )
              ) : filtered ? (
                <EmptyState
                  icon={SearchX}
                  title="گفت‌وگویی با این فیلترها پیدا نشد"
                  description="فیلتر دیگری انتخاب کنید یا همه‌ی فیلترها را پاک کنید."
                  action={
                    <Link href="/panel/inbox" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
                      پاک کردن فیلترها
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  icon={MessagesSquare}
                  title="هنوز گفت‌وگویی نیست"
                  description="وقتی مشتری‌ای در کانال‌های شما پیام بدهد، گفت‌وگو این‌جا نشان داده می‌شود."
                />
              )}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {items.map((c) => (
                  <li key={c.id}>
                    <ConversationRow
                      c={c}
                      href={`/panel/inbox/${c.id}${filterKey ? `?${filterKey}` : ""}`}
                      active={c.id === activeId}
                      unread={now !== null && c.id !== activeId && isUnread(c, seen, clock)}
                      now={now}
                    />
                  </li>
                ))}
              </ul>
              {moreError && <InlineError error={moreError} onRetry={() => void loadMore()} className="m-4" />}
              {cursor && (
                <div className="p-4">
                  <Button variant="outline" className="min-h-11 w-full" disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? <Spinner size="sm" label="در حال بارگذاری…" /> : "بیشتر"}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConversationRow({ c, href, active, unread, now }: { c: Conversation; href: string; active: boolean; unread: boolean; now: Date | null }) {
  const name = customerName(c);
  const phoneOnly = !c.customer.display_name?.trim() && !!c.customer.phone;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-24 items-start gap-3 px-4 py-4 transition-colors duration-(--motion) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active && "bg-accent/60",
      )}
    >
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {unread && (
            <span className="size-2 shrink-0 rounded-full bg-brand">
              <span className="sr-only">خوانده‌نشده</span>
            </span>
          )}
          <span className={cn("min-w-0 truncate leading-6", unread ? "font-bold" : "font-semibold")}>
            {phoneOnly ? <bdi dir="ltr">{fa(name)}</bdi> : name}
          </span>
          <ChannelIcon kind={c.channel_kind} />
          <time dateTime={c.last_message_at} className="ms-auto shrink-0 text-xs text-muted-foreground">
            {now ? relativeTime(c.last_message_at, now) : ""}
          </time>
        </div>
        <p className={cn("truncate text-sm leading-6", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {c.last_message?.sender === "ai" ? "دستیار: " : c.last_message?.sender === "human" ? "شما: " : ""}
          {messagePreview(c.last_message)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateBadge state={c.state} />
          {c.state === "handoff" && <Badge variant="outline" className="min-w-0 truncate">{handoffReasonLabel(c.handoff)}</Badge>}
          {c.state === "handoff" && <PriorityBadge priority={c.handoff?.priority} />}
          {c.queue && <Badge variant="secondary">صف {QUEUE_LABEL[c.queue]}</Badge>}
          {c.related_order && (
            <Badge variant="secondary">
              سفارش <bdi dir="ltr" className="ms-1">{c.related_order.code}</bdi>
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

const HAS_ORDER_OPTIONS = [
  { value: "", label: "فرقی نمی‌کند" },
  { value: "true", label: "سفارش ثبت شده" },
  { value: "false", label: "بدون سفارش" },
];

/** The filters the narrow list has no room for. Each change is a new URL, so the list starts over from page one. */
function FiltersSheet({
  open,
  onOpenChange,
  filters,
  setFilters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ListFilters;
  setFilters: (next: Partial<ListFilters>) => void;
}) {
  const id = React.useId();
  const set = <K extends keyof ListFilters>(key: K) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFilters({ [key]: e.target.value || undefined } as Partial<ListFilters>);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="فیلترها">
      <div className="flex flex-col gap-4">
        <Field label="صف" htmlFor={`${id}-queue`}>
          <Select
            id={`${id}-queue`}
            value={filters.queue ?? ""}
            onChange={set("queue")}
            options={[{ value: "", label: "همه‌ی صف‌ها" }, ...QUEUES.map((q) => ({ value: q, label: QUEUE_LABEL[q] }))]}
          />
        </Field>
        <Field label="اولویت" htmlFor={`${id}-priority`}>
          <Select
            id={`${id}-priority`}
            value={filters.priority ?? ""}
            onChange={set("priority")}
            options={[{ value: "", label: "همه‌ی اولویت‌ها" }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))]}
          />
        </Field>
        <Field label="دلیل سپردن به شما" htmlFor={`${id}-reason`}>
          <Select
            id={`${id}-reason`}
            value={filters.reasonClass ?? ""}
            onChange={set("reasonClass")}
            options={[{ value: "", label: "همه‌ی دلیل‌ها" }, ...REASON_CLASSES.map((r) => ({ value: r, label: handoffClassLabel(r) }))]}
          />
        </Field>
        <Field label="وضعیت گفت‌وگو" htmlFor={`${id}-status`}>
          <Select
            id={`${id}-status`}
            value={filters.status ?? ""}
            onChange={set("status")}
            options={[{ value: "", label: "همه‌ی وضعیت‌ها" }, ...STATUSES.map((v) => ({ value: v, label: STATUS_LABEL[v] }))]}
          />
        </Field>
        <Field label="سفارش" htmlFor={`${id}-order`}>
          <Select
            id={`${id}-order`}
            value={filters.hasOrder === undefined ? "" : String(filters.hasOrder)}
            onChange={(e) => setFilters({ hasOrder: e.target.value === "" ? undefined : e.target.value === "true" })}
            options={HAS_ORDER_OPTIONS}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground/90">آخرین پیام تا تاریخ</span>
          <DatePicker
            value={dayToPicker(filters.until)}
            onChange={(d) => setFilters({ until: d ? pickedDay(d) : undefined })}
            placeholder="تا تاریخ"
            compact
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button className="min-h-11 flex-1" onClick={() => onOpenChange(false)}>
            دیدن نتیجه
          </Button>
          {sheetFilterCount(filters) > 0 && (
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => setFilters({ queue: undefined, priority: undefined, reasonClass: undefined, status: undefined, hasOrder: undefined, until: undefined })}
            >
              <FilterX className="size-4" strokeWidth={1.5} aria-hidden />
              پاک کردن
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
