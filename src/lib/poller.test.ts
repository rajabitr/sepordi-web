import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type PollOutcome, startPoller } from "./poller";

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState;
  constructor(state: DocumentVisibilityState) {
    super();
    this.visibilityState = state;
  }
  set(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

const asDoc = (d: FakeDocument) => d as unknown as Document;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startPoller", () => {
  it("an immediate poller loads once in a hidden tab, then waits for the tab to show and fetches at once", async () => {
    const doc = new FakeDocument("hidden");
    const tick = vi.fn(async (): Promise<PollOutcome> => "ok");
    const stop = startPoller(tick, { intervalMs: 10_000, immediate: true }, asDoc(doc));

    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);

    doc.set("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it("a delayed poller still runs its first tick when the tab is hidden, even if it hides after starting", async () => {
    const hidden = new FakeDocument("hidden");
    const a = vi.fn();
    const stopA = startPoller(a, { intervalMs: 3000 }, asDoc(hidden));
    await vi.advanceTimersByTimeAsync(3000);
    expect(a).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(a).toHaveBeenCalledTimes(1);
    stopA();

    const shown = new FakeDocument("visible");
    const b = vi.fn();
    const stopB = startPoller(b, { intervalMs: 3000 }, asDoc(shown));
    shown.set("hidden");
    await vi.advanceTimersByTimeAsync(3000);
    expect(b).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(b).toHaveBeenCalledTimes(1);
    stopB();
  });

  it("keeps the interval while visible and doubles the wait after a rate-limited tick, up to a minute", async () => {
    const doc = new FakeDocument("visible");
    const outcomes: PollOutcome[] = ["limited", "limited", "limited", "limited", "limited", "limited", "ok", "ok"];
    const at: number[] = [];
    const t0 = Date.now();
    const stop = startPoller(
      async () => {
        at.push(Date.now() - t0);
        return outcomes.shift() ?? "ok";
      },
      { intervalMs: 5000, immediate: true },
      asDoc(doc),
    );
    await vi.advanceTimersByTimeAsync(400_000);
    stop();
    const gaps = at.slice(1, 9).map((t, i) => t - at[i]);
    expect(gaps).toEqual([10_000, 20_000, 40_000, 60_000, 60_000, 60_000, 5000, 5000]);
  });

  it("stops for good: no tick after stop, not even when the tab becomes visible", async () => {
    const doc = new FakeDocument("hidden");
    const tick = vi.fn();
    const stop = startPoller(tick, { intervalMs: 3000 }, asDoc(doc));
    stop();
    doc.set("visible");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tick).not.toHaveBeenCalled();
  });
});

describe("polling call sites", () => {
  const src = path.resolve(import.meta.dirname, "..");
  const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
  const read = (f: string) => readFileSync(path.join(src, f), "utf8");

  it("only startPoller reads tab visibility, so no hook can skip the first load of a hidden tab again", () => {
    const own = path.join("lib", "poller.ts");
    expect(files.filter((f) => f !== own && /visibilitychange|visibilityState|document\.hidden/.test(read(f)))).toEqual([]);
  });

  it.each([
    ["components/panel/inbox/use-poll.ts"],
    ["components/panel/products/use-visible-interval.ts"],
    ["components/panel/notifications/notification-bell.tsx"],
  ])("%s polls through startPoller", (f) => {
    expect(read(f)).toMatch(/startPoller\(/);
  });
});
