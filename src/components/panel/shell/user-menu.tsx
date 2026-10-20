"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, LogOut, Settings, Wallet } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { fa } from "@/lib/utils";
import { logoutAction } from "@/server/auth/actions";

export function UserMenu({ name, phone }: { name: string; phone: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <DropdownMenu
      align="end"
      trigger={
        <span className="flex h-11 cursor-pointer items-center gap-2 rounded-control px-2 hover:bg-secondary" aria-label="حساب کاربری">
          <Avatar name={name} size="sm" />
          <span className="hidden max-w-40 truncate text-sm font-semibold md:inline">{name}</span>
          <ChevronDown className="hidden size-4 text-muted-foreground md:inline" strokeWidth={1.5} />
        </span>
      }
      items={[
        { type: "label", label: <bdi dir="ltr">{fa(phone)}</bdi> },
        { label: "تنظیمات", icon: Settings, onSelect: () => router.push("/panel/settings") },
        { label: "اعتبار", icon: Wallet, onSelect: () => router.push("/panel/credit") },
        { type: "separator" },
        { label: pending ? "در حال خروج…" : "خروج", icon: LogOut, danger: true, disabled: pending, onSelect: () => start(() => logoutAction()) },
      ]}
    />
  );
}
