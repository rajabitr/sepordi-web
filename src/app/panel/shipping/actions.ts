"use server";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { actionError } from "@/components/panel/overview/settle";
import { fromApi, toShippingBody, type ShippingFormValue } from "@/components/panel/shipping/model";
import { requireShopOwner } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

export async function saveShippingAction(input: ShippingFormValue): Promise<ActionResult<ShippingFormValue>> {
  const { shop } = await requireShopOwner();
  const check = toShippingBody({
    enabled: Boolean(input?.enabled),
    default_fee: typeof input?.default_fee === "number" ? input.default_fee : null,
    free_over: typeof input?.free_over === "number" ? input.free_over : null,
    rates: Array.isArray(input?.rates)
      ? input.rates.map((r) => ({ province: String(r?.province ?? ""), city: String(r?.city ?? ""), fee: typeof r?.fee === "number" ? r.fee : null }))
      : [],
  });
  if (!check.ok) return { ok: false, field: check.field, message: check.message };
  try {
    return { ok: true, data: fromApi(await bizin.putShipping(shop.external_business_id, check.body)) };
  } catch (e) {
    return actionError(e);
  }
}
