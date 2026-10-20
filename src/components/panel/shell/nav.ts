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
      { href: "/panel/channels", label: "کانال‌ها", icon: Cable },
      { href: "/panel/assistant", label: "دستیار هوشمند", icon: Bot },
      { href: "/panel/payments", label: "پرداخت", icon: CreditCard },
      { href: "/panel/shipping", label: "ارسال", icon: Truck },
      { href: "/panel/returns", label: "مرجوعی‌ها", icon: Undo2 },
    ],
  },
  {
    title: "حساب",
    items: [
      { href: "/panel/credit", label: "اعتبار", icon: Wallet },
      { href: "/panel/settings", label: "تنظیمات", icon: Settings },
    ],
  },
];

export const PANEL_NAV_ITEMS: PanelNavItem[] = PANEL_NAV.flatMap((g) => g.items);

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === "/panel" ? pathname === "/panel" : pathname === href || pathname.startsWith(`${href}/`);
}
