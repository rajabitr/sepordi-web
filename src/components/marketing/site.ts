import type { Metadata } from "next";

/** Same fallback as the root layout's metadataBase, so canonicals, sitemap and JSON-LD agree. */
export const SITE_URL = (process.env.PUBLIC_BASE_URL || "https://sepordi.ir").replace(/\/+$/, "");

export const SITE_NAME = "سپردی";

export const SITE_TAGLINE = "دستیار هوشمند فروش در واتس‌اپ، اینستاگرام و تلگرام";

export interface NavItem {
  label: string;
  href: string;
}

export const NAV_LINKS: NavItem[] = [
  { label: "امکانات", href: "/features" },
  { label: "تعرفه", href: "/pricing" },
  { label: "راهنما", href: "/guide" },
  { label: "سؤال‌های پرتکرار", href: "/faq" },
  { label: "درباره ما", href: "/about" },
];

export const FOOTER_COLUMNS: { title: string; links: NavItem[] }[] = [
  {
    title: "محصول",
    links: [
      { label: "امکانات", href: "/features" },
      { label: "تعرفه", href: "/pricing" },
      { label: "راهنمای شروع", href: "/guide" },
    ],
  },
  {
    title: "سپردی",
    links: [
      { label: "درباره ما", href: "/about" },
      { label: "تماس با ما", href: "/contact" },
      { label: "سؤال‌های پرتکرار", href: "/faq" },
    ],
  },
  {
    title: "قوانین",
    links: [
      { label: "شرایط استفاده", href: "/terms" },
      { label: "حریم خصوصی", href: "/privacy" },
    ],
  },
];

/** Every public marketing route, in sitemap order. */
export const MARKETING_ROUTES = ["/", "/features", "/pricing", "/guide", "/faq", "/about", "/contact", "/terms", "/privacy"] as const;

/**
 * Page metadata with an absolute canonical. A page-level `openGraph` replaces the root one wholesale, so the shared
 * fields are repeated here; the image comes from app/opengraph-image.tsx.
 */
export function pageMetadata({ path, title, description }: { path: string; title?: string; description: string }): Metadata {
  const ogTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ${SITE_TAGLINE}`;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "fa_IR", siteName: SITE_NAME, url: path, title: ogTitle, description },
    twitter: { card: "summary_large_image", title: ogTitle, description },
  };
}
