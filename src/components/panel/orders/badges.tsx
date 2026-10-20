import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { evidenceStatusMeta, orderStatusMeta, paymentStatusMeta } from "./model";

const dot = "before:me-1.5 before:inline-block before:size-1.5 before:rounded-full before:bg-current";

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = orderStatusMeta(status);
  return (
    <Badge variant={m.tone} className={cn(dot, className)}>
      {m.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = paymentStatusMeta(status);
  return (
    <Badge variant={m.tone} className={cn(dot, className)}>
      {m.label}
    </Badge>
  );
}

export function EvidenceStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = evidenceStatusMeta(status);
  return (
    <Badge variant={m.tone} className={cn(dot, className)}>
      {m.label}
    </Badge>
  );
}
