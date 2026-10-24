import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const encryptScript = path.join(root, "deploy/encrypt-env.sh");
const pullScript = path.join(root, "deploy/server/sepordi-pull-deploy.sh");

const hasCms = spawnSync("openssl", ["cms", "-help"], { stdio: "ignore" }).status === 0;

function run(cmd: string, args: string[], opts: { env?: Record<string, string>; input?: string | Buffer } = {}) {
  const r = spawnSync(cmd, args, { env: { ...process.env, ...opts.env }, input: opts.input });
  return { status: r.status, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

describe.skipIf(!hasCms)("sealed env bundle (deploy/encrypt-env.sh -> sepordi-pull-deploy merge_env)", () => {
  let dir: string;
  let key: string;
  let cert: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "sepordi-env-"));
    key = path.join(dir, "env-key.pem");
    cert = path.join(dir, "env-cert.pem");
    const r = run("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=sepordi-env-test",
      "-keyout", key, "-out", cert,
    ]);
    expect(r.status, r.stderr).toBe(0);
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const encrypt = (out: string, ...args: string[]) =>
    run("bash", [encryptScript, ...args], { env: { SEPORDI_ENV_CERT: cert, SEPORDI_ENV_OUT: out } });

  const decryptAndMerge = (enc: string, envFile: string, out: string) =>
    run("bash", [
      "-c",
      'source "$1"; ENV_KEY="$5"; ENV_CERT="$6"; NODE=node; decrypt_env "$2" | merge_env "$3" "$4"',
      "sepordi-env-test", pullScript, enc, envFile, out, key, cert,
    ]);

  it("round-trips: values reach the env file, other keys stay untouched", () => {
    const enc = path.join(dir, "roundtrip.enc");
    const urlFile = path.join(dir, "url.txt");
    writeFileSync(urlFile, "https://sepordi.ir\n");
    const e = encrypt(enc, "KAVENEGAR_API_KEY=s3cret-value", `PUBLIC_BASE_URL=@${urlFile}`, "ZARINPAL_SANDBOX=");
    expect(e.status, e.stderr).toBe(0);
    expect(e.stdout).not.toContain("s3cret-value");
    expect(readFileSync(enc).includes("s3cret-value")).toBe(false);

    const envFile = path.join(dir, "env");
    writeFileSync(envFile, "SESSION_SECRET=keep-me\nKAVENEGAR_API_KEY=old\n# note\nKAVENEGAR_API_KEY=older-dup\n");
    const out = path.join(dir, "env.next");
    writeFileSync(out, "");
    const m = decryptAndMerge(enc, envFile, out);
    expect(m.status, m.stderr).toBe(0);
    expect(m.stdout).toBe("KAVENEGAR_API_KEY PUBLIC_BASE_URL ZARINPAL_SANDBOX");
    expect(readFileSync(out, "utf8")).toBe(
      "SESSION_SECRET=keep-me\nKAVENEGAR_API_KEY=s3cret-value\n# note\nPUBLIC_BASE_URL=https://sepordi.ir\nZARINPAL_SANDBOX=\n",
    );
  });

  it("encrypt-env refuses a name outside the allowlist and writes nothing", () => {
    const enc = path.join(dir, "refused.enc");
    const e = encrypt(enc, "KAVENEGAR_API_KEY=ok", "SESSION_SECRET=leak-me");
    expect(e.status).not.toBe(0);
    expect(e.stderr).toContain("SESSION_SECRET is not an allowed name");
    expect(e.stderr + e.stdout).not.toContain("leak-me");
    expect(existsSync(enc)).toBe(false);
  });

  it("encrypt-env refuses a multi-line value", () => {
    const enc = path.join(dir, "multiline.enc");
    const f = path.join(dir, "two-lines.txt");
    writeFileSync(f, "line-one\nline-two\n");
    const e = encrypt(enc, `BIZIN_PARTNER_KEY=@${f}`);
    expect(e.status).not.toBe(0);
    expect(e.stderr).toContain("BIZIN_PARTNER_KEY: the value must be a single line");
    expect(existsSync(enc)).toBe(false);
  });

  it("the VM refuses a bundle with a name outside the allowlist, without echoing its value", () => {
    const enc = path.join(dir, "forged.enc");
    const sealed = run("openssl", ["cms", "-encrypt", "-aes256", "-binary", "-outform", "DER", "-out", enc, "-recip", cert], {
      input: "PUBLIC_BASE_URL=https://sepordi.ir\nSESSION_SECRET=leak-me\n",
    });
    expect(sealed.status, sealed.stderr).toBe(0);
    const envFile = path.join(dir, "env-forged");
    writeFileSync(envFile, "SESSION_SECRET=keep-me\n");
    const out = path.join(dir, "env-forged.next");
    writeFileSync(out, "");
    const m = decryptAndMerge(enc, envFile, out);
    expect(m.status).not.toBe(0);
    expect(m.stderr).toContain("SESSION_SECRET is not an allowed name");
    expect(m.stderr + m.stdout).not.toContain("leak-me");
    expect(readFileSync(out, "utf8")).toBe("");
  });

  it("both scripts carry the same allowlist", () => {
    const list = (file: string, variable: string) =>
      readFileSync(file, "utf8").match(new RegExp(`^${variable}="([^"]+)"$`, "m"))?.[1];
    expect(list(encryptScript, "ALLOWED")).toBeTruthy();
    expect(list(encryptScript, "ALLOWED")).toBe(list(pullScript, "ENV_ALLOWED"));
  });
});
