"use server";

import { requireCapability } from "@/server/auth/session";
import { recordActivity, type ActivityAction } from "@/server/audit";
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
import { markSeen } from "./_lib/seen";

/*
 * Inbox writes. The business is always the session's shop; the conversation id from the client is only a path
 * segment the API scopes to that shop. Every write carries an Idempotency-Key from the client, so a retry of the
 * same click never sends twice.
 */

const KEY_RE = /^[\x21-\x7e]{1,255}$/;

function bad(message: string, code: string): Result<never> {
  return { ok: false, error: { message, code } };
}

async function run<T>(action: ActivityAction, id: string, key: string, fn: (ext: string) => Promise<T>): Promise<Result<T>> {
  if (!UUID_RE.test(id)) return { ok: false, error: NOT_FOUND };
  if (!KEY_RE.test(key)) return bad("درخواست ناقص ارسال شد. دوباره امتحان کنید.", "idempotency_key_invalid");
  const { shop, user } = await requireCapability("inbox.reply");
  try {
    const data = await fn(shop.external_business_id);
    recordActivity({ shop, user }, action, { type: "conversation", id });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: faError(e) };
  }
}

export async function claimAction(id: string, key: string): Promise<Result<Conversation>> {
  return run("inbox.claim", id, key, (ext) => claimConversation(ext, id, { idempotencyKey: key }));
}

export async function releaseAction(id: string, key: string): Promise<Result<Conversation & { assistant_active: boolean }>> {
  return run("inbox.release", id, key, (ext) => releaseConversation(ext, id, { idempotencyKey: key }));
}

export async function moveQueueAction(id: string, queue: HandoffQueue, key: string): Promise<Result<Conversation>> {
  if (!(QUEUES as readonly string[]).includes(queue)) return bad("این صف شناخته‌شده نیست.", "invalid_value");
  return run("inbox.queue", id, key, (ext) => moveConversationQueue(ext, id, { queue }, { idempotencyKey: key }));
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
  return run("inbox.reply", id, key, async (ext) => {
    const out = await replyToConversation(ext, id, body, { idempotencyKey: key });
    return out.status === "sent_not_saved"
      ? ({ kind: "sent_not_saved" } as const)
      : ({ kind: "saved", message: out } as const);
  });
}

/**
 * Marks a conversation read up to `at`, its `last_message_at` as the thread last showed it. Local only: the Partner
 * API has no read state, and nothing reaches the customer.
 */
export async function markSeenAction(id: string, at: string): Promise<Result<null>> {
  if (!UUID_RE.test(id)) return { ok: false, error: NOT_FOUND };
  if (typeof at !== "string" || at.length > 64 || !Number.isFinite(Date.parse(at))) return bad("زمان نامعتبر است.", "invalid_value");
  const { user, shop } = await requireCapability("inbox.view");
  markSeen(user.id, shop.id, id, new Date(Date.parse(at)).toISOString());
  return { ok: true, data: null };
}
