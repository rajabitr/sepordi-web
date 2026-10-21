import "server-only";

import Link from "next/link";
import { UserRound, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { requireSeller } from "@/server/auth/session";

const TABS = [
  { key: "account", href: "/panel/settings", label: "حساب من", icon: UserRound, ownerOnly: false },
  { key: "team", href: "/panel/settings/team", label: "تیم", icon: Users, ownerOnly: true },
] as const;

export type SettingsTab = (typeof TABS)[number]["key"];

/** Settings sections; «تیم» only for an owner. Reads the session, so it renders inside a Suspense boundary. */
export async function SettingsNav({ current }: { current: SettingsTab }) {
  const { role } = await requireSeller();
  const tabs = TABS.filter((t) => !t.ownerOnly || role === "owner");
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
