"use client";

import * as React from "react";
import { LogOut, MonitorSmartphone, Save } from "lucide-react";

import { changePasswordAction, endOtherSessionsAction, saveProfileAction } from "@/app/panel/settings/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatIranMobile } from "@/lib/persian";
import { fa } from "@/lib/utils";

type FieldError = { field?: string; message: string } | null;

const Pending = ({ on, icon }: { on: boolean; icon?: React.ReactNode }) => (on ? <Spinner size="sm" className="text-current" /> : <>{icon}</>);

export function ProfileForm({ initial, phone }: { initial: { display_name: string; email: string }; phone: string }) {
  const { toast } = useToast();
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<FieldError>(null);
  const [pending, start] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>مشخصات</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await saveProfileAction(v);
              if (r.ok) {
                setV(r.data);
                toast({ title: "مشخصات ذخیره شد", variant: "success" });
              } else {
                setError({ field: r.field, message: r.message });
                toast({ title: "ذخیره نشد", description: failureText(r), variant: "error" });
              }
            });
          }}
        >
          <Field label="نام نمایشی" htmlFor="display-name">
            <Input
              id="display-name"
             
              value={v.display_name}
              maxLength={80}
              autoComplete="name"
              onChange={(e) => setV((s) => ({ ...s, display_name: e.target.value }))}
              error={error?.field === "display_name" ? error.message : undefined}
            />
          </Field>
          <Field label="ایمیل" htmlFor="email" hint="اختیاری؛ برای رسید خرید و خبرهای مهم حساب.">
            <Input
              id="email"
              type="email"
              dir="ltr"
             
              value={v.email}
              autoComplete="email"
              placeholder="name@example.com"
              onChange={(e) => setV((s) => ({ ...s, email: e.target.value }))}
              error={error?.field === "email" ? error.message : undefined}
            />
          </Field>
          <Field label="شماره‌ی موبایل" hint="شماره‌ی ورود؛ برای تغییرش با پشتیبانی تماس بگیرید.">
            <p dir="ltr" className="flex h-11 items-center justify-end rounded-field border border-border bg-secondary/40 px-3 text-muted-foreground">
              {formatIranMobile(phone)}
            </p>
          </Field>
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              <Pending on={pending} icon={<Save className="size-4" strokeWidth={2} />} />
              {pending ? "در حال ذخیره…" : "ذخیره‌ی مشخصات"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordForm({ hasPassword, minLength }: { hasPassword: boolean; minLength: number }) {
  const { toast } = useToast();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [error, setError] = React.useState<FieldError>(null);
  const [pending, start] = React.useTransition();
  const [has, setHas] = React.useState(hasPassword);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{has ? "تغییر گذرواژه" : "تعیین گذرواژه"}</CardTitle>
        <CardDescription>{has ? "بعد از تغییر، از همه‌ی دستگاه‌های دیگر خارج می‌شوید." : "با گذرواژه می‌توانید بدون کد پیامکی وارد شوید."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (next.length < minLength) return setError({ field: "next", message: `گذرواژه‌ی تازه دست‌کم ${fa(minLength)} نویسه باشد.` });
            if (next !== repeat) return setError({ field: "repeat", message: "تکرار گذرواژه با خود آن یکی نیست." });
            setError(null);
            start(async () => {
              const r = await changePasswordAction({ current, next });
              if (r.ok) {
                setCurrent("");
                setNext("");
                setRepeat("");
                setHas(true);
                toast({
                  title: "گذرواژه عوض شد",
                  description: r.data.endedSessions > 0 ? `از ${fa(r.data.endedSessions)} دستگاه دیگر خارج شدید.` : undefined,
                  variant: "success",
                });
              } else {
                setError({ field: r.field, message: r.message });
              }
            });
          }}
        >
          {has && (
            <Field label="گذرواژه‌ی فعلی" htmlFor="pw-current">
              <PasswordInput id="pw-current" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} required />
              {error?.field === "current" && <p className="text-xs text-destructive">{error.message}</p>}
            </Field>
          )}
          <Field label="گذرواژه‌ی تازه" htmlFor="pw-next" hint={`دست‌کم ${fa(minLength)} نویسه.`}>
            <PasswordInput id="pw-next" strength value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} required />
            {error?.field === "next" && <p className="text-xs text-destructive">{error.message}</p>}
          </Field>
          <Field label="تکرار گذرواژه‌ی تازه" htmlFor="pw-repeat">
            <PasswordInput id="pw-repeat" value={repeat} autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} required />
            {error?.field === "repeat" && <p className="text-xs text-destructive">{error.message}</p>}
          </Field>
          {error && !error.field && <p className="text-sm text-destructive">{error.message}</p>}
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              <Pending on={pending} />
              {pending ? "در حال ذخیره…" : has ? "تغییر گذرواژه" : "تعیین گذرواژه"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SessionsCard({ others }: { others: number }) {
  const { toast } = useToast();
  const [count, setCount] = React.useState(others);
  const [confirm, setConfirm] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>دستگاه‌ها و خروج</CardTitle>
        <CardDescription>
          {count > 0 ? `حساب شما در ${fa(count)} دستگاه یا مرورگر دیگر هم باز است.` : "حساب شما فقط در همین مرورگر باز است."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="outline" className="h-11" disabled={count === 0} onClick={() => setConfirm(true)}>
          <MonitorSmartphone className="size-4" strokeWidth={1.5} />
          خروج از دستگاه‌های دیگر
        </Button>
        <form method="post" action="/logout">
          <Button type="submit" variant="ghost" className="h-11 text-destructive hover:text-destructive">
            <LogOut className="size-4" strokeWidth={1.5} />
            خروج از حساب
          </Button>
        </form>
      </CardContent>
      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="از دستگاه‌های دیگر خارج شوید؟"
        description="هر جای دیگری که وارد شده‌اید، دوباره باید وارد شود. همین مرورگر وارد می‌ماند."
        confirmText="بله، خارج شو"
        destructive
        onConfirm={async () => {
          const r = await endOtherSessionsAction();
          if (r.ok) {
            setCount(0);
            toast({ title: "از دستگاه‌های دیگر خارج شدید", variant: "success" });
          } else toast({ title: "انجام نشد", description: failureText(r), variant: "error" });
        }}
      />
    </Card>
  );
}
