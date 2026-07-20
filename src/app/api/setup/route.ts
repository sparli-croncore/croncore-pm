import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { upsertEnv } from "@/lib/env-file";
import { resetDb, ensureReady, getDbHealth } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Initialize the database.
 *  - No body / no databaseUrl → use the built-in embedded DB (zero config).
 *  - { databaseUrl } → connect an external Postgres (e.g. Neon) for production.
 * Either way: connect, create all tables, seed the template.
 */
export async function POST(req: NextRequest) {
  let databaseUrl: string | undefined;
  try {
    ({ databaseUrl } = (await req.json()) as { databaseUrl?: string });
  } catch {
    /* empty body = embedded */
  }

  if (databaseUrl) {
    if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
      return NextResponse.json(
        { error: "A valid postgres:// connection string is required." },
        { status: 400 },
      );
    }
    const updates: Record<string, string> = { DATABASE_URL: databaseUrl };
    if (!process.env.ENCRYPTION_KEY) updates.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    await upsertEnv(updates);
    await resetDb();
  }

  try {
    await ensureReady();
    const health = await getDbHealth();
    return NextResponse.json({ ok: true, mode: health.mode, migrated: health.migrated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
