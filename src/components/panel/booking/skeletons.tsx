import { Skeleton } from "@/components/ui/skeleton";

export function BookingListSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="در حال بارگذاری نوبت‌ها">
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function BookingFormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="در حال بارگذاری">
      <Skeleton className="h-11 w-full max-w-xl" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}
