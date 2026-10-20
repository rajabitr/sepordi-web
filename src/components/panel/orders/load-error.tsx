import Link from "next/link";
import { RotateCw } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

/** A read that failed: the seller's Farsi, the request id for support, and one way out. */
export function LoadError({
  title = "اطلاعات بارگذاری نشد",
  message,
  requestId,
  retryHref,
  retryLabel = "تلاش دوباره",
}: {
  title?: string;
  message: string;
  requestId?: string;
  retryHref?: string;
  retryLabel?: string;
}) {
  return (
    <Alert variant="destructive" title={title}>
      <p>{message}</p>
      {requestId && (
        <p className="mt-1 text-xs text-muted-foreground">
          کد پیگیری برای پشتیبانی: <span dir="ltr" className="font-mono select-all">{requestId}</span>
        </p>
      )}
      {retryHref && (
        <Link href={retryHref} className={buttonVariants({ variant: "outline", size: "md", className: "mt-3 min-h-11" })}>
          <RotateCw className="size-4" strokeWidth={1.5} />
          {retryLabel}
        </Link>
      )}
    </Alert>
  );
}
