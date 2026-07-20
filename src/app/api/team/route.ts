import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { users, userRole } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = userRole.enumValues;

export async function GET() {
  await requireUser();
  await ensureReady();
  const rows = await db.select().from(users).orderBy(users.createdAt);
  return NextResponse.json({ users: rows, roles: ROLES });
}

export async function POST(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { email, name, role } = (await req.json()) as {
    email?: string;
    name?: string;
    role?: string;
  };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const safeRole = (ROLES as readonly string[]).includes(role ?? "")
    ? (role as (typeof ROLES)[number])
    : "viewer";
  const [created] = await db
    .insert(users)
    .values({ email, name, role: safeRole })
    .onConflictDoUpdate({ target: users.email, set: { name, role: safeRole } })
    .returning();
  return NextResponse.json({ user: created });
}

export async function DELETE(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
