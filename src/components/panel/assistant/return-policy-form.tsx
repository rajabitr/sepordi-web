"use client";

import * as React from "react";
import { Save } from "lucide-react";

import { saveReturnPolicyAction, type ReturnPolicyInput } from "@/app/panel/assistant/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { en, fa } from "@/lib/utils";

import { SwitchRow } from "./assistant-form";
import { CONDITIONS_MAX, WINDOW_MAX } from "./limits";

/** `initial` null: no policy saved yet (GET answered 404 return_policy_not_set). */
export function ReturnPolicyForm({ initial }: { initial: ReturnPolicyInput | null }) {
  const { toast } = useToast();
  const [v, setV] = React.useState<ReturnPolicyInput>(initial ?? { enabled: true, window_days: 7, conditions: "" });
  const [days, setDays] = React.useState(v.window_days === null ? "" : fa(v.window_days));
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null);
  const [pending, start] = React.useTransition();

  function save() {
    const raw = en(days).replace(/\D/g, "");
    const window_days = raw === "" ? null : Number(raw);
    if (window_days !== null && window_days > WINDOW_MAX) {
      setError({ field: "window_days", message: "مهلت مرجوعی باید عددی بین ۰ تا ۳۶۵ روز باشد." });
      return;
    }
    if (v.enabled && window_days === null && !v.conditions.trim()) {
      setError({ field: "conditions", message: "برای قانون مرجوعی فعال، مهلت یا شرایط را بنویسید." });
      return;
    }
    setError(null);
    start(async () => {
      const r = await saveReturnPolicyAction({ ...v, window_days });
      if (r.ok) {
        setV(r.data);
        setDays(r.data.window_days === null ? "" : fa(r.data.window_days));
        toast({ title: "قانون مرجوعی ذخیره شد", variant: "success" });
      } else {
        setError({ field: r.field, message: r.message });
        toast({ title: "ذخیره نشد", description: failureText(r), variant: "error" });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>قانون مرجوعی</CardTitle>
        <CardDescription>
          {initial ? "دستیار وقتی مشتری درباره‌ی پس‌دادن کالا بپرسد، همین را می‌گوید." : "هنوز قانون مرجوعی ثبت نکرده‌اید. تا ثبت نکنید، دستیار درباره‌ی مرجوعی قولی نمی‌دهد."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <SwitchRow
            id="returns-enabled"
            title="مرجوعی می‌پذیرم"
            hint="خاموش یعنی دستیار می‌گوید این فروشگاه مرجوعی ندارد."
            checked={v.enabled}
            onChange={(x) => setV((s) => ({ ...s, enabled: x }))}
          />
          <Field label="مهلت مرجوعی (روز)" htmlFor="window-days" hint="از روز تحویل؛ از ۰ تا ۳۶۵. خالی یعنی مهلت مشخصی نمی‌گویید.">
            <Input
              id="window-days"
              inputMode="numeric"
              className="max-w-40"
              value={days}
              onChange={(e) => setDays(fa(en(e.target.value).replace(/\D/g, "").slice(0, 3)))}
              error={error?.field === "window_days" ? error.message : undefined}
            />
          </Field>
          <Field label="شرایط" htmlFor="conditions">
            <Textarea
              id="conditions"
              rows={4}
              maxLength={CONDITIONS_MAX}
              showCount
              value={v.conditions}
              onChange={(e) => setV((s) => ({ ...s, conditions: e.target.value }))}
              placeholder="مثال: کالا استفاده‌نشده و با برچسب باشد. هزینه‌ی ارسال برگشت با مشتری است، مگر کالا ایراد داشته باشد."
            />
            {error?.field === "conditions" && <p className="text-xs text-destructive">{error.message}</p>}
          </Field>
          {error && !error.field && <p className="text-sm text-destructive">{error.message}</p>}
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Spinner size="sm" className="text-current" /> : <Save className="size-4" strokeWidth={2} />}
              {pending ? "در حال ذخیره…" : "ذخیره‌ی قانون مرجوعی"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
