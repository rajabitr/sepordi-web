import { cn } from "@/lib/utils";

export interface MockRow {
  label: string;
  value?: string;
  tone?: "default" | "success" | "warning" | "brand";
}

const tones = { default: "text-foreground", success: "text-success", warning: "text-warning", brand: "text-brand-ink" };

/** A small illustrative panel card for the feature pages: a titled list of label/value rows on a soft brand wash. */
export function MockCard({ icon: Icon, title, rows, footer, className }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: string; rows: MockRow[]; footer?: string; className?: string }) {
  return (
    <div aria-hidden className={cn("relative flex size-full items-center justify-center p-6", className)}>
      <div className="absolute inset-0 bg-linear-to-br from-accent to-transparent" />
      <div className="relative w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-overlay">
        <p className="flex items-center gap-2 text-sm font-semibold leading-6">
          <Icon strokeWidth={2} className="size-4 text-brand-ink" />
          {title}
        </p>
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 py-2 text-xs leading-6">
              <span className="text-muted-foreground">{r.label}</span>
              {r.value && <span className={cn("font-medium tabular-nums", tones[r.tone ?? "default"])}>{r.value}</span>}
            </li>
          ))}
        </ul>
        {footer && <p className="mt-2 rounded-lg bg-secondary px-3 text-xs leading-8 text-secondary-foreground">{footer}</p>}
      </div>
    </div>
  );
}
