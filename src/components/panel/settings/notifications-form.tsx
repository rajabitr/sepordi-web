"use client";

import * as React from "react";
import { BellOff } from "lucide-react";

import { saveNotifyPrefsAction } from "@/app/panel/settings/notifications/actions";
import { failureText } from "@/components/panel/overview/action-result";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import type { NotifyFamily } from "@/server/notifications/prefs";

const FAMILIES: { key: NotifyFamily; label: string; hint: string }[] = [
  { key: "conversations", label: "گفت‌وگوها", hint: "گفت‌وگویی که به شما سپرده می‌شود، پیام تازه‌ی مشتری در آن و برگشتش به دستیار." },
  { key: "orders", label: "سفارش‌ها و رسیدها", hint: "سفارش تازه، تغییر وضعیت سفارش و رسید کارت‌به‌کارت تازه." },
  { key: "returns", label: "مرجوعی‌ها", hint: "درخواست مرجوعی، تعویض یا شکایت تازه و پاسخ مشتری به آن." },
  { key: "bookings", label: "نوبت‌ها", hint: "نوبت تازه، تغییر وضعیت یا زمان نوبت و رسید بیعانه‌ی تازه." },
  { key: "channels", label: "کانال‌ها", hint: "وصل شدن، قطع شدن یا مشکل رساندن پیام در واتس‌اپ، اینستاگرام و تلگرام." },
  { key: "credit", label: "اعتبار", hint: "تمام شدن اعتبار دستیار." },
];

/** One switch per event family; each change is saved at once, for this user in this shop only. */
export function NotificationsForm({ families, initialMuted }: { families: readonly NotifyFamily[]; initialMuted: NotifyFamily[] }) {
  const { toast } = useToast();
  const [muted, setMuted] = React.useState<NotifyFamily[]>(initialMuted);
  const [pending, start] = React.useTransition();

  const toggle = (key: NotifyFamily, on: boolean) => {
    const before = muted;
    const next = on ? muted.filter((m) => m !== key) : [...muted, key];
    setMuted(next);
    start(async () => {
      const r = await saveNotifyPrefsAction(next);
      if (r.ok) {
        setMuted(r.data.muted);
      } else {
        setMuted(before);
        toast({ title: "ذخیره نشد", description: failureText(r), variant: "error" });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>اعلان‌های زنگوله</CardTitle>
        <CardDescription>هر دسته را که خاموش کنید، دیگر در زنگوله‌ی بالای پنل برای شما نمی‌آید. این تنظیم فقط برای حساب خود شماست.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {FAMILIES.filter((f) => families.includes(f.key)).map(({ key, label, hint }) => {
            const on = !muted.includes(key);
            const id = `notify-${key}`;
            return (
              <li key={key} className="flex min-h-16 items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={id} className="flex items-center gap-2 font-medium leading-6">
                    {label}
                    {!on && <BellOff className="size-4 text-muted-foreground" strokeWidth={1.5} aria-label="خاموش" />}
                  </label>
                  <p className="text-sm leading-6 text-muted-foreground">{hint}</p>
                </div>
                <Switch id={id} checked={on} disabled={pending} onCheckedChange={(v) => toggle(key, v)} />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
