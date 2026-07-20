import { PGlite } from "@electric-sql/pglite";
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function toKeyBuffer(raw) {
  for (const enc of ["base64", "hex"]) {
    try {
      const b = Buffer.from(raw, enc);
      if (b.length === 32) return b;
    } catch {}
  }
  return createHash("sha256").update(raw).digest();
}
const keyRaw = process.env.ENCRYPTION_KEY ?? readFileSync(".croncore/encryption.key", "utf8").trim();
const key = toKeyBuffer(keyRaw);
function decrypt(stored) {
  const [v, iv, tag, ct] = stored.split(":");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

const db = await PGlite.create(".croncore/pgdata");
const res = await db.query(
  "select encrypted_value from app_credentials where name='claude_code_oauth_token' and scope_project_id is null limit 1",
);
if (!res.rows.length) {
  console.log("NO TOKEN IN DB");
  process.exit(0);
}
const token = decrypt(res.rows[0].encrypted_value);
console.log("token prefix:", token.slice(0, 14), "len:", token.length);

const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token };
delete env.ANTHROPIC_API_KEY;

const r = spawnSync(
  "node",
  ["node_modules/@anthropic-ai/claude-agent-sdk/cli.js", "-p", "Reply with the word READY only.", "--output-format", "json"],
  { env, encoding: "utf8", timeout: 120000 },
);
console.log("exit code:", r.status);
console.log("STDOUT:", (r.stdout || "").slice(0, 1500));
console.log("STDERR:", (r.stderr || "").slice(0, 2000));
if (r.error) console.log("SPAWN ERROR:", r.error.message);
