import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { appCredentials } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { CREDENTIALS, KEY_CATALOG, type CredentialName } from "@/lib/credentials";
import { encryptSecret, decryptSecret, maskSecret, isEncryptionConfigured } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidName(n: string): n is CredentialName {
  return n in CREDENTIALS;
}

// GET → status of every key (set? masked preview? from DB or env?)
export async function GET() {
  await requireUser();
  await ensureReady();
  const rows = await db
    .select()
    .from(appCredentials)
    .where(isNull(appCredentials.scopeProjectId));
  const byName = new Map(rows.map((r) => [r.name, r.encryptedValue]));

  const items = KEY_CATALOG.map((k) => {
    const enc = byName.get(k.name);
    if (enc) {
      let masked = "••••";
      try {
        masked = maskSecret(decryptSecret(enc));
      } catch {
        masked = "(decrypt error — check ENCRYPTION_KEY)";
      }
      return { ...k, set: true, source: "db" as const, masked };
    }
    const envVal = process.env[CREDENTIALS[k.name]];
    if (envVal) return { ...k, set: true, source: "env" as const, masked: maskSecret(envVal) };
    return { ...k, set: false, source: null, masked: null };
  });

  return NextResponse.json({ items, encryptionConfigured: isEncryptionConfigured() });
}

// POST { name, value } → encrypt + upsert global credential
export async function POST(req: NextRequest) {
  await requireUser();
  await ensureReady();
  if (!isEncryptionConfigured()) {
    return NextResponse.json({ error: "ENCRYPTION_KEY not set — run setup first." }, { status: 400 });
  }
  const { name, value } = (await req.json()) as { name?: string; value?: string };
  if (!name || !isValidName(name) || !value) {
    return NextResponse.json({ error: "valid name and value required" }, { status: 400 });
  }

  // Strip whitespace — keys/tokens never contain it, but copy/paste can add
  // stray newlines/spaces that silently break auth. gmail_sender (an email) is
  // also whitespace-free, so this is safe for every credential in the catalog.
  const encryptedValue = encryptSecret(value.replace(/\s+/g, ""));
  const [existing] = await db
    .select()
    .from(appCredentials)
    .where(and(eq(appCredentials.name, name), isNull(appCredentials.scopeProjectId)))
    .limit(1);

  if (existing) {
    await db
      .update(appCredentials)
      .set({ encryptedValue, updatedAt: new Date() })
      .where(eq(appCredentials.id, existing.id));
  } else {
    await db.insert(appCredentials).values({ name, encryptedValue });
  }
  return NextResponse.json({ ok: true });
}

// DELETE { name } → remove DB override (env fallback, if any, remains)
export async function DELETE(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { name } = (await req.json()) as { name?: string };
  if (!name || !isValidName(name)) {
    return NextResponse.json({ error: "valid name required" }, { status: 400 });
  }
  await db
    .delete(appCredentials)
    .where(and(eq(appCredentials.name, name), isNull(appCredentials.scopeProjectId)));
  return NextResponse.json({ ok: true });
}
