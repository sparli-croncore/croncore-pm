import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, ensureReady, getDbHealth } from "@/lib/db";
import { projects, knowledgeSources, reports } from "@/lib/db/schema";
import { getCredential } from "@/lib/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function count(table: typeof projects | typeof knowledgeSources | typeof reports): Promise<number> {
  try {
    const res = await db.select({ n: sql<number>`count(*)::int` }).from(table);
    return res[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  const health = await getDbHealth();
  const dbReady = health.migrated;

  let hasProvider = false;
  let projectsCount = 0;
  let knowledgeCount = 0;
  let reportsCount = 0;

  if (dbReady) {
    await ensureReady();
    const [apiKey, oauth] = await Promise.all([
      getCredential("anthropic_api_key"),
      getCredential("claude_code_oauth_token"),
    ]);
    hasProvider = Boolean(apiKey || oauth);
    [projectsCount, knowledgeCount, reportsCount] = await Promise.all([
      count(projects),
      count(knowledgeSources),
      count(reports),
    ]);
  }

  const steps = [
    { id: "db", title: "Initialize the database", done: dbReady, href: "/setup" },
    { id: "key", title: "Add an Anthropic API key or Claude Code token", done: hasProvider, href: "/keys" },
    { id: "project", title: "Create a project & connect its repo", done: projectsCount > 0, href: "/projects/new" },
    { id: "knowledge", title: "Build the project knowledge base", done: knowledgeCount > 0, href: "/" },
    { id: "standup", title: "Run your first standup / report", done: reportsCount > 0, href: "/" },
  ];

  return NextResponse.json({
    steps,
    complete: steps.every((s) => s.done),
    counts: { projects: projectsCount, knowledge: knowledgeCount, reports: reportsCount },
  });
}
