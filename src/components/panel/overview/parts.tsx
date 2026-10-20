import { AlertCircle } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A failed read, in Farsi, with the request id support asks for. */
export function LoadError({ message, requestId, title = "این بخش بارگذاری نشد", className }: { message: string; requestId?: string; title?: string; className?: string }) {
  return (
    <Alert variant="destructive" icon={AlertCircle} title={title} className={className}>
      <p>{message}</p>
      {requestId && !message.includes(requestId) && (
        <p className="mt-1 text-xs text-muted-foreground">
          کد پیگیری: <span dir="ltr" className="font-mono">{requestId}</span>
        </p>
      )}
    </Alert>
  );
}
