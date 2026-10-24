import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { paymentMeta, statusMeta } from "./model";

const dot = "before:me-1.5 before:inline-block before:size-1.5 before:rounded-full before:bg-current";

export function BookingStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = statusMeta(status);
  return (
    <Badge variant={m.tone} className={cn(dot, className)}>
      {m.label}
    </Badge>
  );
}

export function PaymentStateBadge({ state, className }: { state: string; className?: string }) {
  const m = paymentMeta(state);
  return (
    <Badge variant={m.tone} className={cn(dot, className)}>
      {m.label}
    </Badge>
  );
}
