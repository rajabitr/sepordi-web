export type PollOutcome = "ok" | "limited" | "error";

const MAX_BACKOFF_MS = 60_000;

type VisibilitySource = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

/**
 * Runs `tick` every `intervalMs` (first at once with `immediate`), never two at once, and returns the stop function.
 * The first tick always runs, even in a hidden tab, so a screen opened in the background still loads. Later ticks run
 * only while the tab is visible, because every tick spends the partner's shared request budget; a tab coming back
 * runs one at once. A tick that answers "limited" or "error", or throws, doubles the wait up to a minute.
 */
export function startPoller(
  tick: () => Promise<PollOutcome | void> | PollOutcome | void,
  { intervalMs, immediate = false }: { intervalMs: number; immediate?: boolean },
  doc: VisibilitySource = document,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wait = intervalMs;
  let first = true;
  let running = false;
  let stopped = false;
  const visible = () => doc.visibilityState === "visible";

  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && (first || visible())) timer = setTimeout(run, wait);
  };
  const run = async () => {
    if (running || stopped || (!first && !visible())) return;
    first = false;
    running = true;
    let outcome: PollOutcome = "error";
    try {
      outcome = (await tick()) ?? "ok";
    } finally {
      running = false;
      wait = outcome === "ok" ? intervalMs : Math.min(wait * 2, MAX_BACKOFF_MS);
      schedule();
    }
  };
  const onVisibility = () => {
    if (visible()) void run();
    else if (!first) clearTimeout(timer);
  };

  if (immediate) void run();
  else schedule();
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    clearTimeout(timer);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
