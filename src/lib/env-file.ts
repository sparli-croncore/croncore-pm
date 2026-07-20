import { promises as fs } from "node:fs";
import path from "node:path";

const ENV_PATH = path.join(process.cwd(), ".env.local");

/**
 * Upsert keys in .env.local (local/self-hosted only — Vercel's FS is read-only).
 * Also sets them on process.env so the running server uses them immediately,
 * without waiting for a restart. Returns whether the file write succeeded.
 */
export async function upsertEnv(updates: Record<string, string>): Promise<boolean> {
  // Apply to the live process first so the current request can proceed regardless.
  for (const [k, v] of Object.entries(updates)) process.env[k] = v;

  let existing = "";
  try {
    existing = await fs.readFile(ENV_PATH, "utf8");
  } catch {
    /* file may not exist yet */
  }

  const lines = existing.split("\n");
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && updates[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}=${quote(updates[m[1]])}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${quote(v)}`);
  }

  try {
    await fs.writeFile(ENV_PATH, out.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
    return true;
  } catch {
    // Read-only FS (e.g. Vercel) — process.env is set for this process, but the
    // caller should tell the user to set these in their host's env settings.
    return false;
  }
}

function quote(v: string): string {
  return /[\s"#']/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}
