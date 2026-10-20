"use server";

import { requireSeller } from "@/server/auth/session";
import {
  claimConversation,
  moveConversationQueue,
  releaseConversation,
  replyToConversation,
} from "@/server/bizin/client";
import {
  CAPTION_LIMIT,
  QUEUES,
  UUID_RE,
  type Conversation,
  type HandoffQueue,
  type Message,
  type Result,
} from "@/components/panel/inbox/model";

import { faError, NOT_FOUND } from "./_lib/respond";

/*
 * Inbox writes. The business is always the session's shop; the conversation id from the client is only a path
 * segment the API scopes to that shop. Every write carries an Idempotency-Key from the client, so a retry of the
 * same click never sends twice.
 */

const KEY_RE = /^[\x21-\x7e]{1,255}$/;

function bad(message: string, code: string): Result<never> {
  return { ok: false, error: { message, code } };
}

async function run<T>(id: string, key: string, fn: (ext: string) => Promise<T>): Promise<Result<T>> {
  if (!UUID_RE.test(id)) return { ok: false, error: NOT_FOUND };
  if (!KEY_RE.test(key)) return bad("درخواست ناقص ارسال شد. دوباره امتحان کنید.", "idempotency_key_invalid");
  const { shop } = await requireSeller();
  try {
    return { ok: true, data: await fn(shop.external_business_id) };
  } catch (e) {
    return { ok: false, error: faError(e) };
  }
}

export async function claimAction(id: string, key: string): Promise<Result<Conversation>> {
  return run(id, key, (ext) => claimConversation(ext, id, { idempotencyKey: key }));
}

export async function releaseAction(id: string, key: string): Promise<Result<Conversation & { assistant_active: boolean }>> {
  return run(id, key, (ext) => releaseConversation(ext, id, { idempotencyKey: key }));
}

export async function moveQueueAction(id: string, queue: HandoffQueue, key: string): Promise<Result<Conversation>> {
  if (!(QUEUES as readonly string[]).includes(queue)) return bad("این صف شناخته‌شده نیست.", "invalid_value");
  return run(id, key, (ext) => moveConversationQueue(ext, id, { queue }, { idempotencyKey: key }));
}

export type ReplyInput = { text: string } | { mediaId: string; caption?: string };
export type ReplyOutcome = { kind: "saved"; message: Message } | { kind: "sent_not_saved" };

export async function replyAction(id: string, input: ReplyInput, key: string): Promise<Result<ReplyOutcome>> {
  let body: { text: string } | { media_id: string; caption?: string };
  if ("mediaId" in input) {
    if (!UUID_RE.test(input.mediaId)) return bad("این عکس دیگر وجود ندارد. دوباره آپلود کنید.", "media_not_found");
    const caption = input.caption?.trim();
    if (caption && caption.length > CAPTION_LIMIT) return bad("توضیح عکس حداکثر ۱۰۲۴ نویسه است.", "text_too_long");
    body = caption ? { media_id: input.mediaId, caption } : { media_id: input.mediaId };
  } else {
    const text = input.text.trim();
    if (!text) return bad("متن پیام را بنویسید.", "text_required");
    body = { text };
  }
  return run(id, key, async (ext) => {
    const out = await replyToConversation(ext, id, body, { idempotencyKey: key });
    return out.status === "sent_not_saved"
      ? ({ kind: "sent_not_saved" } as const)
      : ({ kind: "saved", message: out } as const);
  });
}
