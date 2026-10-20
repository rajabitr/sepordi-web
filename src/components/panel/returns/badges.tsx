import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { caseStateMeta } from "./model";

export function CaseStateBadge({ state, className }: { state: string; className?: string }) {
  const m = caseStateMeta(state);
  return (
    <Badge
      variant={m.tone}
      className={cn("before:me-1.5 before:inline-block before:size-1.5 before:rounded-full before:bg-current", className)}
    >
      {m.label}
    </Badge>
  );
}
