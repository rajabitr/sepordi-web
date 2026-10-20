import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const alt = "سپردی، دستیار هوشمند فروش در واتس‌اپ، اینستاگرام و تلگرام";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Satori renders without a document, so CSS variables cannot resolve: these literals mirror the sepordi theme in
 * globals.css (--primary, --brand, --primary-foreground) and must change with it.
 */
const NAVY = "#2B2451";
const VIOLET = "#7B62FF";
const WHITE = "#FFFFFF";

const ZWNJ = "‌";

/** Scoped to public/ so the build traces that folder, not the whole project. */
async function readAsset(publicPath: string): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "public", publicPath));
  } catch {
    return null;
  }
}

/*
 * Satori ignores `direction: rtl` and reverses runs itself, treating a ZWNJ like a space, so «مشتری‌ها» would come
 * out as «ها‌مشتری». Laying words and their ZWNJ parts out with row-reverse flexbox keeps every leaf a single run.
 */
function RtlLine({ text, style }: { text: string; style: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", gap: "0.22em", ...style }}>
      {text.split(/\s+/).filter(Boolean).map((word, w) => (
        <div key={w} style={{ display: "flex", flexDirection: "row-reverse" }}>
          {word.split(ZWNJ).map((part, p) => (
            <div key={p} style={{ display: "flex" }}>
              {part}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Module scope, so the card is prerendered once at build instead of reading files per request.
const [regular, bold, wordmark] = await Promise.all([
  readAsset("marketing/fonts/vazirmatn-400.ttf"),
  readAsset("marketing/fonts/vazirmatn-700.ttf"),
  readAsset("brand/sepordi-wordmark-light.svg"),
]);

export default function OpengraphImage() {
  const fonts = [
    ...(regular ? [{ name: "Vazirmatn", data: regular, weight: 400 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Vazirmatn", data: bold, weight: 700 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: 72,
          background: NAVY,
          color: WHITE,
          fontFamily: "Vazirmatn",
        }}
      >
        {wordmark ? (
          <img src={`data:image/svg+xml;base64,${wordmark.toString("base64")}`} width={258} height={80} alt="" />
        ) : (
          <div style={{ display: "flex" }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <RtlLine text="دایرکت‌ها را بسپارید به سپردی" style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.25, justifyContent: "flex-start" }} />
          <RtlLine
            text="جواب از روی کاتالوگ خودتون، پیش‌فاکتور در چت و رسید کارت‌به‌کارت با تأیید شما"
            style={{ marginTop: 24, fontSize: 32, fontWeight: 400, lineHeight: 1.6, opacity: 0.85, maxWidth: 960 }}
          />
        </div>
        <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", alignItems: "center", gap: 16 }}>
          <RtlLine text="واتس‌اپ · اینستاگرام · تلگرام" style={{ fontSize: 28, fontWeight: 400, opacity: 0.85 }} />
          <div style={{ display: "flex", width: 96, height: 8, borderRadius: 4, background: VIOLET }} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
