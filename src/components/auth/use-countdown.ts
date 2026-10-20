"use client";

import * as React from "react";

/** Whole seconds left until `deadline` (epoch ms), ticking once a second; 0 once passed or when null. */
export function useCountdown(deadline: number | null): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) clearInterval(t);
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}
