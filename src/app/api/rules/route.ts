import { NextRequest, NextResponse } from "next/server";
import { eq, isNull } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { agentRules, ruleCategory } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ruleCategory.enumValues;

// GET ?projectId=  → that project's rules; omit → global rules (scopeProjectId null)
export async function GET(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const projectId = req.nextUrl.searchParams.get("projectId");
  const rows = await db
    .select()
    .from(agentRules)
    .where(projectId ? eq(agentRules.scopeProjectId, projectId) : isNull(agentRules.scopeProjectId))
    .orderBy(agentRules.createdAt);
  return NextResponse.json({ rules: rows, categories: CATEGORIES });
}

export async function POST(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { scopeProjectId, category, content } = (await req.json()) as {
    scopeProjectId?: string | null;
    category?: string;
    content?: string;
  };
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
  const safeCategory = (CATEGORIES as readonly string[]).includes(category ?? "")
    ? (category as (typeof CATEGORIES)[number])
    : "general";
  const [row] = await db
    .insert(agentRules)
    .values({ scopeProjectId: scopeProjectId ?? null, category: safeCategory, content })
    .returning();
  return NextResponse.json({ rule: row });
}

export async function PATCH(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { id, enabled } = (await req.json()) as { id?: string; enabled?: boolean };
  if (!id || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "id and enabled required" }, { status: 400 });
  }
  await db.update(agentRules).set({ enabled }).where(eq(agentRules.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(agentRules).where(eq(agentRules.id, id));
  return NextResponse.json({ ok: true });
}
