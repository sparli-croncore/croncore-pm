import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { repos } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const rows = await db.select().from(repos).where(eq(repos.projectId, id));
  return NextResponse.json({ repos: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const { owner, name, defaultBranch } = (await req.json()) as {
    owner?: string;
    name?: string;
    defaultBranch?: string;
  };
  if (!owner || !name) {
    return NextResponse.json({ error: "owner and name required" }, { status: 400 });
  }
  const [row] = await db
    .insert(repos)
    .values({ projectId: id, owner, name, defaultBranch: defaultBranch || "main" })
    .returning();
  return NextResponse.json({ repo: row });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const { repoId } = (await req.json()) as { repoId?: string };
  if (!repoId) return NextResponse.json({ error: "repoId required" }, { status: 400 });
  await db.delete(repos).where(and(eq(repos.id, repoId), eq(repos.projectId, id)));
  return NextResponse.json({ ok: true });
}
