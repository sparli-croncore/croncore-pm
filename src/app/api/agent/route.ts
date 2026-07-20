import { NextRequest, NextResponse } from "next/server";
import { runAgentForProject } from "@/lib/agent/run";
import { requireUser } from "@/lib/auth";
import type { ProviderId, ModelTier } from "@/lib/providers";

// Agent runs can take a while (tool loop) — give the function room.
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = (await req.json()) as {
    projectId?: string;
    prompt?: string;
    provider?: ProviderId;
    tier?: ModelTier;
    conversationId?: string;
  };

  if (!body.projectId || !body.prompt) {
    return NextResponse.json({ error: "projectId and prompt are required" }, { status: 400 });
  }

  try {
    const result = await runAgentForProject({
      projectId: body.projectId,
      prompt: body.prompt,
      provider: body.provider,
      tier: body.tier,
      conversationId: body.conversationId,
      source: "dashboard",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
