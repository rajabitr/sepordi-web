"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/date";

import type { ActionResult } from "../model/result";
import { RequestId } from "../page-parts";
import { SecretOnce } from "../secret-once";

type Link = { url: string | null; expiresAt: string };

export function ActivationLinkAction({ action, ownerPending }: { action: () => Promise<ActionResult<Link>>; ownerPending: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<Link> | null>(null);

  const run = () =>
    new Promise<void>((resolve) =>
      start(async () => {
        setResult(await action());
        resolve();
      }),
    );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button size="lg" variant="brand" disabled={pending || !ownerPending} onClick={() => setConfirm(true)}>
          <Send strokeWidth={2} />
          ارسال لینک فعال‌سازی پنل پیشرفته
        </Button>
        {!ownerPending && <p className="mt-2 text-xs text-muted-foreground">لینک فقط برای مالکی ساخته می‌شود که حسابش هنوز فعال نشده است.</p>}
      </div>
      {result?.ok && result.data.url && (
        <SecretOnce title="لینک فعال‌سازی ساخته شد" value={result.data.url} onDone={() => setResult(null)}>
          <p className="text-sm">
            این لینک را فقط برای صاحب همین فروشگاه بفرستید. تا {formatDateTime(result.data.expiresAt)} معتبر است و با آن رمز پنل پیشرفته‌ی بیزین ساخته می‌شود.
          </p>
        </SecretOnce>
      )}
      {result?.ok && !result.data.url && (
        <Alert variant="info" title="این لینک قبلاً ساخته شده بود">
          بیزین لینک تکراری را دوباره نشان نمی‌دهد. اگر لینک قبلی به دست صاحب فروشگاه نرسیده، چند دقیقه بعد دوباره بسازید.
        </Alert>
      )}
      {result && !result.ok && (
        <Alert variant="destructive" title="لینک ساخته نشد">
          <p>{result.message}</p>
          {result.requestId && <RequestId id={result.requestId} />}
        </Alert>
      )}
      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="لینک فعال‌سازی ساخته شود؟"
        description="با این لینک صاحب فروشگاه برای پنل پیشرفته‌ی بیزین رمز می‌سازد. لینک فقط یک بار نمایش داده می‌شود."
        confirmText="بساز"
        onConfirm={run}
      />
    </div>
  );
}
