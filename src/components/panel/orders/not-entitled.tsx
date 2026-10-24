import Link from "next/link";
import { Lock } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** A section the shop's plan leaves out: a calm state with the way to the plan, never a load error. */
export function NotEntitled({ description, className = "min-h-80 justify-center" }: { description?: string; className?: string }) {
  return (
    <EmptyState
      icon={Lock}
      className={className}
      title="این بخش در پلن فروشگاه شما فعال نیست"
      description={description}
      action={
        <Link href="/panel/credit" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
          پلن و اعتبار
        </Link>
      }
    />
  );
}
