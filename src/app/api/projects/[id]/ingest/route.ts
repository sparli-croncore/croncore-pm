import { NextRequest, NextResponse } from "next/server";
import { runAgentForProject } from "@/lib/agent/run";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const INGEST_PROMPT = [
  "Build this project's knowledge base from its repositories.",
  "For EACH repo configured on this project:",
  "1. Call github_read_repo to read it (description, branches, contributors, README, structure).",
  "2. Call save_knowledge with kind='repo', sourceRef='owner/repo', and a thorough summary covering:",
  "   - what the project is and its architecture / main components",
  "   - the branches and what each is for",
  "   - who is working on it (top contributors) and likely ownership areas",
  "   - tech stack, conventions, and how to run/test it",
  "Be thorough and concrete. After saving all repos, reply with a short confirmation listing what you saved.",
].join("\n");

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  try {
    const result = await runAgentForProject({
      projectId: id,
      prompt: INGEST_PROMPT,
      source: "dashboard",
      tier: "smart",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
