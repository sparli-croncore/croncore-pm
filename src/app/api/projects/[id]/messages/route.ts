import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recent conversation for the Console thread.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      source: messages.source,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.projectId, id))
    .orderBy(asc(messages.createdAt))
    .limit(200);
  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      source: m.source,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

// Clear the conversation (start fresh).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  await db.delete(messages).where(eq(messages.projectId, id));
  return NextResponse.json({ ok: true });
}
