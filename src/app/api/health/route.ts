import { connection } from "next/server";

/** Liveness for the reverse proxy and the deploy script. No secrets, no DB writes. */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
