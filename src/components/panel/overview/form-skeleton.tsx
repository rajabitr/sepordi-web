import { Skeleton } from "@/components/ui/skeleton";

/** A settings page while it loads: cards of label + field rows. */
export function FormPageSkeleton({ cards = 2, rows = 3 }: { cards?: number; rows?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="در حال بارگذاری…">
      {Array.from({ length: cards }, (_, c) => (
        <div key={c} className="flex flex-col gap-5 rounded-surface border border-border bg-card p-5">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      ))}
      <Skeleton className="h-12 w-40" />
    </div>
  );
}
