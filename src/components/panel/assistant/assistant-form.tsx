"use client";

import * as React from "react";
import { Save } from "lucide-react";

import { saveAssistantAction, type AssistantInput } from "@/app/panel/assistant/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { faNumber } from "@/lib/utils";

import { checkKnowledge, compileKnowledge } from "./knowledge";
import { KnowledgeEditor } from "./knowledge-editor";
import { PERSONA_MAX, PROFILE_MAX } from "./limits";

const LANGS = [
  { value: "fa", label: "فارسی" },
  { value: "en", label: "انگلیسی" },
  { value: "ar", label: "عربی" },
];

/** A whole-row label: the 44px target is the row, the switch only shows the state. */
export function SwitchRow({ id, title, hint, checked, onChange }: { id: string; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function AssistantForm({ initial }: { initial: AssistantInput }) {
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initial);
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [rev, setRev] = React.useState(0);

  const set = <K extends keyof AssistantInput>(k: K, value: AssistantInput[K]) => setV((s) => ({ ...s, [k]: value }));
  const answering = v.enabled && v.auto_reply;
  const wasAnswering = saved.enabled && saved.auto_reply;
  const flat = (x: AssistantInput) => JSON.stringify([x.enabled, x.auto_reply, x.reply_language, x.persona_name, compileKnowledge(x.knowledge)]);
  const dirty = flat(v) !== flat(saved);
  const knowledge = checkKnowledge(v.knowledge);
  const overCap = !knowledge.ok && knowledge.field === "business_profile";

  function save() {
    setError(null);
    if (!knowledge.ok) {
      setError({ field: knowledge.field, message: knowledge.message });
      return;
    }
    start(async () => {
      const r = await saveAssistantAction(v);
      if (r.ok) {
        setSaved(r.data);
        setV(r.data);
        setRev((n) => n + 1);
        toast({ title: "تنظیمات دستیار ذخیره شد", variant: "success" });
      } else {
        setError({ field: r.field, message: r.message });
        toast({ title: "ذخیره نشد", description: failureText(r), variant: "error" });
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (wasAnswering && !answering) setConfirm(true);
        else save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>روشن و خاموش</CardTitle>
          <CardDescription>دستیار فقط وقتی به مشتری جواب می‌دهد که هر دو کلید روشن باشند.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          <SwitchRow id="assistant-enabled" title="دستیار هوشمند" hint="کلید اصلی؛ خاموش که باشد دستیار هیچ کاری نمی‌کند." checked={v.enabled} onChange={(x) => set("enabled", x)} />
          <SwitchRow
            id="assistant-auto"
            title="پاسخ خودکار"
            hint="پیام را بدون تأیید شما برای مشتری می‌فرستد."
            checked={v.auto_reply}
            onChange={(x) => set("auto_reply", x)}
          />
          <div className="pt-4">
            {answering ? (
              <Alert variant="success" title="دستیار به پیام‌ها جواب می‌دهد" />
            ) : (
              <Alert variant="warning" title="دستیار الان جواب نمی‌دهد">
                {!v.enabled ? "کلید «دستیار هوشمند» خاموش است." : "کلید «پاسخ خودکار» خاموش است؛ گفت‌وگوها منتظر شما می‌مانند."}
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>دستیار چطور حرف بزند</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="زبان پاسخ" hint="دستیار به این زبان به مشتری جواب می‌دهد.">
            <SegmentedControl aria-label="زبان پاسخ" options={LANGS} value={v.reply_language} onChange={(x) => set("reply_language", x as AssistantInput["reply_language"])} />
          </Field>
          <Field label="نام دستیار" htmlFor="persona" hint="مثلاً «سارا از فروشگاه نیلا». خالی بگذارید تا نام فروشگاه گفته شود.">
            <Input
              id="persona"
             
              value={v.persona_name}
              maxLength={PERSONA_MAX}
              onChange={(e) => set("persona_name", e.target.value)}
              error={error?.field === "persona_name" ? error.message : undefined}
            />
          </Field>
        </CardContent>
      </Card>

      {compileKnowledge(saved.knowledge) === "" && (
        <Alert variant="warning" title="دانش‌نامه‌ی دستیار هنوز خالی است">
          تا خالی باشد، دستیار جواب سؤال‌هایی مثل ساعت کاری، ارسال و پرداخت را ندارد و گفت‌وگوهای بیشتری را به شما می‌سپارد.
        </Alert>
      )}
      <KnowledgeEditor key={rev} value={v.knowledge} onChange={(d) => set("knowledge", d)} error={error} />

      {error && !error.field && <Alert variant="destructive" title="ذخیره نشد">{error.message}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || !dirty || overCap}>
          {pending ? <Spinner size="sm" className="text-current" /> : <Save className="size-4" strokeWidth={2} />}
          {pending ? "در حال ذخیره…" : "ذخیره‌ی تنظیمات"}
        </Button>
        {overCap ? (
          <span className="text-sm text-destructive">متن دانش‌نامه بیشتر از {faNumber(PROFILE_MAX)} نویسه است و ذخیره نمی‌شود.</span>
        ) : (
          dirty && !pending && <span className="text-sm text-muted-foreground">تغییرات ذخیره نشده دارید.</span>
        )}
      </div>

      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="دستیار خاموش شود؟"
        description="بعد از ذخیره، دستیار دیگر به پیام مشتری‌ها جواب نمی‌دهد و همه‌ی گفت‌وگوها منتظر شما می‌مانند."
        confirmText="بله، ذخیره کن"
        destructive
        onConfirm={() => {
          setConfirm(false);
          save();
        }}
      />
    </form>
  );
}
