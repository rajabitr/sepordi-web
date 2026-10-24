"use client";

import * as React from "react";
import { Camera, Inbox, MessageCircle, Send } from "lucide-react";

import { AnimatedBeam } from "@/components/animations/animated-beam";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { key: "whatsapp", name: "واتس‌اپ", note: "با همون شماره‌ی خودتون", icon: MessageCircle },
  { key: "instagram", name: "اینستاگرام", note: "اتصال تدریجی؛ در انتظار تأیید متا", icon: Camera },
  { key: "telegram", name: "تلگرام", note: "با ربات خود فروشگاه", icon: Send },
] as const;

function Node({ nodeRef, children, className }: { nodeRef: React.Ref<HTMLDivElement>; children: React.ReactNode; className?: string }) {
  return (
    <div ref={nodeRef} className={cn("flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-surface", className)}>
      {children}
    </div>
  );
}

/** Three channels flow into sepordi and out to one inbox. The beams are decoration; the nodes carry the meaning. */
export function ChannelsBeam() {
  const container = React.useRef<HTMLDivElement>(null);
  const wa = React.useRef<HTMLDivElement>(null);
  const ig = React.useRef<HTMLDivElement>(null);
  const tg = React.useRef<HTMLDivElement>(null);
  const hub = React.useRef<HTMLDivElement>(null);
  const inbox = React.useRef<HTMLDivElement>(null);
  const refs = { whatsapp: wa, instagram: ig, telegram: tg };

  return (
    <div ref={container} className="relative isolate mx-auto grid max-w-4xl grid-cols-1 items-center gap-12 md:grid-cols-3 md:gap-8">
      <ul className="flex flex-col gap-4" aria-label="کانال‌ها">
        {CHANNELS.map((c) => (
          <li key={c.key}>
            <Node nodeRef={refs[c.key]}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-peach-soft text-accent-peach-ink">
                <c.icon strokeWidth={2} aria-hidden className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold leading-6">{c.name}</span>
                <span className={cn("block text-xs leading-6", c.key === "instagram" ? "text-warning" : "text-muted-foreground")}>{c.note}</span>
              </span>
            </Node>
          </li>
        ))}
      </ul>

      <div className="relative flex justify-center">
        <div aria-hidden className="absolute inset-0 -z-10 m-auto size-40 rounded-full bg-accent-peach/40 blur-2xl" />
        <div ref={hub} className="flex size-28 items-center justify-center rounded-3xl border border-border bg-card shadow-overlay">
          <Logo variant="mark" height={56} />
        </div>
      </div>

      <div className="flex justify-center md:justify-end">
        <Node nodeRef={inbox} className="w-full max-w-60 flex-col items-start gap-2 md:w-auto">
          <span className="flex items-center gap-2 text-sm font-semibold leading-6">
            <Inbox strokeWidth={2} aria-hidden className="size-5 text-brand-ink" />
            صندوق پیام شما
          </span>
          <span className="text-xs leading-6 text-muted-foreground">همه‌ی گفت‌وگوها یک‌جا، با سفارش‌ها و رسیدها</span>
        </Node>
      </div>

      <AnimatedBeam containerRef={container} fromRef={wa} toRef={hub} duration={4} curvature={-24} />
      <AnimatedBeam containerRef={container} fromRef={ig} toRef={hub} duration={4} delay={0.6} />
      <AnimatedBeam containerRef={container} fromRef={tg} toRef={hub} duration={4} delay={1.2} curvature={24} />
      <AnimatedBeam containerRef={container} fromRef={hub} toRef={inbox} duration={4} delay={1.8} />
    </div>
  );
}
