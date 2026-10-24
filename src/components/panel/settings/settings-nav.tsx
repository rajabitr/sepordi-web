import "server-only";

import Link from "next/link";
import { Bell, History, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { requireSeller } from "@/server/auth/session";
import { can, type Capability } from "@/server/team/roles";

const TABS: readonly { key: string; href: string; label: string; icon: LucideIcon; cap?: Capability }[] = [
  { key: "account", href: "/panel/settings", label: "حساب من", icon: UserRound },
  { key: "team", href: "/panel/settings/team", label: "تیم", icon: Users, cap: "team.manage" },
  { key: "security", href: "/panel/settings/security", label: "امنیت", icon: ShieldCheck },
  { key: "activity", href: "/panel/settings/activity", label: "فعالیت‌ها", icon: History, cap: "activity.view" },
  { key: "notifications", href: "/panel/settings/notifications", label: "اعلان‌ها", icon: Bell },
];

export type SettingsTab = "account" | "team" | "security" | "activity" | "notifications";

/** Settings sections the member's role opens. Reads the session, so it renders inside a Suspense boundary. */
export async function SettingsNav({ current }: { current: SettingsTab }) {
  const { role } = await requireSeller();
  const tabs = TABS.filter((t) => !t.cap || can(role, t.cap));
  if (tabs.length < 2) return <SettingsNavSkeleton />;
  return (
    <nav aria-label="بخش‌های تنظیمات" className="flex min-h-11 flex-wrap gap-2 border-b border-border">
      {tabs.map(({ key, href, label, icon: Icon }) => {
        const active = key === current;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-11 items-center gap-2 border-b-2 px-4 text-base transition-colors duration-(--motion) ease-motion",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-brand font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsNavSkeleton() {
  return <div aria-hidden className="min-h-11 border-b border-border" />;
}
