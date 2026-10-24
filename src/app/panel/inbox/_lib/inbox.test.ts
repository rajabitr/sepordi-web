import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb, setDbForTests } from "@/server/db";
import * as bizin from "@/server/bizin/client";
import { resetWorld } from "@/server/bizin/mock";
import { seedWorld } from "@/server/bizin/mock/fixtures";
import { getWorld } from "@/server/bizin/mock/state";
import type { TransportRequest } from "@/server/bizin/transport";
import { NOT_ENTITLED, type Conversation, type Message } from "@/components/panel/inbox/model";

const session = vi.hoisted(() => ({ ext: null as string | null }));

vi.mock("@/server/audit", () => ({ recordActivity: vi.fn() }));
vi.mock("@/server/auth/session", () => {
  const ctx = () => (session.ext ? { user: { id: "u" }, shop: { id: `shop-${session.ext}`, external_business_id: session.ext } } : null);
  return {
    getSeller: async () => ctx(),
    requireCapability: async () => {
      const c = ctx();
      if (!c) throw new Error("REDIRECT /login");
      return c;
    },
  };
});

const { GET: listRoute } = await import("../data/conversations/route");
const { GET: messagesRoute } = await import("../data/conversations/[id]/messages/route");
const { POST: uploadRoute } = await import("../data/media/route");
const { GET: mediaRoute } = await import("../../media/[id]/route");
const { claimAction, markSeenAction, releaseAction, replyAction } = await import("../actions");
const { faError } = await import("./respond");
const { loadSeen } = await import("./seen");

const env = { ...process.env };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  setDbForTests(openDb(":memory:"));
  resetWorld();
  process.env.BIZIN_MODE = "mock";
  session.ext = "demo-nila";
});
afterEach(() => {
  process.env = { ...env };
  bizin.setTransportForTests(undefined);
  setDbForTests(undefined);
});

async function listed(url = "http://x/panel/inbox/data/conversations"): Promise<Conversation[]> {
  const body = await (await listRoute(new Request(url))).json();
  expect(body.ok).toBe(true);
  return body.data.conversations;
}

function capture(answer: (req: TransportRequest) => Response) {
  const seen: TransportRequest[] = [];
  bizin.setTransportForTests(async (req) => {
    seen.push(req);
    return answer(req);
  });
  return seen;
}

