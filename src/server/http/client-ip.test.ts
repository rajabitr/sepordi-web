import { describe, expect, it } from "vitest";

import { clientIpFrom } from "./client-ip";

describe("clientIpFrom", () => {
  it("takes the first X-Forwarded-For hop, not the router", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "5.160.1.2, 172.70.1.1, 10.0.0.1" }))).toBe("5.160.1.2");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " 2a01:4f8::1 " }))).toBe("2a01:4f8::1");
  });

  it("falls back to X-Real-IP, then unknown", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
