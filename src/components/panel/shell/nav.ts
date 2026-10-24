import {
  Bot,
  Cable,
  CalendarClock,
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

import { can, type Capability, type MemberRole } from "@/server/team/roles";

/** Panel sections a shop's Bizin plan can switch off (`server/entitlements/sections`). */
export type EntitledSection = "inbox" | "returns" | "shipping" | "receipts";

export interface PanelNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar; the rest live in the «بیشتر» sheet. */
  primary?: boolean;
  /** The capability that opens the page. The page and its actions check it on the server whatever the menu shows. */
  cap: Capability;
  /** Hidden when the shop's plan does not include it. */
  section?: EntitledSection;
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
      { href: "/panel", label: "داشبورد", icon: LayoutDashboard, primary: true, cap: "dashboard.view" },
      { href: "/panel/inbox", label: "صندوق پیام", icon: MessagesSquare, primary: true, cap: "inbox.view", section: "inbox" },
      { href: "/panel/orders", label: "سفارش‌ها", icon: ShoppingBag, primary: true, cap: "orders.view" },
      { href: "/panel/booking", label: "نوبت‌ها", icon: CalendarClock, cap: "booking.view" },
      { href: "/panel/products", label: "محصولات", icon: Package, primary: true, cap: "products.view" },
    ],
  },
  {
    title: "راه‌اندازی",
    items: [
      { href: "/panel/channels", label: "کانال‌ها", icon: Cable, cap: "channels.manage" },
      { href: "/panel/assistant", label: "دستیار هوشمند", icon: Bot, cap: "assistant.manage" },
      { href: "/panel/payments", label: "پرداخت", icon: CreditCard, cap: "payments.manage" },
      { href: "/panel/shipping", label: "ارسال", icon: Truck, cap: "shipping.view", section: "shipping" },
      { href: "/panel/returns", label: "مرجوعی‌ها", icon: Undo2, cap: "returns.view", section: "returns" },
    ],
  },
  {
    title: "حساب",
    items: [
      { href: "/panel/credit", label: "اعتبار", icon: Wallet, cap: "credit.view" },
      { href: "/panel/settings", label: "تنظیمات", icon: Settings, cap: "dashboard.view" },
    ],
  },
];

export const PANEL_NAV_ITEMS: PanelNavItem[] = PANEL_NAV.flatMap((g) => g.items);

export type PanelRole = MemberRole;

/**
 * The menu for a role and the sections the shop's plan leaves out. No role (the static shell, before the session
 * streams in) shows every item.
 */
export function navFor(role?: PanelRole, hidden: readonly EntitledSection[] = []): PanelNavGroup[] {
  if (!role && hidden.length === 0) return PANEL_NAV;
  return PANEL_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!role || can(role, i.cap)) && !(i.section && hidden.includes(i.section))),
  })).filter((g) => g.items.length > 0);
}

/** False for a link `role` cannot open: the page would refuse them and bounce them back to /panel. */
export function canOpenHref(role: PanelRole, href: string): boolean {
  const item = PANEL_NAV_ITEMS.filter((i) => isActive(href, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return !item || can(role, item.cap);
}

/** True for a link only an owner can open. */
export function isOwnerOnlyHref(href: string): boolean {
  return PANEL_NAV_ITEMS.some((i) => isActive(href, i.href) && !can("agent", i.cap));
}

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === "/panel" ? pathname === "/panel" : pathname === href || pathname.startsWith(`${href}/`);
}
