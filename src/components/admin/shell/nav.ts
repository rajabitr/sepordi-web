import {
  Building2,
  FileSignature,
  LayoutDashboard,
  Palette,
  Settings,
  Store,
  Upload,
  Wallet,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "عملیات",
    items: [
      { href: "/admin", label: "نمای کلی", icon: LayoutDashboard },
      { href: "/admin/sellers", label: "فروشندگان", icon: Store },
      { href: "/admin/credit", label: "سفارش‌های اعتبار", icon: Wallet },
      { href: "/admin/onboarding", label: "ثبت گروهی فروشگاه", icon: Upload },
    ],
  },
  {
    title: "اتصال به بیزین",
    items: [
      { href: "/admin/webhooks", label: "وب‌هوک‌ها", icon: Webhook },
      { href: "/admin/branding", label: "برند", icon: Palette },
      { href: "/admin/contract", label: "قرارداد", icon: FileSignature },
    ],
  },
  {
    title: "سپردی",
    items: [{ href: "/admin/settings", label: "تنظیمات سایت", icon: Settings }],
  },
];

export function isAdminActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export const ADMIN_HOME_ICON = Building2;
