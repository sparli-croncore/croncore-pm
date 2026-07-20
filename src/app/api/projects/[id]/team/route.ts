import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import {
  developers,
  projectDevelopers,
  clients,
  projectClients,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → developers + clients for the project
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;

  const devs = await db
    .select({
      id: developers.id,
      name: developers.name,
      email: developers.email,
      clickupUserId: developers.clickupUserId,
      githubLogin: developers.githubLogin,
      role: projectDevelopers.role,
    })
    .from(projectDevelopers)
    .innerJoin(developers, eq(projectDevelopers.developerId, developers.id))
    .where(eq(projectDevelopers.projectId, id));

  const cls = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      company: clients.company,
      isPrimary: projectClients.isPrimary,
    })
    .from(projectClients)
    .innerJoin(clients, eq(projectClients.clientId, clients.id))
    .where(eq(projectClients.projectId, id));

  return NextResponse.json({ developers: devs, clients: cls });
}

// POST { kind: "developer"|"client", ... } → create + link to project
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const body = (await req.json()) as Record<string, string | boolean | undefined>;

  if (body.kind === "developer") {
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const [dev] = await db
      .insert(developers)
      .values({
        name: String(body.name),
        email: body.email ? String(body.email) : undefined,
        clickupUserId: body.clickupUserId ? String(body.clickupUserId) : undefined,
        githubLogin: body.githubLogin ? String(body.githubLogin) : undefined,
      })
      .returning();
    await db.insert(projectDevelopers).values({
      projectId: id,
      developerId: dev.id,
      role: body.role ? String(body.role) : undefined,
    });
    return NextResponse.json({ developer: dev });
  }

  if (body.kind === "client") {
    if (!body.name || !body.email) {
      return NextResponse.json({ error: "name and email required" }, { status: 400 });
    }
    const [client] = await db
      .insert(clients)
      .values({
        name: String(body.name),
        email: String(body.email),
        company: body.company ? String(body.company) : undefined,
      })
      .returning();
    await db.insert(projectClients).values({
      projectId: id,
      clientId: client.id,
      isPrimary: Boolean(body.isPrimary),
    });
    return NextResponse.json({ client });
  }

  return NextResponse.json({ error: "kind must be developer or client" }, { status: 400 });
}

// DELETE { kind, memberId } → unlink + remove
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const { kind, memberId } = (await req.json()) as { kind?: string; memberId?: string };
  if (!kind || !memberId) {
    return NextResponse.json({ error: "kind and memberId required" }, { status: 400 });
  }
  if (kind === "developer") {
    await db
      .delete(projectDevelopers)
      .where(
        and(eq(projectDevelopers.projectId, id), eq(projectDevelopers.developerId, memberId)),
      );
    await db.delete(developers).where(eq(developers.id, memberId));
  } else {
    await db
      .delete(projectClients)
      .where(and(eq(projectClients.projectId, id), eq(projectClients.clientId, memberId)));
    await db.delete(clients).where(eq(clients.id, memberId));
  }
  return NextResponse.json({ ok: true });
}
