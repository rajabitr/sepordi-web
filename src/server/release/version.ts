import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The commit this server runs. deploy/package.sh puts manifest.json at the release root, which is the
 * standalone server's cwd; the CI verify job and the VM's pull-deploy compare it with the sha they shipped.
 */
export function resolveReleaseVersion(cwd: string, env: Record<string, string | undefined>): string {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path.join(cwd, "manifest.json"), "utf8"));
    if (manifest && typeof manifest === "object" && "sha" in manifest) {
      const sha = manifest.sha;
      if (typeof sha === "string" && sha.trim() !== "") return sha.trim();
    }
  } catch {
    // No manifest outside a packaged release.
  }
  const fromEnv = env.SEPORDI_VERSION?.trim();
  return fromEnv ? fromEnv : "dev";
}

let cached: string | undefined;

export function releaseVersion(): string {
  cached ??= resolveReleaseVersion(process.cwd(), process.env);
  return cached;
}
