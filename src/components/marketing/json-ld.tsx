import { SITE_NAME, SITE_URL } from "./site";

/** Static, site-authored data only; `<` is escaped so no string in it can close the script element. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function siteGraph() {
  const org = `${SITE_URL}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: SITE_NAME,
        alternateName: "Sepordi",
        url: SITE_URL,
        logo: `${SITE_URL}/brand/icon-512.png`,
        inLanguage: "fa-IR",
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        alternateName: "Sepordi",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "fa-IR",
        publisher: { "@id": org },
        description:
          "دستیار هوشمند فروش که از روی کاتالوگ فروشنده به پیام مشتری‌ها در واتس‌اپ، اینستاگرام و تلگرام جواب می‌دهد، پیش‌فاکتور می‌نویسد و رسید کارت‌به‌کارت را برای تأیید فروشنده کنار می‌گذارد.",
      },
    ],
  };
}

export function faqGraph(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "fa-IR",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
  };
}
