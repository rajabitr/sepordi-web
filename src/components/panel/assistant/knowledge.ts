import { faNumber } from "@/lib/utils";

import { PROFILE_MAX } from "./limits";

/**
 * «دانش‌نامه‌ی دستیار»: the seller's structured notes, compiled into the single `business_profile` text the Partner
 * API gives the assistant. The compiled text on bizin is the source of truth; the draft is only its editable shape.
 */
export interface FaqItem {
  q: string;
  a: string;
}

export interface KnowledgeDraft {
  about: string;
  hours: string;
  shipping: string;
  payment: string;
  warranty: string;
  faq: FaqItem[];
  notes: string;
}

type TextKey = Exclude<keyof KnowledgeDraft, "faq">;
type SectionKey = keyof KnowledgeDraft;

/** Compile order. The headings are part of the stored format: renaming one makes saved profiles parse as legacy text. */
export const SECTIONS: readonly { key: SectionKey; heading: string }[] = [
  { key: "about", heading: "درباره‌ی کسب‌وکار" },
  { key: "hours", heading: "ساعت کاری و پاسخ‌گویی" },
  { key: "shipping", heading: "ارسال و تحویل" },
  { key: "payment", heading: "پرداخت" },
  { key: "warranty", heading: "ضمانت و خدمات پس از فروش" },
  { key: "faq", heading: "سؤال‌های پرتکرار" },
  { key: "notes", heading: "نکته‌های مهم برای دستیار" },
];

export const PROFILE_WARN = 3600;
const Q = "س: ";
const A = "ج: ";

const BY_HEADING = new Map(SECTIONS.map((s) => [s.heading, s.key]));
const HEADING_LINE = /^#+[ \t]*(.+?)[ \t]*$/;

export function emptyDraft(): KnowledgeDraft {
  return { about: "", hours: "", shipping: "", payment: "", warranty: "", faq: [], notes: "" };
}

function headingKey(line: string): SectionKey | undefined {
  const m = line.match(HEADING_LINE);
  return m ? BY_HEADING.get(m[1]) : undefined;
}

/** A body line that reads as one of our headings would split the section on the way back, so it loses its `#`s. */
function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (headingKey(line) ? line.replace(/^#+[ \t]*/, "") : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Q/A pairs are one line each so the `س:`/`ج:` markers stay unambiguous. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Coerces anything (a client payload, a stored JSON value) into a draft in the form it compiles from. */
export function normalizeDraft(input: unknown): KnowledgeDraft {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = emptyDraft();
  for (const { key } of SECTIONS) if (key !== "faq") d[key] = normalizeText(str(o[key]));
  d.faq = (Array.isArray(o.faq) ? o.faq : [])
    .map((x) => {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return { q: oneLine(str(r.q)), a: oneLine(str(r.a)) };
    })
    .filter((x) => x.q !== "" || x.a !== "");
  return d;
}

/**
 * The one text the assistant reads. A draft with only «درباره» compiles to that text alone, so a profile written
 * before the sections existed is saved back unchanged.
 */
export function compileKnowledge(input: KnowledgeDraft): string {
  const d = normalizeDraft(input);
  const filled = SECTIONS.filter(({ key }) => (key === "faq" ? d.faq.length > 0 : d[key] !== ""));
  if (filled.length === 1 && filled[0].key === "about") return d.about;
  return filled
    .map(({ key, heading }) => {
      const body = key === "faq" ? d.faq.map((x) => `${Q}${x.q}\n${A}${x.a}`).join("\n") : d[key as TextKey];
      return `## ${heading}\n${body}`;
    })
    .join("\n\n");
}

/** Length as bizin counts it: Unicode code points. */
export function profileLength(text: string): number {
  return [...text].length;
}

function parseFaq(body: string): FaqItem[] | null {
  const lines = body.split("\n").filter((l) => l.trim() !== "");
  if (lines.length % 2 !== 0) return null;
  const out: FaqItem[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (!lines[i].startsWith(Q) || !lines[i + 1].startsWith(A)) return null;
    out.push({ q: lines[i].slice(Q.length), a: lines[i + 1].slice(A.length) });
  }
  return out;
}

/**
 * Reads a `business_profile` back into sections when it is in the compiled format; any other text lands whole in
 * «درباره‌ی کسب‌وکار», so nothing written elsewhere is lost.
 */
export function parseKnowledge(profile: string): KnowledgeDraft {
  const text = profile.replace(/\r\n?/g, "\n").trim();
  if (text === "") return emptyDraft();
  const legacy = { ...emptyDraft(), about: text };
  const lines = text.split("\n");
  if (!headingKey(lines[0])) return legacy;

  const bodies = new Map<SectionKey, string[]>();
  let current: string[] = [];
  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      if (bodies.has(key)) return legacy;
      current = [];
      bodies.set(key, current);
    } else current.push(line);
  }

  const d = emptyDraft();
  for (const [key, body] of bodies) {
    const joined = body.join("\n").trim();
    if (key === "faq") {
      const faq = parseFaq(joined);
      if (!faq) return legacy;
      d.faq = faq;
    } else d[key] = joined;
  }
  return normalizeDraft(d);
}

export type KnowledgeCheck =
  | { ok: true; draft: KnowledgeDraft; compiled: string }
  | { ok: false; field: "faq" | "business_profile"; message: string };

/** Run on the client for the live state and again in the Server Action, which compiles the text itself. */
export function checkKnowledge(input: unknown): KnowledgeCheck {
  const draft = normalizeDraft(input);
  if (draft.faq.some((x) => x.q === "" || x.a === "")) {
    return { ok: false, field: "faq", message: "هر سؤال پرتکرار باید هم سؤال داشته باشد و هم جواب؛ ردیف نیمه‌کاره را کامل یا حذف کنید." };
  }
  const compiled = compileKnowledge(draft);
  const len = profileLength(compiled);
  if (len > PROFILE_MAX) {
    return {
      ok: false,
      field: "business_profile",
      message: `متن دانش‌نامه ${faNumber(len)} نویسه است و سقفش ${faNumber(PROFILE_MAX)} نویسه؛ ${faNumber(len - PROFILE_MAX)} نویسه کوتاه‌ترش کنید.`,
    };
  }
  return { ok: true, draft, compiled };
}
