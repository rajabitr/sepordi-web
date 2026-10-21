"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cable, MessagesSquare, SearchX } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { relativeTime } from "@/lib/date";
import { cn, fa } from "@/lib/utils";

import {
  CHANNEL_LABEL,
  CHANNELS,
  customerName,
  filtersFromSearch,
  filtersToSearch,
  messagePreview,
  QUEUE_LABEL,
  QUEUES,
  type Conversation,
  type FaError,
  type ListFilters,
  type StateTab,
} from "./model";
import { handoffReasonLabel } from "./handoff-reason";
import { ChannelIcon, InlineError, PriorityBadge, StateBadge } from "./parts";
import { ConversationListSkeleton } from "./skeletons";
import { fetchResult, outcomeOf, usePoll } from "./use-poll";

const LIST_POLL_MS = 10_000;

const TABS: { value: StateTab; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "handoff", label: "نیازمند شما" },
  { value: "human", label: "در دست شما" },
  { value: "ai", label: "دستیار" },
];

type Page = { conversations: Conversation[]; next_cursor: string | null };

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
  const morePages = React.useRef(false);

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
      setError(null);
    } else {
      setError(r.error);
    }
    setNow(new Date());
    return outcomeOf(r);
  }, [url]);

  usePoll(refresh, LIST_POLL_MS, { immediate: true });

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
  }

  function setFilters(next: Partial<ListFilters>) {
    const qs = filtersToSearch({ ...filters, ...next }).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = filters.state !== "all" || !!filters.channel || !!filters.queue || !!filters.q;
  const activeId = pathname.split("/")[3];

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
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="کانال"
           
            value={filters.channel ?? ""}
            onChange={(e) => setFilters({ channel: (e.target.value || undefined) as ListFilters["channel"] })}
            options={[{ value: "", label: "همه‌ی کانال‌ها" }, ...CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))]}
          />
          <Select
            aria-label="صف"
           
            value={filters.queue ?? ""}
            onChange={(e) => setFilters({ queue: (e.target.value || undefined) as ListFilters["queue"] })}
            options={[{ value: "", label: "همه‌ی صف‌ها" }, ...QUEUES.map((q) => ({ value: q, label: QUEUE_LABEL[q] }))]}
          />
        </div>
      </div>

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
                    <ConversationRow c={c} href={`/panel/inbox/${c.id}${filterKey ? `?${filterKey}` : ""}`} active={c.id === activeId} now={now} />
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

function ConversationRow({ c, href, active, now }: { c: Conversation; href: string; active: boolean; now: Date | null }) {
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
          <span className="min-w-0 truncate font-semibold leading-6">{phoneOnly ? <bdi dir="ltr">{fa(name)}</bdi> : name}</span>
          <ChannelIcon kind={c.channel_kind} />
          <time dateTime={c.last_message_at} className="ms-auto shrink-0 text-xs text-muted-foreground">
            {now ? relativeTime(c.last_message_at, now) : ""}
          </time>
        </div>
        <p className="truncate text-sm leading-6 text-muted-foreground">
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
