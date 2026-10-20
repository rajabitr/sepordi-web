import type { Metadata, Viewport } from "next";

import { vazirmatn } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL || "https://sepordi.ir"),
  title: {
    default: "سپردی | دستیار هوشمند فروش در واتس‌اپ، اینستاگرام و تلگرام",
    template: "%s | سپردی",
  },
  description:
    "سپردی به پیام مشتری‌های فروشگاه شما در واتس‌اپ، اینستاگرام و تلگرام از روی کاتالوگ خودتان جواب می‌دهد، سفارش ثبت می‌کند و رسید کارت‌به‌کارت را برای تأیید شما کنار می‌گذارد.",
  applicationName: "سپردی",
  openGraph: { type: "website", locale: "fa_IR", siteName: "سپردی" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#120f24" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
