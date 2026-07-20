import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { projects, projectIntegrations, pendingActions, reports } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [integ] = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.projectId, id));

  const pending = await db
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.projectId, id), eq(pendingActions.status, "pending")))
    .orderBy(desc(pendingActions.createdAt));

  const recentReports = await db
    .select()
    .from(reports)
    .where(eq(reports.projectId, id))
    .orderBy(desc(reports.createdAt))
    .limit(5);

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      brief: project.brief,
      clickupListId: integ?.clickupListId ?? null,
    },
    pending: pending.map((p) => ({
      id: p.id,
      type: p.type,
      summary: p.summary,
      createdAt: p.createdAt.toISOString(),
    })),
    reports: recentReports.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// Update project settings (brief, ClickUp list, status).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  const body = (await req.json()) as {
    brief?: string;
    clickupListId?: string;
    status?: "active" | "paused" | "archived";
  };

  if (body.brief !== undefined || body.status) {
    await db
      .update(projects)
      .set({
        ...(body.brief !== undefined ? { brief: body.brief } : {}),
        ...(body.status ? { status: body.status } : {}),
      })
      .where(eq(projects.id, id));
  }
  if (body.clickupListId !== undefined) {
    await db
      .update(projectIntegrations)
      .set({ clickupListId: body.clickupListId, updatedAt: new Date() })
      .where(eq(projectIntegrations.projectId, id));
  }
  return NextResponse.json({ ok: true });
}

// Delete a project (cascades to its repos, team, knowledge, rules, reports, etc.).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureReady();
  const { id } = await params;
  await db.delete(projects).where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
