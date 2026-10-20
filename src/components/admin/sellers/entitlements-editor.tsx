"use client";

import { useState, useTransition } from "react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { en, fa, faNumber } from "@/lib/utils";

import { FEATURE_FA, LIMIT_FA, SOURCE_FA, label } from "../model/labels";
import type { ActionResult } from "../model/result";
import { Pill } from "../page-parts";

interface Feature {
  allowed: boolean;
  source: "contract" | "tenant" | "operator";
  over_contract?: boolean;
}
interface Limit {
  value: number | null;
  used: number;
  source: "contract" | "tenant" | "operator";
  over_contract?: boolean;
}

export interface EntitlementsChange {
  features: Record<string, boolean | null>;
  limits: Record<string, number | null>;
}

const NARROWABLE = ["channels.max", "products.max"];

/**
 * sepordi may only narrow what the contract gives a shop: switch a contract feature off, lower a limit, or drop its
 * own narrowing. What Bizin support decided is read-only here.
 */
export function EntitlementsEditor({
  features,
  limits,
  action,
}: {
  features: Record<string, Feature>;
  limits: Record<string, Limit>;
  action: (change: EntitlementsChange) => Promise<ActionResult>;
}) {
  const { toast } = useToast();
  const [featureChange, setFeatureChange] = useState<Record<string, boolean | null>>({});
  const [limitDraft, setLimitDraft] = useState<Record<string, string>>({});
  const [limitError, setLimitError] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  function featureOn(key: string, f: Feature): boolean {
    if (key in featureChange) return featureChange[key] === null;
    return f.allowed;
  }

  function toggle(key: string, f: Feature, on: boolean) {
    setFeatureChange((c) => {
      const next = { ...c };
      if (on === f.allowed) delete next[key];
      else next[key] = on ? null : false;
      return next;
    });
  }

  function limitChange(): { limits: Record<string, number | null>; errors: Record<string, string> } {
    const out: Record<string, number | null> = {};
    const errors: Record<string, string> = {};
    for (const [key, raw] of Object.entries(limitDraft)) {
      const s = en(raw).trim();
      if (s === "") continue;
      if (!/^\d+$/.test(s)) {
        errors[key] = "یک عدد صحیح وارد کنید.";
        continue;
      }
      out[key] = Number(s);
    }
    return { limits: out, errors };
  }

  const pendingLimits = limitChange();
  const changes = Object.keys(featureChange).length + Object.keys(pendingLimits.limits).length;

  function resetLimit(key: string) {
    start(async () => {
      const r = await action({ features: {}, limits: { [key]: null } });
      toast(r.ok ? { title: "سقف به قرارداد برگشت.", variant: "success" } : { title: "ذخیره نشد", description: r.message, variant: "error" });
    });
  }

  async function save() {
    const { limits: l, errors } = limitChange();
    setLimitError(errors);
    if (Object.keys(errors).length) return;
    const r = await action({ features: featureChange, limits: l });
    if (r.ok) {
      setFeatureChange({});
      setLimitDraft({});
      toast({ title: "امکانات فروشگاه ذخیره شد.", variant: "success" });
    } else {
      toast({ title: "ذخیره نشد", description: r.requestId ? `${r.message} (کد پیگیری: ${r.requestId})` : r.message, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col divide-y divide-border">
        {Object.entries(features).map(([key, f]) => {
          const operator = f.source === "operator";
          const notInContract = !f.allowed && f.source === "contract";
          const id = `feature-${key}`;
          return (
            <li key={key} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <label htmlFor={id} className="block font-medium">{label(FEATURE_FA, key)}</label>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  تعیین‌شده با: {label(SOURCE_FA, f.source)}
                  {f.over_contract && <Pill tone="warning">کانال وصل خارج از قرارداد</Pill>}
                  {key in featureChange && <Pill tone="brand">تغییر ذخیره‌نشده</Pill>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {notInContract && <span className="text-xs text-muted-foreground">در قرارداد نیست</span>}
                {operator && <span className="text-xs text-muted-foreground">فقط پشتیبانی بیزین</span>}
                <Switch
                  id={id}
                  aria-label={label(FEATURE_FA, key)}
                  checked={featureOn(key, f)}
                  disabled={operator || notInContract || pending}
                  onCheckedChange={(on) => toggle(key, f, on)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        {NARROWABLE.filter((k) => limits[k]).map((key) => {
          const l = limits[key];
          const id = `limit-${key}`;
          return (
            <div key={key} className="flex flex-col gap-2 rounded-xl border border-border p-4">
              <label htmlFor={id} className="font-medium">{label(LIMIT_FA, key)}</label>
              <p className="text-xs text-muted-foreground">
                استفاده‌شده {faNumber(l.used)} از {l.value === null ? "نامحدود" : faNumber(l.value)} · {label(SOURCE_FA, l.source)}
                {l.over_contract && " · بیش از سقف"}
              </p>
              <Input
                id={id}
                dir="ltr"
                inputMode="numeric"
                placeholder={l.value === null ? "سقف تازه" : fa(l.value)}
                value={limitDraft[key] ?? ""}
                onChange={(e) => setLimitDraft((d) => ({ ...d, [key]: e.target.value }))}
                error={limitError[key]}
                disabled={l.source === "operator" || pending}
              />
              {l.source === "tenant" && (
                <Button variant="ghost" size="lg" className="self-start" disabled={pending} onClick={() => resetLimit(key)}>
                  برگرداندن به سقف قرارداد
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={changes === 0 || pending} onClick={() => setConfirm(true)}>
          ذخیره‌ی امکانات
        </Button>
        {changes > 0 && <span className="text-sm text-muted-foreground">{fa(changes)} تغییر ذخیره‌نشده</span>}
      </div>

      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="امکانات این فروشگاه تغییر کند؟"
        description="امکانی که خاموش شود برای همین فروشگاه از دسترس خارج می‌شود؛ کانالی که وصل است قطع نمی‌شود. بیزین رویداد تغییر امکانات را می‌فرستد."
        confirmText="ذخیره"
        destructive
        onConfirm={save}
      />
    </div>
  );
}
