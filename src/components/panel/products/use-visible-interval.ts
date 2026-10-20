"use client";

import * as React from "react";

import { startPoller } from "@/lib/poller";

/**
 * Runs `tick` every `ms` while `enabled`, never two at once, under the rules of `startPoller`: the first tick runs
 * even in a hidden tab, later ones only while it is visible, and a tab coming back runs one at once.
 */
export function useVisibleInterval(tick: () => Promise<void> | void, ms: number, enabled: boolean): void {
  const ref = React.useRef(tick);
  React.useEffect(() => {
    ref.current = tick;
  });

  React.useEffect(() => {
    if (!enabled) return;
    return startPoller(() => ref.current(), { intervalMs: ms });
  }, [enabled, ms]);
}
