import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyBizinSignature } from "./verify";

// The contract's published test vector (partner-api.md §9.4).
const SECRET = "whsec_test_vector_secret";
const T = 1760184000;
const BODY = '{"id":"evt_3b9e","type":"ping"}';
const HEADER = "t=1760184000,v1=e8cc33d3f817d334e805c078eb22b4da1a145dcb460dd29b1dbdbd6f79519d8d";

const sign = (secret: string, t: number, body: string) =>
  createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

describe("verifyBizinSignature", () => {
  it("accepts the published test vector", () => {
    expect(verifyBizinSignature(HEADER, Buffer.from(BODY), [SECRET], T)).toEqual({ ok: true, timestamp: T });
  });

  it("accepts a string body and the edges of the 300 s window", () => {
    expect(verifyBizinSignature(HEADER, BODY, [SECRET], T + 300).ok).toBe(true);
    expect(verifyBizinSignature(HEADER, BODY, [SECRET], T - 300).ok).toBe(true);
  });

  it("refuses a timestamp outside the window", () => {
    expect(verifyBizinSignature(HEADER, BODY, [SECRET], T + 301)).toEqual({ ok: false, reason: "expired" });
    expect(verifyBizinSignature(HEADER, BODY, [SECRET], T - 301)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a tampered body, a re-encoded body and a wrong secret", () => {
    expect(verifyBizinSignature(HEADER, BODY.replace("ping", "pong"), [SECRET], T)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyBizinSignature(HEADER, JSON.stringify(JSON.parse(BODY), null, 1), [SECRET], T).ok).toBe(false);
    expect(verifyBizinSignature(HEADER, BODY, ["whsec_other"], T)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyBizinSignature(HEADER, BODY, ["test_vector_secret"], T).ok).toBe(false);
  });

  it("refuses a tampered timestamp even inside the window", () => {
    const header = HEADER.replace(`t=${T}`, `t=${T + 1}`);
    expect(verifyBizinSignature(header, BODY, [SECRET], T)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("accepts any v1 during a rotation, and either of two configured secrets", () => {
    const fresh = sign("whsec_new", T, BODY);
    const both = `t=${T},v1=${fresh},v1=${sign(SECRET, T, BODY)}`;
    expect(verifyBizinSignature(both, BODY, [SECRET], T).ok).toBe(true);
    expect(verifyBizinSignature(both, BODY, ["whsec_new"], T).ok).toBe(true);
    expect(verifyBizinSignature(HEADER, BODY, ["whsec_new", SECRET], T).ok).toBe(true);
  });

  it("refuses malformed headers and a missing secret", () => {
    for (const h of [undefined, "", "v1=abc", `t=${T}`, `t=abc,v1=${sign(SECRET, T, BODY)}`, `t=${T},t=${T},v1=x`, "garbage"]) {
      expect(verifyBizinSignature(h, BODY, [SECRET], T).ok).toBe(false);
    }
    expect(verifyBizinSignature(HEADER, BODY, [], T)).toEqual({ ok: false, reason: "no_secret" });
  });

  it("refuses a signature of the wrong length or case", () => {
    expect(verifyBizinSignature(HEADER.slice(0, -2), BODY, [SECRET], T).ok).toBe(false);
    expect(verifyBizinSignature(HEADER.toUpperCase().replace("T=", "t=").replace("V1=", "v1="), BODY, [SECRET], T).ok).toBe(false);
  });
});
