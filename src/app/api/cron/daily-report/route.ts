import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { runAgentForProject } from "@/lib/agent/run";

export const maxDuration = 300;
export const runtime = "nodejs";

const DAILY_PROMPT = [
  "Produce today's status report for this project.",
  "1. Review current ClickUp tasks (clickup_list_tasks) and open GitHub PRs (github_list_open_prs).",
  "2. Summarize: progress since likely-yesterday, blockers, stale/large/unreviewed PRs, and what each developer should focus on today.",
  "3. Save it with save_report (kind=daily).",
  "4. If a developer clearly needs a nudge or a task assigned, draft ClickUp comments/tasks for approval (do not post directly).",
  "Do NOT email anyone. Keep the report concise and outcome-first.",
].join("\n");

/**
 * Vercel Cron hits this each morning. It FANS OUT over every active project —
 * one agent run per project, each context-isolated — so scaling to N projects is
 * just more rows in the projects table.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const active = await db.select().from(projects).where(eq(projects.status, "active"));
  const results: Array<{ project: string; ok: boolean; summary?: string; error?: string }> = [];

  // Sequential to avoid API rate spikes; switch to Promise.all for speed at scale.
  for (const p of active) {
    try {
      const r = await runAgentForProject({
        projectId: p.id,
        prompt: DAILY_PROMPT,
        source: "cron",
      });
      results.push({ project: p.name, ok: true, summary: r.text.slice(0, 200) });
    } catch (err) {
      results.push({ project: p.name, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}
