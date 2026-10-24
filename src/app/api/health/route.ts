import { connection } from "next/server";

import { releaseVersion } from "@/server/release/version";

/** Liveness and the running commit, for the reverse proxy and the deploy pipeline. No secrets, no DB access. */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ ok: true, version: releaseVersion() }, { headers: { "Cache-Control": "no-store" } });
}
