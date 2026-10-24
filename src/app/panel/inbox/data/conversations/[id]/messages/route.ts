import { getSeller } from "@/server/auth/session";
import { getConversation, listMessages } from "@/server/bizin/client";
import { UUID_RE } from "@/components/panel/inbox/model";

import { errorJson, json, NOT_FOUND, SIGNED_OUT } from "../../../../_lib/respond";

/**
 * A page of one thread: `before` walks back, `after` catches up (the open thread polls this every 5 s). When an
 * `after` page brings something new, the conversation is re-read too, so its state and handoff stay current
 * without a second poll.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const seller = await getSeller("inbox.view");
  if (!seller) return json({ ok: false, error: SIGNED_OUT }, 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return json({ ok: false, error: NOT_FOUND }, 404);
  const sp = new URL(req.url).searchParams;
  const before = sp.get("before")?.slice(0, 512) || undefined;
  const after = before ? undefined : sp.get("after")?.slice(0, 512) || undefined;
  const ext = seller.shop.external_business_id;
  try {
    const page = await listMessages(ext, id, { limit: 50, before, after });
    const conversation = after && page.messages.length > 0 ? await getConversation(ext, id) : undefined;
    return json({ ok: true, data: { ...page, conversation } });
  } catch (e) {
    return errorJson(e);
  }
}
