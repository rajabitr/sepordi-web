import { Skeleton } from "@/components/ui/skeleton";

export function TopbarSessionSkeleton() {
  return (
    <>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="size-9 rounded-full" />
    </>
  );
}

/** Generic page placeholder while the session gate resolves: a title row and a few cards. */
export function PanelPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="در حال بارگذاری…">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-surface" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-surface" />
    </div>
  );
}
