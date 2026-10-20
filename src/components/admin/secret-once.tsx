"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * A value Bizin shows exactly once (a webhook secret, an activation link). Lives only in this component's state:
 * never sent back to the server, never stored, gone on reload.
 */
export function SecretOnce({
  title,
  value,
  children,
  onDone,
}: {
  title: string;
  value: string;
  children?: React.ReactNode;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Alert variant="warning" title={title} icon={KeyRound} className="flex-1">
      <div className="mt-2 flex flex-col gap-3">
        <div className="flex flex-wrap items-stretch gap-2">
          <code dir="ltr" className="min-h-11 min-w-0 flex-1 break-all rounded-control border border-border bg-background px-3 py-2 font-mono text-sm select-all">
            {value}
          </code>
          <Button variant="outline" size="lg" onClick={copy} aria-label="کپی">
            {copied ? <Check strokeWidth={2} /> : <Copy strokeWidth={1.5} />}
            {copied ? "کپی شد" : "کپی"}
          </Button>
        </div>
        <p className="font-semibold text-warning">این مقدار فقط همین یک بار نمایش داده می‌شود و سپردی آن را نگه نمی‌دارد.</p>
        {children}
        <div>
          <Button variant="secondary" size="lg" onClick={onDone}>
            ذخیره کردم، بستن
          </Button>
        </div>
      </div>
    </Alert>
  );
}
