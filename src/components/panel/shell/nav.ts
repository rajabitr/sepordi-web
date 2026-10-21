import {
  Bot,
  Cable,
  CreditCard,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  Truck,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface PanelNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar; the rest live in the «بیشتر» sheet. */
  primary?: boolean;
  /** Hidden from agents. The page and its actions refuse them on the server whatever the menu shows. */
  ownerOnly?: boolean;
}

export interface PanelNavGroup {
  title: string;
  items: PanelNavItem[];
}

/** The seller panel's routes. Fixed: each section's page lives at exactly this href. */
export const PANEL_NAV: PanelNavGroup[] = [
  {
    title: "فروش",
    items: [
      { href: "/panel", label: "داشبورد", icon: LayoutDashboard, primary: true },
      { href: "/panel/inbox", label: "صندوق پیام", icon: MessagesSquare, primary: true },
      { href: "/panel/orders", label: "سفارش‌ها", icon: ShoppingBag, primary: true },
      { href: "/panel/products", label: "محصولات", icon: Package, primary: true },
    ],
  },
  {
    title: "راه‌اندازی",
    items: [
      { href: "/panel/channels", label: "کانال‌ها", icon: Cable, ownerOnly: true },
      { href: "/panel/assistant", label: "دستیار هوشمند", icon: Bot, ownerOnly: true },
      { href: "/panel/payments", label: "پرداخت", icon: CreditCard, ownerOnly: true },
      { href: "/panel/shipping", label: "ارسال", icon: Truck, ownerOnly: true },
      { href: "/panel/returns", label: "مرجوعی‌ها", icon: Undo2 },
    ],
  },
  {
    title: "حساب",
    items: [
      { href: "/panel/credit", label: "اعتبار", icon: Wallet, ownerOnly: true },
      { href: "/panel/settings", label: "تنظیمات", icon: Settings },
    ],
  },
];

export const PANEL_NAV_ITEMS: PanelNavItem[] = PANEL_NAV.flatMap((g) => g.items);

export type PanelRole = "owner" | "agent";

/** The menu for a role; no role (the static shell, before the session streams in) shows every item. */
export function navFor(role?: PanelRole): PanelNavGroup[] {
  if (role !== "agent") return PANEL_NAV;
  return PANEL_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.ownerOnly) })).filter((g) => g.items.length > 0);
}

/** True for a link an agent cannot open: the page would refuse them and bounce them back to /panel. */
export function isOwnerOnlyHref(href: string): boolean {
  return PANEL_NAV_ITEMS.some((i) => i.ownerOnly && isActive(href, i.href));
}

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === "/panel" ? pathname === "/panel" : pathname === href || pathname.startsWith(`${href}/`);
}
