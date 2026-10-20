import { Skeleton } from "@/components/ui/skeleton";

/** The form's shape while the session is read. */
export function AuthSkeleton({ stepper }: { stepper?: boolean }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {stepper && <Skeleton className="h-12 w-full" />}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-11 w-full" />
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
