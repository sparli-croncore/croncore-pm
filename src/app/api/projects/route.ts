import { NextRequest, NextResponse } from "next/server";
import { db, ensureReady } from "@/lib/db";
import { orgs, projects, projectIntegrations, repos } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  await requireUser();
  await ensureReady();
  const rows = await db.select().from(projects);
  return NextResponse.json({ projects: rows });
}

/**
 * Onboard a new project. This is the ENTIRE "add a project" flow at scale —
 * a row in `projects` (+ its integration config). Developers/clients/repos are
 * attached the same way via their own rows (add /api/projects/[id]/{developers,
 * clients,repos} routes following this shape).
 */
export async function POST(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const body = (await req.json()) as {
    name?: string;
    brief?: string;
    clickupListId?: string;
    clickupSpaceId?: string;
    repos?: Array<{ owner: string; name: string; defaultBranch?: string }>;
  };
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Single org today: reuse the first, or create "Croncore".
  let [org] = await db.select().from(orgs).limit(1);
  if (!org) {
    [org] = await db.insert(orgs).values({ name: "Croncore" }).returning();
  }

  const [project] = await db
    .insert(projects)
    .values({ orgId: org.id, name: body.name, brief: body.brief })
    .returning();

  await db.insert(projectIntegrations).values({
    projectId: project.id,
    clickupListId: body.clickupListId,
    clickupSpaceId: body.clickupSpaceId,
  });

  const validRepos = (body.repos ?? []).filter((r) => r.owner && r.name);
  if (validRepos.length) {
    await db.insert(repos).values(
      validRepos.map((r) => ({
        projectId: project.id,
        owner: r.owner,
        name: r.name,
        defaultBranch: r.defaultBranch || "main",
      })),
    );
  }

  return NextResponse.json({ project });
}
