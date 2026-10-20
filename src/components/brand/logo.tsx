import Image from "next/image";

import { cn } from "@/lib/utils";

const WORDMARK = { width: 1646, height: 510 };
const MARK = { width: 367, height: 409 };

export interface LogoProps {
  /** `wordmark` = «Sepordi» with the S mark; `mark` = the S alone (favicons, tight spaces). */
  variant?: "wordmark" | "mark";
  /**
   * `auto` follows the theme (navy wordmark on light, white on dark); `light` forces the white wordmark for
   * dark surfaces such as a navy hero. The mark is navy + violet on every surface.
   */
  tone?: "auto" | "default" | "light";
  /** Rendered height in px; width follows the artwork's ratio. */
  height?: number;
  priority?: boolean;
  className?: string;
}

/** سپردی logo from the traced brand SVGs in public/brand. */
export function Logo({ variant = "wordmark", tone = "auto", height = 32, priority, className }: LogoProps) {
  if (variant === "mark") {
    const width = Math.round((MARK.width / MARK.height) * height);
    return (
      <Image src="/brand/sepordi-mark.svg" alt="سپردی" width={width} height={height} priority={priority} unoptimized className={cn("shrink-0", className)} />
    );
  }
  const width = Math.round((WORDMARK.width / WORDMARK.height) * height);
  const img = (src: string, extra?: string) => (
    <Image src={src} alt="سپردی" width={width} height={height} priority={priority} unoptimized className={cn("shrink-0", extra, className)} />
  );
  if (tone === "light") return img("/brand/sepordi-wordmark-light.svg");
  if (tone === "default") return img("/brand/sepordi-wordmark.svg");
  return (
    <>
      {img("/brand/sepordi-wordmark.svg", "sp-logo-on-light")}
      {img("/brand/sepordi-wordmark-light.svg", "sp-logo-on-dark")}
    </>
  );
}
