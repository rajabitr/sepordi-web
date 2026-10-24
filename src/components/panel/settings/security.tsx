"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Copy, KeyRound, LogOut, MonitorSmartphone, ShieldCheck, ShieldOff } from "lucide-react";

import { endOtherSessionsAction } from "@/app/panel/settings/actions";
import { beginTwoStepAction, confirmTwoStepAction, disableTwoStepAction } from "@/app/panel/settings/security/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { OtpField } from "@/components/ui/otp-field";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/date";
import { fa } from "@/lib/utils";

type Enrolment = { qr: string; secret: string };

/** Off → QR and manual key → code → recovery codes shown once → on. On: disable with password and a code. */
export function TwoStepCard({ enabled, offered, recoveryLeft }: { enabled: boolean; offered: boolean; recoveryLeft: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [enrolment, setEnrolment] = React.useState<Enrolment | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();

  if (codes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>کدهای پشتیبان</CardTitle>
          <CardDescription>ورود دومرحله‌ای روشن شد. این کدها فقط همین یک بار نشان داده می‌شوند؛ جایی امن نگهشان دارید. هر کد یک بار کار می‌کند.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-control border border-border bg-secondary p-4 font-mono text-base">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                void navigator.clipboard?.writeText(codes.join("\n"));
                toast({ title: "کدها کپی شد", variant: "success" });
              }}
            >
              <Copy className="size-4" strokeWidth={1.5} />
              کپی کدها
            </Button>
            <Button
              className="h-11"
              onClick={() => {
                setCodes(null);
                router.refresh();
              }}
            >
              ذخیره کردم
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (enabled) return <DisableTwoStep recoveryLeft={recoveryLeft} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ورود دومرحله‌ای</CardTitle>
        <CardDescription>
          بعد از رمز عبور یا کد پیامکی، یک کد ۶ رقمی از برنامه‌ی احراز هویت گوشی‌تان (مثل Google Authenticator یا Microsoft Authenticator) هم پرسیده
          می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!offered ? (
          <Alert variant="info" title="فقط برای مالک فروشگاه">
            ورود دومرحله‌ای فعلاً برای حساب مالک فروشگاه فعال می‌شود.
          </Alert>
        ) : !enrolment ? (
          <div>
            <Button
              className="h-11"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await beginTwoStepAction();
                  if (r.ok) setEnrolment(r.data);
                  else toast({ title: "شروع نشد", description: failureText(r), variant: "error" });
                })
              }
            >
              {pending ? <Spinner size="sm" className="text-current" /> : <ShieldCheck className="size-4" strokeWidth={2} />}
              فعال‌سازی ورود دومرحله‌ای
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(undefined);
              start(async () => {
                const r = await confirmTwoStepAction(code);
                if (r.ok) setCodes(r.data.recoveryCodes);
                else {
                  setError(r.message);
                  setCode("");
                }
              });
            }}
          >
            <ol className="flex list-inside list-decimal flex-col gap-2 text-base">
              <li>برنامه‌ی احراز هویت را باز کنید و این کد QR را اسکن کنید.</li>
              <li>اگر اسکن نشد، کلید زیر را دستی وارد کنید.</li>
              <li>کد ۶ رقمی‌ای را که برنامه نشان می‌دهد این‌جا بنویسید.</li>
            </ol>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn on the server */}
              <img src={enrolment.qr} alt="کد QR ورود دومرحله‌ای" width={192} height={192} className="aspect-square size-48 rounded-control border border-border bg-background" />
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-sm text-muted-foreground">کلید دستی</span>
                <code dir="ltr" className="break-all rounded-control bg-secondary px-3 py-2 font-mono text-base">
                  {enrolment.secret.replace(/(.{4})/g, "$1 ").trim()}
                </code>
              </div>
            </div>
            <Field label="کد برنامه" htmlFor="totp-confirm">
              <OtpField value={code} onChange={setCode} disabled={pending} aria-label="کد ۶ رقمی برنامه" />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </Field>
            <div>
              <Button type="submit" className="h-11" disabled={pending || code.length !== 6}>
                {pending && <Spinner size="sm" className="text-current" />}
                تأیید و روشن کردن
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function DisableTwoStep({ recoveryLeft }: { recoveryLeft: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>ورود دومرحله‌ای</CardTitle>
          <Badge variant="success">روشن</Badge>
        </div>
        <CardDescription>
          {recoveryLeft > 0 ? `${fa(recoveryLeft)} کد پشتیبان استفاده‌نشده دارید.` : "همه‌ی کدهای پشتیبان مصرف شده‌اند؛ برای کدهای تازه، ورود دومرحله‌ای را خاموش و دوباره روشن کنید."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
            <ShieldOff className="size-4" strokeWidth={1.5} />
            خاموش کردن
          </Button>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(undefined);
              start(async () => {
                const r = await disableTwoStepAction({ password, code });
                if (r.ok) {
                  toast({ title: "ورود دومرحله‌ای خاموش شد", variant: "success" });
                  router.refresh();
                } else setError(r.message);
              });
            }}
          >
            <Field label="رمز عبور" htmlFor="totp-off-password">
              <PasswordInput id="totp-off-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="کد برنامه یا کد پشتیبان" htmlFor="totp-off-code">
              <Input id="totp-off-code" dir="ltr" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="destructive" className="h-11" disabled={pending || !password || !code.trim()}>
                {pending ? <Spinner size="sm" className="text-current" /> : <KeyRound className="size-4" strokeWidth={2} />}
                خاموش کن
              </Button>
              <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
                انصراف
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export interface SessionView {
  current: boolean;
  createdAt: string;
  ua: string | null;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "اج"],
  [/SamsungBrowser/, "مرورگر سامسونگ"],
  [/Firefox\//, "فایرفاکس"],
  [/OPR\/|Opera/, "اپرا"],
  [/Chrome\//, "کروم"],
  [/Safari\//, "سافاری"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Android/, "اندروید"],
  [/iPhone/, "آیفون"],
  [/iPad/, "آی‌پد"],
  [/Windows/, "ویندوز"],
  [/Mac OS X|Macintosh/, "مک"],
  [/Linux/, "لینوکس"],
];

function deviceName(ua: string | null): string {
  if (!ua) return "دستگاه ناشناخته";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  if (browser && system) return `${browser} روی ${system}`;
  return browser ?? system ?? "دستگاه ناشناخته";
}

/** Every signed-in device of the account, this one marked; one action signs out all the others. */
export function SessionsList({ sessions }: { sessions: SessionView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = React.useState(false);
  const others = sessions.filter((s) => !s.current).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>دستگاه‌های واردشده</CardTitle>
        <CardDescription>{others > 0 ? `حساب شما جز این مرورگر در ${fa(others)} دستگاه دیگر هم باز است.` : "حساب شما فقط در همین مرورگر باز است."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
          {sessions.map((s, i) => (
            <li key={`${s.createdAt}-${i}`} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <MonitorSmartphone className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{deviceName(s.ua)}</span>
                <span className="text-sm text-muted-foreground">ورود: {formatDateTime(s.createdAt)}</span>
              </div>
              {s.current && <Badge variant="secondary">همین دستگاه</Badge>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="h-11" disabled={others === 0} onClick={() => setConfirm(true)}>
            <MonitorSmartphone className="size-4" strokeWidth={1.5} />
            خروج از همه‌ی دستگاه‌ها
          </Button>
          <form method="post" action="/logout">
            <Button type="submit" variant="ghost" className="h-11 text-destructive hover:text-destructive">
              <LogOut className="size-4" strokeWidth={1.5} />
              خروج از حساب
            </Button>
          </form>
        </div>
      </CardContent>
      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="از همه‌ی دستگاه‌های دیگر خارج شوید؟"
        description="هر جای دیگری که وارد شده‌اید، دوباره باید وارد شود. همین مرورگر وارد می‌ماند."
        confirmText="بله، خارج شو"
        destructive
        onConfirm={async () => {
          const r = await endOtherSessionsAction();
          if (r.ok) {
            toast({ title: "از دستگاه‌های دیگر خارج شدید", variant: "success" });
            router.refresh();
          } else toast({ title: "انجام نشد", description: failureText(r), variant: "error" });
        }}
      />
    </Card>
  );
}
