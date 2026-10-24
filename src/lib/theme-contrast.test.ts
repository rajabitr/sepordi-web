import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6,8})\s*;/gi)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text, surface] for body-size text: WCAG AA 4.5:1.
const BODY: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "muted"],
  ["foreground", "secondary"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["success", "background"],
  ["success", "card"],
  ["warning", "background"],
  ["warning", "card"],
  ["brand-ink", "background"],
  ["brand-ink", "card"],
  ["brand-ink", "muted"],
  ["brand-ink", "accent"],
  ["brand-strong-foreground", "brand-strong"],
  ["accent-rose-foreground", "accent-rose"],
  ["accent-peach-foreground", "accent-peach"],
  ["accent-rose-ink", "background"],
  ["accent-rose-ink", "card"],
  ["accent-rose-ink", "accent-rose-soft"],
  ["accent-rose-ink", "surface-cream"],
  ["accent-rose-ink", "surface-lavender"],
  ["accent-peach-ink", "background"],
  ["accent-peach-ink", "card"],
  ["accent-peach-ink", "accent-peach-soft"],
  ["accent-peach-ink", "surface-cream"],
  ["accent-peach-ink", "surface-lavender"],
  ["surface-lavender-foreground", "surface-lavender"],
  ["surface-cream-foreground", "surface-cream"],
  ["foreground", "accent-rose-soft"],
  ["foreground", "accent-peach-soft"],
  ["muted-foreground", "surface-lavender"],
  ["muted-foreground", "surface-cream"],
  ["brand-ink", "surface-lavender"],
  ["brand-ink", "surface-cream"],
  ["success", "surface-cream"],
  ["muted-foreground", "accent-rose-soft"],
  ["muted-foreground", "accent-peach-soft"],
  ["surface-cream-foreground", "card"],
  ["warning", "surface-cream"],
];

// Large text, icons, focus rings and field borders: 3:1.
const UI: [string, string][] = [
  ["brand-foreground", "brand"],
  ["brand", "background"],
  ["brand-strong", "background"],
  ["brand-strong", "card"],
  ["ring", "background"],
  ["ring", "card"],
  ["input", "background"],
  ["input", "card"],
  ["primary", "background"],
  ["brand", "surface-lavender"],
  ["success", "surface-lavender"],
  ...(["chart-1", "chart-2", "chart-3", "chart-4"] as const).flatMap((c): [string, string][] => [
    [c, "card"],
    [c, "background"],
  ]),
];

const light = block(":root");
const dark = block(':root[data-theme="dark"]');
const darkMedia = block(':root:not([data-theme="light"])');

describe("sepordi theme contrast", () => {
  it("keeps the logo colours exact", () => {
    expect(light.primary).toBe("#2b2451");
    expect(light.brand).toBe("#7b62ff");
  });

  it("keeps the palette swatches exact", () => {
    expect(light["accent-rose"]).toBe("#fe90a3");
    expect(light["accent-peach"]).toBe("#ffc2a0");
    expect(light["surface-lavender"]).toBe("#e9e5ff");
    expect(light["surface-cream"]).toBe("#fff6ee");
  });

  it("dark media query mirrors the explicit dark theme", () => {
    expect(darkMedia).toEqual(dark);
  });

  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    for (const [fg, bg] of BODY) {
      it(`${name}: ${fg} on ${bg} >= 4.5`, () => {
        expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [fg, bg] of UI) {
      it(`${name}: ${fg} on ${bg} >= 3`, () => {
        expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe("violet fills with text", () => {
  const src = path.resolve(__dirname, "..");
  const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx") || (f.endsWith(".ts") && !f.endsWith(".test.ts")));

  it("use bg-brand-strong: no component sets text on the logo violet fill", () => {
    const offenders = files.filter((f) => /text-brand-foreground|\bbg-brand\b[^"]*\btext-(white|primary-foreground)\b/.test(readFileSync(path.join(src, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the brand button variant is the strong fill", () => {
    expect(readFileSync(path.join(src, "components/ui/button.tsx"), "utf8")).toMatch(/brand: "bg-brand-strong text-brand-strong-foreground /);
  });
});
