import type { Metadata } from "next";

import { PanelFrame } from "@/components/panel/shell/panel-frame";

export const metadata: Metadata = {
  title: { default: "پنل فروشنده", template: "%s | پنل سپردی" },
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
