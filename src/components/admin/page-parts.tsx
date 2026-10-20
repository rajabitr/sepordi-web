import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A failed Partner API call: the Farsi reason and, when Bizin answered, the request id support asks for. */
export function ApiError({ message, requestId, title = "این بخش بارگذاری نشد", className }: { message: string; requestId?: string; title?: string; className?: string }) {
  return (
    <Alert variant="destructive" title={title} className={className}>
      <p>{message}</p>
      {requestId && <RequestId id={requestId} />}
    </Alert>
  );
}

export function RequestId({ id }: { id: string }) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      کد پیگیری: <bdi dir="ltr" className="font-mono select-all">{id}</bdi>
    </p>
  );
}

export function Section({ title, description, actions, children, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-surface border border-border bg-card p-4 sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Label/value rows; `ltr` values (ids, keys, URLs) keep their natural order. */
export function KeyValues({ items }: { items: { label: string; value: React.ReactNode; ltr?: boolean }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className={cn("min-w-0 break-words text-sm", i.ltr && "font-mono")}>{i.ltr ? <bdi dir="ltr">{i.value}</bdi> : i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  brand: "bg-accent text-brand-ink",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export function SectionSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-surface border border-border bg-card p-4 sm:p-6", className)} aria-hidden>
      <Skeleton className="mb-4 h-6 w-40" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy aria-label="در حال بارگذاری">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <SectionSkeleton rows={5} />
    </div>
  );
}
