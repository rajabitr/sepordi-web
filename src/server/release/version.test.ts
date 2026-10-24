import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveReleaseVersion } from "./version";

describe("resolveReleaseVersion", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "sepordi-version-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const sha = "0123456789abcdef0123456789abcdef01234567";

  it("reads the sha from manifest.json at the release root", () => {
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ sha, short_sha: sha.slice(0, 7) }));
    expect(resolveReleaseVersion(dir, { SEPORDI_VERSION: "from-env" })).toBe(sha);
  });

  it("falls back to SEPORDI_VERSION without a manifest", () => {
    expect(resolveReleaseVersion(dir, { SEPORDI_VERSION: " abc1234 " })).toBe("abc1234");
  });

  it("falls back to SEPORDI_VERSION when the manifest is unreadable or has no sha", () => {
    writeFileSync(path.join(dir, "manifest.json"), "{not json");
    expect(resolveReleaseVersion(dir, { SEPORDI_VERSION: "abc1234" })).toBe("abc1234");
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ sha: "" }));
    expect(resolveReleaseVersion(dir, { SEPORDI_VERSION: "abc1234" })).toBe("abc1234");
  });

  it("is dev with neither", () => {
    expect(resolveReleaseVersion(dir, {})).toBe("dev");
    expect(resolveReleaseVersion(dir, { SEPORDI_VERSION: "  " })).toBe("dev");
  });
});
