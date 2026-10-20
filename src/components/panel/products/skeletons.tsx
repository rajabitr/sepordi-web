import { Skeleton } from "@/components/ui/skeleton";

export function ProductsListSkeleton() {
  return (
    <div className="flex min-h-96 flex-col gap-4" aria-busy="true" aria-label="در حال بارگذاری محصولات…">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-sm" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 md:block" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductFormSkeleton() {
  return (
    <div className="flex min-h-96 flex-col gap-6" aria-busy="true" aria-label="در حال بارگذاری محصول…">
      <Skeleton className="h-72 rounded-surface" />
      <Skeleton className="h-56 rounded-surface" />
    </div>
  );
}

export function ImportJobsSkeleton() {
  return (
    <div className="flex min-h-48 flex-col gap-3" aria-busy="true" aria-label="در حال بارگذاری فایل‌های قبلی…">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 rounded-xl" />
      ))}
    </div>
  );
}
