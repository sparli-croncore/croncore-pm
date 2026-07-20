import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { knowledgeSources } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const rows = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.projectId, projectId))
    .orderBy(desc(knowledgeSources.updatedAt));
  return NextResponse.json({ knowledge: rows });
}

export async function POST(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { projectId, kind, title, content, sourceRef } = (await req.json()) as {
    projectId?: string;
    kind?: "repo" | "file" | "text" | "markdown";
    title?: string;
    content?: string;
    sourceRef?: string;
  };
  if (!projectId || !title || !content) {
    return NextResponse.json({ error: "projectId, title, content required" }, { status: 400 });
  }
  const [row] = await db
    .insert(knowledgeSources)
    .values({ projectId, kind: kind ?? "text", title, content, sourceRef })
    .returning();
  return NextResponse.json({ knowledge: row });
}

export async function DELETE(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
  return NextResponse.json({ ok: true });
}
