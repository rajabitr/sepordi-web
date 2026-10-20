import { MessagesSquare } from "lucide-react";

/** From lg up the list sits beside this; on phones the list alone is the screen. */
export default function InboxIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <MessagesSquare className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="font-semibold leading-6">یک گفت‌وگو را انتخاب کنید</p>
      <p className="max-w-xs text-sm leading-7 text-muted-foreground">
        گفت‌وگوهایی که «نیازمند شما» هستند منتظر جواب شما مانده‌اند؛ از همان‌ها شروع کنید.
      </p>
    </div>
  );
}
