"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import { cn } from "@/lib/utils";

/*
 * Phones show the list or the thread, one screen each; from lg up both panes sit side by side. The height is the
 * viewport less the panel frame's topbar, its main padding and (below lg) its bottom bar, so each pane scrolls on
 * its own and the composer stays in view.
 */
export function InboxShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const threadOpen = useSelectedLayoutSegment() !== null;
  return (
    <>
      <h1 className="sr-only">صندوق پیام</h1>
      <div className="flex h-[calc(100dvh-11.5rem)] min-h-96 overflow-hidden rounded-surface border border-border bg-card lg:h-[calc(100dvh-8rem)]">
        <section
          aria-label="فهرست گفت‌وگوها"
          className={cn("min-h-0 w-full flex-col border-border lg:flex lg:w-96 lg:shrink-0 lg:border-e", threadOpen ? "hidden" : "flex")}
        >
          {list}
        </section>
        <section aria-label="گفت‌وگو" className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", threadOpen ? "flex" : "hidden")}>
          {children}
        </section>
      </div>
    </>
  );
}
