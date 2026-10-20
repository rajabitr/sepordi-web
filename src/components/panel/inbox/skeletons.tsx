import { Skeleton } from "@/components/ui/skeleton";

export function ConversationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-h-24 items-start gap-3 px-4 py-4">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function InboxListSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="در حال بارگذاری گفت‌وگوها">
      <Skeleton className="h-11 w-full rounded-control" />
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-field" />
        <Skeleton className="h-11 flex-1 rounded-field" />
      </div>
      <Skeleton className="h-11 w-full rounded-field" />
      <ConversationListSkeleton />
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="در حال بارگذاری گفت‌وگو">
      <div className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-11 w-28 rounded-control" />
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        {[48, 64, 40, 56, 32].map((w, i) => (
          <div key={i} className={i % 2 ? "flex justify-end" : "flex justify-start"}>
            <Skeleton className="h-14 rounded-surface" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="border-t border-border p-4">
        <Skeleton className="h-20 w-full rounded-field" />
      </div>
    </div>
  );
}
