import type { MetadataRoute } from "next";

import { MARKETING_ROUTES, SITE_URL } from "@/components/marketing/site";

const PRIORITY: Partial<Record<(typeof MARKETING_ROUTES)[number], number>> = { "/": 1, "/pricing": 0.9, "/features": 0.9, "/guide": 0.8, "/faq": 0.7 };

export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_ROUTES.map((path) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency: path === "/terms" || path === "/privacy" ? "yearly" : "monthly",
    priority: PRIORITY[path] ?? 0.5,
  }));
}
