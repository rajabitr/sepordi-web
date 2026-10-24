"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { actionError } from "@/components/panel/overview/settle";
import { isCardNumber, isIban, normalizeCardNumber, normalizeIban } from "@/lib/persian";
import { requireShopOwner } from "@/server/auth/session";
import { recordActivity } from "@/server/audit";
import * as bizin from "@/server/bizin/client";

export interface PaymentDetailsInput {
  card_number: string;
  iban: string;
  holder_name: string;
  bank_name: string;
}

export interface PaymentDetailsView {
  configured: boolean;
  card_number_last4: string | null;
  iban_last4: string | null;
  holder_name: string;
  bank_name: string;
}

export async function savePaymentDetailsAction(input: PaymentDetailsInput): Promise<ActionResult<PaymentDetailsView>> {
  const { shop } = await requireShopOwner();
  const card = normalizeCardNumber(String(input.card_number ?? ""));
  const iban = normalizeIban(String(input.iban ?? ""));
  const hasIban = iban.length > 2;
  const holder = String(input.holder_name ?? "").trim();
  const bank = String(input.bank_name ?? "").trim();

  if (card && !isCardNumber(card)) return { ok: false, field: "card_number", message: "شماره‌ی کارت درست نیست؛ ۱۶ رقم روی کارت را دوباره بررسی کنید." };
  if (hasIban && !isIban(iban)) return { ok: false, field: "iban", message: "شماره‌ی شبا درست نیست؛ IR و ۲۴ رقم بعد از آن را بررسی کنید." };
  if (!card && !hasIban) return { ok: false, field: "card_number", message: "شماره‌ی کارت یا شبا را وارد کنید." };
  if (!holder) return { ok: false, field: "holder_name", message: "نام صاحب حساب را بنویسید." };
  if (holder.length > 120 || bank.length > 80) return { ok: false, field: "holder_name", message: "نام‌ها خیلی بلند است." };

  try {
    const d = await bizin.putPaymentDetails(shop.external_business_id, {
      ...(card ? { card_number: card } : {}),
      ...(hasIban ? { iban } : {}),
      holder_name: holder,
      ...(bank ? { bank_name: bank } : {}),
    });
    recordActivity(await requireShopOwner(), "payments.save");
    revalidatePath("/panel");
    return { ok: true, data: d };
  } catch (e) {
    return actionError(e);
  }
}
