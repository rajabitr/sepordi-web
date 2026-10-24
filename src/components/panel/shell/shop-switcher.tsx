"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronDown, Plus, Store } from "lucide-react";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { switchShopAction } from "@/server/auth/actions";

export interface ShopOption {
  id: string;
  name: string;
}

/** The current shop's name; with more than one shop, a menu to switch and to create another. */
export function ShopSwitcher({ current, shops }: { current: ShopOption; shops: ShopOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const name = (
    <>
      <Store className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="truncate font-semibold">{current.name}</span>
    </>
  );
  if (shops.length < 2) return <div className="flex min-w-0 items-center gap-2">{name}</div>;
  return (
    <DropdownMenu
      align="start"
      trigger={
        <span className="flex h-11 min-w-0 cursor-pointer items-center gap-2 rounded-control px-2 hover:bg-secondary" aria-label="تعویض فروشگاه" aria-busy={pending}>
          {name}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        </span>
      }
      items={[
        { type: "label", label: "فروشگاه‌های شما" },
        ...shops.map((s) => ({
          label: s.name,
          icon: s.id === current.id ? Check : Store,
          disabled: pending || s.id === current.id,
          onSelect: () =>
            start(async () => {
              const r = await switchShopAction(s.id);
              if (r && !r.ok) toast({ title: "فروشگاه عوض نشد", description: r.message, variant: "error" });
            }),
        })),
        { type: "separator" },
        { label: "فروشگاه جدید", icon: Plus, onSelect: () => router.push("/register?step=shop&another=1") },
      ]}
    />
  );
}
