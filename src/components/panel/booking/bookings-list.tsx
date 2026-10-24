import Link from "next/link";
import { AlertTriangle, ChevronLeft } from "lucide-react";

import { formatDateShort, formatTime } from "@/lib/date";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";
import type { Booking } from "@/server/bizin/booking/types";

import { BookingStatusBadge, PaymentStateBadge } from "./badges";
import { conflictLabel, sourceLabel } from "./model";

/** One row per appointment, newest decision first or by start time, as the tab's query sorted it. */
export function BookingsList({ bookings, resourceTitle }: { bookings: Booking[]; resourceTitle: Record<string, string> }) {
  return (
    <ul className="flex flex-col gap-2">
      {bookings.map((b) => (
        <li key={b.id}>
          <Link
            href={`/panel/booking/${b.id}`}
            className="flex min-h-11 items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:bg-accent"
          >
            <div className="flex w-24 shrink-0 flex-col gap-1 text-center sm:w-32">
              <span className="text-xs text-muted-foreground">{formatDateShort(b.starts_at)}</span>
              <span className="text-base font-semibold leading-tight">{formatTime(b.starts_at)}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{b.customer_name || "مشتری بی‌نام"}</span>
                <BookingStatusBadge status={b.status} />
                {b.deposit !== null && b.deposit > 0 && <PaymentStateBadge state={b.payment_state} />}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {b.service_title}
                {resourceTitle[b.resource_id] ? ` · ${resourceTitle[b.resource_id]}` : ""}
                {b.price !== null ? ` · ${formatToman(b.price)}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                کد {fa(b.code)} · {sourceLabel(b.source)}
              </p>
              {b.conflict && (
                <p className="flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle className="size-3.5" strokeWidth={2} />
                  {conflictLabel(b.conflict)}
                </p>
              )}
            </div>
            <ChevronLeft className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
