import { ingestWebhook, MAX_WEBHOOK_BYTES } from "@/server/notifications/ingest";
import { webhookSecretsFromEnv } from "@/server/webhooks/verify";

/** Bizin's delivery endpoint (partner-api.md §9). Answers before any other work; never calls Bizin. */
export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  const result =
    declared > MAX_WEBHOOK_BYTES
      ? ({ status: 413, reason: "too_large" } as const)
      : ingestWebhook({
          signature: request.headers.get("bizin-signature"),
          eventIdHeader: request.headers.get("bizin-event-id"),
          rawBody: new Uint8Array(await request.arrayBuffer()),
          secrets: webhookSecretsFromEnv(),
        });
  if (result.status !== 200) {
    const id = request.headers.get("x-request-id") ?? request.headers.get("bizin-event-id") ?? "-";
    console.warn(`bizin webhook refused: ${result.reason} request=${id.slice(0, 80)}`);
    return Response.json({ ok: false }, { status: result.status });
  }
  return Response.json({ ok: true });
}