describe("conversation list route", () => {
  it("answers 401 without a seller and never caches", async () => {
    session.ext = null;
    const res = await listRoute(new Request("http://x/panel/inbox/data/conversations"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("reads the session's shop whatever the URL says, and forwards only known filters", async () => {
    const seen = capture(() => Response.json({ conversations: [], next_cursor: null }));
    await listRoute(new Request("http://x/panel/inbox/data/conversations?ext=demo-rasta&state=handoff&state=bogus&queue=sales&channel=sms&q=x"));
    expect(seen[0].path).toBe("/tenants/demo-nila/conversations?limit=30&state=handoff&queue=sales");
  });

  it("sends the sheet filters as the Partner API names them, the until day ending at the next Tehran midnight", async () => {
    const seen = capture(() => Response.json({ conversations: [], next_cursor: null }));
    await listRoute(
      new Request(
        "http://x/panel/inbox/data/conversations?priority=urgent&reason_class=PAYMENT_VERIFICATION&status=snoozed&has_order=false&until=2026-10-24&priority_x=1",
      ),
    );
    const q = new URL(`http://b${seen[0].path}`).searchParams;
    expect(q.getAll("priority")).toEqual(["urgent"]);
    expect(q.getAll("reason_class")).toEqual(["PAYMENT_VERIFICATION"]);
    expect(q.getAll("status")).toEqual(["snoozed"]);
    expect(q.get("has_order")).toBe("false");
    expect(q.get("until")).toBe("2026-10-24T20:30:00.000Z");
    expect([...q.keys()].sort()).toEqual(["has_order", "limit", "priority", "reason_class", "status", "until"]);
  });

  it("drops a bad filter value instead of sending it", async () => {
    const seen = capture(() => Response.json({ conversations: [], next_cursor: null }));
    await listRoute(new Request("http://x/panel/inbox/data/conversations?priority=meh&reason_class=NONE&status=gone&has_order=yes&until=2026-02-30"));
    expect(seen[0].path).toBe("/tenants/demo-nila/conversations?limit=30");
  });

  it("answers feature_not_entitled as a plan state, never a generic failure", async () => {
    capture(() => Response.json({ code: "feature_not_entitled", message: "x", params: { feature: "inbox.api" } }, { status: 403 }));
    const res = await listRoute(new Request("http://x/panel/inbox/data/conversations"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toEqual(NOT_ENTITLED);
    const thread = await bizin.getConversation("demo-nila", "c7e2a9f4-1b3d-4e5f-8a6b-9c0d1e2f3a4b").catch((e: unknown) => faError(e));
    expect(thread).toEqual(NOT_ENTITLED);
  });

  it("returns the seller's own seen marks for the page, per user and shop", async () => {
    const [c] = await listed();
    expect((await markSeenAction(c.id, c.last_message_at)).ok).toBe(true);
    const body = await (await listRoute(new Request("http://x/panel/inbox/data/conversations"))).json();
    expect(body.data.seen).toEqual({ [c.id]: new Date(c.last_message_at).toISOString() });
    expect(loadSeen("u", "shop-demo-rasta")).toEqual({});
  });

  it("filters by state in the mock world", async () => {
    const all = await listed();
    const handoff = await listed("http://x/panel/inbox/data/conversations?state=handoff");
    expect(handoff.length).toBeGreaterThan(0);
    expect(handoff.length).toBeLessThan(all.length);
    expect(handoff.every((c) => c.state === "handoff")).toBe(true);
  });
});

describe("thread messages route", () => {
  it("re-reads the conversation only when an after page brings something new", async () => {
    const [c] = await listed("http://x/panel/inbox/data/conversations?channel=whatsapp");
    const first = await (await messagesRoute(new Request(`http://x/m`), params(c.id))).json();
    const cursor = first.data.next_after as string;

    const idle = await (await messagesRoute(new Request(`http://x/m?after=${cursor}`), params(c.id))).json();
    expect(idle.data.messages).toHaveLength(0);
    expect(idle.data.conversation).toBeUndefined();

    await bizin.replyToConversation("demo-nila", c.id, { text: "سلام" });
    const fresh = await (await messagesRoute(new Request(`http://x/m?after=${cursor}`), params(c.id))).json();
    expect(fresh.data.messages.map((m: Message) => m.text)).toEqual(["سلام"]);
    expect(fresh.data.conversation.id).toBe(c.id);
  });

  it("refuses an id that is not a uuid without calling Bizin", async () => {
    const seen = capture(() => Response.json({}));
    const res = await messagesRoute(new Request("http://x/m"), params("../webhooks"));
    expect(res.status).toBe(404);
    expect(seen).toHaveLength(0);
  });
});

describe("media proxy", () => {
  function imageMessage(): Message {
    const t = getWorld(seedWorld).tenants.get("demo-nila")!;
    for (const thread of t.messages.values()) {
      const m = thread.find((x) => x.media);
      if (m) return m;
    }
    throw new Error("no media in fixtures");
  }

  it("serves an image inline, never cached, nosniff", async () => {
    const m = imageMessage();
    const res = await mediaRoute(new Request("http://x"), params(m.media!.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("downloads anything that is not a plain image, and never as html", async () => {
    capture(() => new Response("<script>alert(1)</script>", { headers: { "content-type": "text/html" } }));
    const res = await mediaRoute(new Request("http://x"), params("0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b"));
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("passes a plan refusal through as 403, not as a broken upstream", async () => {
    capture(() => Response.json({ code: "feature_not_entitled", message: "x" }, { status: 403 }));
    expect((await mediaRoute(new Request("http://x"), params("0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b"))).status).toBe(403);
  });

  it("is 401 without a seller and 404 for another shop's file", async () => {
    const m = imageMessage();
    session.ext = "demo-rasta";
    expect((await mediaRoute(new Request("http://x"), params(m.media!.id))).status).toBe(404);
    session.ext = null;
    expect((await mediaRoute(new Request("http://x"), params(m.media!.id))).status).toBe(401);
  });
});

describe("image upload route", () => {
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "a.png", { type: "image/png" });
  const post = (file: File, headers: Record<string, string> = { origin: "http://x", host: "x" }) => {
    const form = new FormData();
    form.set("file", file);
    return uploadRoute(new Request("http://x/panel/inbox/data/media", { method: "POST", body: form, headers }));
  };

  it("refuses a cross-site request before reading the session", async () => {
    const res = await post(png(), { origin: "https://evil.example", host: "x" });
    expect(res.status).toBe(403);
  });

  it("checks the type before anything reaches Bizin", async () => {
    const seen = capture(() => Response.json({}));
    const res = await post(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(res.status).toBe(415);
    expect(seen).toHaveLength(0);
  });

  it("stores a PNG for the session's shop", async () => {
    const res = await post(png());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(getWorld(seedWorld).tenants.get("demo-nila")!.media.has(`media:${body.data.id}`)).toBe(true);
  });
});

describe("inbox actions", () => {
  const KEY = "11111111-2222-4333-8444-555555555555";

  it("reply forwards the client's Idempotency-Key and reports sent_not_saved as delivered", async () => {
    const seen = capture(() => Response.json({ status: "sent_not_saved" }, { status: 202 }));
    const r = await replyAction("c7e2a9f4-1b3d-4e5f-8a6b-9c0d1e2f3a4b", { text: "  سلام  " }, KEY);
    expect(r).toEqual({ ok: true, data: { kind: "sent_not_saved" } });
    expect(seen[0].headers["Idempotency-Key"]).toBe(KEY);
    expect(JSON.parse(String(seen[0].body))).toEqual({ text: "سلام" });
  });

  it("reply returns the saved message", async () => {
    const [c] = await listed("http://x/panel/inbox/data/conversations?channel=whatsapp");
    const r = await replyAction(c.id, { text: "موجود است" }, KEY);
    expect(r.ok && r.data.kind === "saved" && r.data.message.sender).toBe("human");
  });

  it("an empty reply or a bad id never reaches Bizin", async () => {
    const seen = capture(() => Response.json({}));
    expect((await replyAction("c7e2a9f4-1b3d-4e5f-8a6b-9c0d1e2f3a4b", { text: "   " }, KEY)).ok).toBe(false);
    expect((await claimAction("not-a-uuid", KEY)).ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("release of an opted-out customer keeps its code for the screen to explain", async () => {
    const [c] = await listed("http://x/panel/inbox/data/conversations?state=handoff");
    getWorld(seedWorld).tenants.get("demo-nila")!.optedOut.add(c.id);
    const r = await releaseAction(c.id, KEY);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("customer_opted_out");
  });

  it("mark-seen refuses a bad id or time and never moves a mark back", async () => {
    const id = "c7e2a9f4-1b3d-4e5f-8a6b-9c0d1e2f3a4b";
    expect((await markSeenAction("nope", new Date().toISOString())).ok).toBe(false);
    expect((await markSeenAction(id, "yesterday")).ok).toBe(false);
    const later = new Date(Date.now() - 60_000).toISOString();
    await markSeenAction(id, later);
    await markSeenAction(id, new Date(Date.now() - 3_600_000).toISOString());
    expect(loadSeen("u", "shop-demo-nila")[id]).toBe(later);
  });

  it("claim takes the thread", async () => {
    const [c] = await listed("http://x/panel/inbox/data/conversations?state=ai");
    const r = await claimAction(c.id, KEY);
    expect(r.ok && r.data.state).toBe("human");
  });
});
