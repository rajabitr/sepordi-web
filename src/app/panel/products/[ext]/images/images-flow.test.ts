import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { MockWorld } from "@/server/bizin/mock/state";

vi.mock("@/server/auth/session", () => ({
  getSeller: vi.fn(async () => ({
    user: { id: "u1" },
    shop: { id: "shop-nila", user_id: "u1", external_business_id: "demo-nila", name: "گالری نیلا", bizin_tenant_id: null, created_at: "" },
    role: "owner",
  })),
}));

const { POST: upload } = await import("./route");
const { POST: send } = await import("./send/route");
const { GET: poll } = await import("./jobs/[id]/route");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PRODUCT = "NL-103";
const params = Promise.resolve({ ext: PRODUCT });
const sameOrigin = { "sec-fetch-site": "same-origin" };

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sepordi-flow-"));
  process.env.SEPORDI_MEDIA_DIR = dir;
  process.env.BIZIN_MODE = "mock";
  process.env.PUBLIC_BASE_URL = "https://sepordi.example/";
});
afterAll(async () => {
  delete process.env.SEPORDI_MEDIA_DIR;
  delete process.env.BIZIN_MODE;
  delete process.env.PUBLIC_BASE_URL;
  await rm(dir, { recursive: true, force: true });
});

describe("product pictures through a catalogue import job (mock Bizin)", () => {
  it("uploads, sends the product's own file with image_urls, commits and settles on the job's row", async () => {
    const form = new FormData();
    form.set("file", new File([PNG], "front.png", { type: "image/png" }));
    const up = await upload(new Request(`http://localhost/panel/products/${PRODUCT}/images`, { method: "POST", headers: sameOrigin, body: form }), { params });
    expect(up.status).toBe(200);
    const state = await up.json();
    expect(state.images).toHaveLength(1);
    const file: string = state.images[0].file;

    const crossSite = await send(
      new Request("http://localhost/x", { method: "POST", headers: { "sec-fetch-site": "cross-site" }, body: JSON.stringify({ order: [file] }) }),
      { params },
    );
    expect(crossSite.status).toBe(403);

    const sent = await send(
      new Request("http://localhost/x", { method: "POST", headers: { ...sameOrigin, "content-type": "application/json" }, body: JSON.stringify({ order: [file] }) }),
      { params },
    );
    expect(sent.status).toBe(200);
    const pending = await sent.json();
    expect(pending.pendingJobId).toEqual(expect.any(String));

    const world = (globalThis as Record<symbol, MockWorld | undefined>)[Symbol.for("sepordi.bizin.mock.world")]!;
    const tenant = world.tenants.get("demo-nila")!;
    const rows = tenant.catalogRows!.get(pending.pendingJobId)!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ external_id: PRODUCT, action: "update", lines: [2] });
    expect(tenant.productImages!.get(PRODUCT)).toEqual([`https://sepordi.example/p/img/${file}`]);

    const res = await poll(new Request("http://localhost/x"), { params: Promise.resolve({ ext: PRODUCT, id: pending.pendingJobId }) });
    const body = await res.json();
    expect(body.outcome).toMatchObject({ status: "done", ok: true });
    expect(body.state).toEqual({ images: [{ file, url: `/p/img/${file}`, sent: true }], pendingJobId: null });
  });
});
