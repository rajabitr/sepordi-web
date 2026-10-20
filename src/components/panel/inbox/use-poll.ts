"use client";

import * as React from "react";

import { type PollOutcome, startPoller } from "@/lib/poller";

import type { FaError, Result } from "./model";

export type { PollOutcome };

/**
 * Runs `tick` every `intervalMs` (first at once with `immediate`) under the rules of `startPoller`: the first tick
 * loads even in a hidden tab, later ones wait for a visible tab, and a rate-limited or failed tick backs off.
 */
export function usePoll(
  tick: () => Promise<PollOutcome>,
  intervalMs: number,
  { enabled = true, immediate = false }: { enabled?: boolean; immediate?: boolean } = {},
): void {
  const latest = React.useRef(tick);
  React.useEffect(() => {
    latest.current = tick;
  });

  React.useEffect(() => {
    if (!enabled) return;
    return startPoller(() => latest.current(), { intervalMs, immediate });
  }, [intervalMs, enabled, immediate]);
}

const OFFLINE: FaError = { message: "اتصال اینترنت برقرار نیست یا سرور جواب نداد. دوباره امتحان کنید.", code: "network_error" };

/** Fetches one of our own inbox routes; every failure comes back as a Farsi error, never a throw. */
export async function fetchResult<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Result<T>> {
  const { timeoutMs = 35_000, ...rest } = init ?? {};
  try {
    const res = await fetch(url, { cache: "no-store", ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) });
    const body = (await res.json().catch(() => null)) as Result<T> | null;
    if (body && typeof body === "object" && "ok" in body) return body;
    return { ok: false, error: OFFLINE };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

export function outcomeOf(r: Result<unknown>): PollOutcome {
  if (r.ok) return "ok";
  return r.error.code === "rate_limited" ? "limited" : "error";
}
