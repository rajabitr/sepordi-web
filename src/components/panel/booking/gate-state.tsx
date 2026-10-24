import Link from "next/link";
import { CalendarClock, KeyRound } from "lucide-react";

import { LoadError } from "@/components/panel/orders/load-error";
import { NotEntitled } from "@/components/panel/orders/not-entitled";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { BookingGate } from "@/server/bizin/booking/gate";

/** What a shop sees while booking is not open to it: a calm state with a way out, never a raw error. */
export function BookingGateState({ gate }: { gate: Exclude<BookingGate, { state: "ready" }> }) {
  switch (gate.state) {
    case "coming_soon":
      return (
        <EmptyState
          icon={CalendarClock}
          className="min-h-80 justify-center"
          title="نوبت‌دهی به‌زودی برای فروشگاه شما فعال می‌شود"
          description="به‌محض فعال شدن، خدمت‌ها، ساعات کاری و نوبت‌های مشتری‌ها همین‌جا می‌آیند و دستیار می‌تواند در گفت‌وگو نوبت بدهد."
          action={
            <Link href="/panel" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              بازگشت به پیشخوان
            </Link>
          }
        />
      );
    case "not_entitled":
      return <NotEntitled description="نوبت‌دهی در پلن شما فعال نیست. برای افزودن آن، پلن و اعتبار را ببینید." />;
    case "no_scope":
      return (
        <EmptyState
          icon={KeyRound}
          className="min-h-80 justify-center"
          title="دسترسی نوبت‌دهی هنوز برای سپردی فعال نشده"
          description="این دسترسی را تیم سپردی از بیزین می‌گیرد؛ کاری از سمت شما لازم نیست. اگر عجله دارید، با پشتیبانی تماس بگیرید."
        />
      );
    case "error":
      return <LoadError title="نوبت‌دهی بارگذاری نشد" message={gate.message} requestId={gate.requestId} retryHref="/panel/booking" />;
  }
}
