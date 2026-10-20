import { CreditStateSkeleton, MyCreditOrdersSkeleton, PlansSkeleton } from "@/components/panel/credit/sections";

export default function CreditLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="در حال بارگذاری…">
      <CreditStateSkeleton />
      <PlansSkeleton />
      <MyCreditOrdersSkeleton />
    </div>
  );
}
