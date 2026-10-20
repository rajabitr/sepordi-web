"use client";

import * as React from "react";

import { useToast } from "@/components/ui/toast";

import type { ActionResult } from "./model";

// Only an answer that never arrived may be retried under the same key; any decided answer starts a new intent.
const RETRY_SAME_KEY = new Set(["network_error", "timeout", "idempotency_request_in_progress"]);

/**
 * One idempotency key per seller intent (a dialog opened for one decision), reused if that intent is retried after a
 * lost answer. Toasts the outcome in Farsi with the request id for support.
 */
export function useIntent() {
  const key = React.useRef<string | null>(null);
  const { toast } = useToast();

  const begin = React.useCallback(() => {
    key.current = null;
  }, []);

  const run = React.useCallback(
    async (call: (idempotencyKey: string) => Promise<ActionResult>, done: string): Promise<ActionResult> => {
      key.current ??= crypto.randomUUID();
      let result: ActionResult;
      try {
        result = await call(key.current);
      } catch {
        result = { ok: false, code: "network_error", message: "اتصال برقرار نشد. اینترنت را بررسی کنید و دوباره امتحان کنید." };
      }
      if (result.ok) {
        key.current = null;
        toast({ title: done, variant: "success" });
      } else {
        if (!RETRY_SAME_KEY.has(result.code)) key.current = null;
        toast({
          title: result.message,
          description: result.requestId ? `کد پیگیری: ${result.requestId}` : undefined,
          variant: "error",
          duration: 8000,
        });
      }
      return result;
    },
    [toast],
  );

  return { begin, run };
}
