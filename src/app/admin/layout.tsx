import type { Metadata } from "next";

import { AdminFrame } from "@/components/admin/shell/admin-frame";

export const metadata: Metadata = {
  title: { default: "مدیریت سپردی", template: "%s | مدیریت سپردی" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
