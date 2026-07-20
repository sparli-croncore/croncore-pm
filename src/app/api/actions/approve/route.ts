import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { pendingActions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { buildProjectContext } from "@/lib/agent/context";
import { getTaskProvider } from "@/lib/integrations";
import type {
  ClickupCommentPayload,
  ClickupCreateTaskPayload,
  ClickupAssignPayload,
} from "@/lib/tools/clickup";
import { execEmailSend, type EmailSendPayload } from "@/lib/tools/gmail";

export const runtime = "nodejs";

/**
 * Approve or reject a queued action. This is the gate that makes the agent safe:
 * nothing touches ClickUp or a client inbox until it passes through here.
 */
export async function POST(req: NextRequest) {
  await requireUser();
  await ensureReady();
  const { actionId, decision } = (await req.json()) as {
    actionId?: string;
    decision?: "approve" | "reject";
  };
  if (!actionId || !decision) {
    return NextResponse.json({ error: "actionId and decision required" }, { status: 400 });
  }

  const [action] = await db.select().from(pendingActions).where(eq(pendingActions.id, actionId));
  if (!action) return NextResponse.json({ error: "action not found" }, { status: 404 });
  if (action.status !== "pending") {
    return NextResponse.json({ error: `action already ${action.status}` }, { status: 409 });
  }

  if (decision === "reject") {
    await db
      .update(pendingActions)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(pendingActions.id, actionId));
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Approved → execute against the external system.
  const { ctx } = await buildProjectContext(action.projectId, "dashboard");
  // Task actions go through the pluggable provider (ClickUp today). Slack/Trello
  // adapters drop in here later without changing this route.
  const tasks = getTaskProvider("clickup");
  try {
    let result: unknown;
    switch (action.type) {
      case "clickup_comment": {
        const p = action.payload as ClickupCommentPayload;
        result = await tasks.comment(ctx, p);
        break;
      }
      case "clickup_create_task": {
        const p = action.payload as ClickupCreateTaskPayload;
        result = await tasks.createTask(ctx, {
          listId: p.listId,
          name: p.name,
          description: p.description,
          assigneeId: p.assigneeClickupUserId,
        });
        break;
      }
      case "clickup_assign_task": {
        const p = action.payload as ClickupAssignPayload;
        result = await tasks.assign(ctx, { taskId: p.taskId, assigneeId: p.assigneeClickupUserId });
        break;
      }
      case "email_send":
        result = await execEmailSend(ctx, action.payload as EmailSendPayload);
        break;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
    await db
      .update(pendingActions)
      .set({ status: "executed", result: result as object, resolvedAt: new Date() })
      .where(eq(pendingActions.id, actionId));
    return NextResponse.json({ ok: true, status: "executed", result });
  } catch (err) {
    await db
      .update(pendingActions)
      .set({ status: "failed", result: { error: String(err) }, resolvedAt: new Date() })
      .where(eq(pendingActions.id, actionId));
    return NextResponse.json({ ok: false, status: "failed", error: String(err) }, { status: 500 });
  }
}
