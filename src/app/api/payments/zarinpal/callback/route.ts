import { completeZarinpalPayment } from "@/server/credit/orders";

/*
 * Zarinpal sends the buyer back here with ?Authority=…&Status=OK|NOK. No session is needed: the outcome comes
 * only from Zarinpal's verify, and the seller reads it on /panel/credit.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const outcome = await completeZarinpalPayment(url.searchParams.get("Authority") ?? "", url.searchParams.get("Status") ?? "");
  // Relative: behind the CDN and the router request.url carries the internal host.
  return new Response(null, { status: 303, headers: { Location: `/panel/credit?payment=${outcome}`, "Cache-Control": "no-store" } });
}
