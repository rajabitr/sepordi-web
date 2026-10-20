import type { Metadata } from "next";

import { ErrorScreen } from "@/components/brand/error-screen";

export const metadata: Metadata = { title: "صفحه پیدا نشد" };

export default function NotFound() {
  return <ErrorScreen kind="404" />;
}
