import { faNumber } from "./utils";

/*
 * The Partner API speaks whole Rial (market "ir": currency IRR, minor_unit 0). Sellers read and type Toman.
 * Convert only at the edge: Rial in state and payloads, Toman on screen and in form fields.
 */

/** 124_500_000 Rial → 12_450_000 Toman. */
export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

/** 12_450_000 Toman → 124_500_000 Rial. */
export function tomanToRial(toman: number): number {
  return Math.round(toman * 10);
}

/** A Rial amount from the API, as the seller reads it: «۱۲٬۴۵۰٬۰۰۰ تومان». */
export function formatToman(rial: number): string {
  return `${faNumber(rialToToman(rial))} تومان`;
}

/** A Toman amount already converted (form state, plan prices): «۱۲٬۴۵۰٬۰۰۰ تومان». */
export function formatTomanValue(toman: number): string {
  return `${faNumber(toman)} تومان`;
}
