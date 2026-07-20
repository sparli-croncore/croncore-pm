import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the project's chat threads (most recently used first).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, id))
    .orderBy(desc(conversations.updatedAt));
  return NextResponse.json({
    conversations: rows.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

// Start a new chat thread.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const { title } = (await req.json().catch(() => ({}))) as { title?: string };
  const [row] = await db
    .insert(conversations)
    .values({ projectId: id, title: title?.trim() || "New chat" })
    .returning();
  return NextResponse.json({
    conversation: { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() },
  });
}
