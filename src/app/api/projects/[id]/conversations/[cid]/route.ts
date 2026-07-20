import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → messages in this thread
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  await requireUser();
  await ensureReady();
  const { cid } = await params;
  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, cid))
    .orderBy(asc(messages.createdAt))
    .limit(500);
  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

// PATCH → rename
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  await requireUser();
  await ensureReady();
  const { id, cid } = await params;
  const { title } = (await req.json()) as { title?: string };
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  await db
    .update(conversations)
    .set({ title: title.trim() })
    .where(and(eq(conversations.id, cid), eq(conversations.projectId, id)));
  return NextResponse.json({ ok: true });
}

// DELETE → remove thread + its messages
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  await requireUser();
  await ensureReady();
  const { id, cid } = await params;
  await db.delete(conversations).where(and(eq(conversations.id, cid), eq(conversations.projectId, id)));
  return NextResponse.json({ ok: true });
}
