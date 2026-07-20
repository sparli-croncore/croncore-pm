import { NextResponse } from "next/server";
import { getDbHealth } from "@/lib/db";
import { isEncryptionConfigured } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getDbHealth();
  return NextResponse.json({
    ...health,
    encryptionConfigured: isEncryptionConfigured(),
    ready: health.migrated,
  });
}
