import { z } from "zod";
import { defineTool, type ToolContext } from "./types";
import { pendingActions } from "@/lib/db/schema";

const BASE = "https://api.clickup.com/api/v2";

function token(ctx: ToolContext): string {
  const t = ctx.credentials.clickupToken;
  if (!t) throw new Error("ClickUp token not configured (CLICKUP_API_TOKEN).");
  return t;
}

async function clickup<T = unknown>(
  ctx: ToolContext,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: token(ctx),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ── Read tools (execute directly) ─────────────────────────────────────────────

const listTasks = defineTool({
  name: "clickup_list_tasks",
  description:
    "List open tasks in this project's ClickUp list, with assignee and status. Use to see what's in flight before assigning or reporting.",
  schema: z.object({
    includeClosed: z.boolean().optional().describe("Include closed/done tasks"),
  }),
  run: async ({ includeClosed }, ctx) => {
    const listId = ctx.integrations.clickupListId;
    if (!listId) return "No ClickUp list is configured for this project.";
    const data = await clickup<{ tasks: ClickupTask[] }>(
      ctx,
      `/list/${listId}/task?include_closed=${includeClosed ? "true" : "false"}`,
    );
    if (!data.tasks?.length) return "No tasks found.";
    return data.tasks
      .map(
        (t) =>
          `- [${t.id}] ${t.name} — ${t.status?.status ?? "?"} — ${
            t.assignees?.map((a) => a.username).join(", ") || "unassigned"
          }`,
      )
      .join("\n");
  },
});

const getTask = defineTool({
  name: "clickup_get_task",
  description: "Get full details of one ClickUp task by id (description, status, assignees, dates).",
  schema: z.object({ taskId: z.string() }),
  run: async ({ taskId }, ctx) => {
    const t = await clickup<ClickupTask>(ctx, `/task/${taskId}`);
    return JSON.stringify(
      {
        id: t.id,
        name: t.name,
        status: t.status?.status,
        assignees: t.assignees?.map((a) => a.username),
        description: t.description,
        due_date: t.due_date,
      },
      null,
      2,
    );
  },
});

// ── Write tools (DRAFT-AND-APPROVE: create a pending action, do not execute) ───

const draftComment = defineTool({
  name: "clickup_draft_comment",
  description:
    "Draft a comment on a ClickUp task (e.g. a daily check-in or PR-review note for a developer). This does NOT post — it queues the comment for the user's approval. Posts as the user once approved.",
  schema: z.object({
    taskId: z.string(),
    comment: z.string().describe("The comment body (markdown allowed)"),
  }),
  run: async ({ taskId, comment }, ctx) => {
    await ctx.db.insert(pendingActions).values({
      projectId: ctx.projectId,
      type: "clickup_comment",
      summary: `Comment on task ${taskId}: ${comment.slice(0, 80)}…`,
      payload: { taskId, comment },
    });
    return `Queued a comment on task ${taskId} for approval.`;
  },
});

const draftCreateTask = defineTool({
  name: "clickup_draft_create_task",
  description:
    "Draft a new ClickUp task (e.g. a daily task for a developer). Queues for the user's approval; does not create until approved. To assign it, set assigneeClickupUserId to a NUMERIC ClickUp user ID from clickup_list_members — never a name. Omit the assignee if you don't have a valid numeric ID (the task will be created unassigned).",
  schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    assigneeClickupUserId: z
      .string()
      .optional()
      .describe("Numeric ClickUp user ID from clickup_list_members. Omit if unknown."),
  }),
  run: async ({ name, description, assigneeClickupUserId }, ctx) => {
    await ctx.db.insert(pendingActions).values({
      projectId: ctx.projectId,
      type: "clickup_create_task",
      summary: `Create task: ${name}`,
      payload: {
        listId: ctx.integrations.clickupListId,
        name,
        description,
        assigneeClickupUserId,
      },
    });
    return `Queued new task "${name}" for approval.`;
  },
});

const draftAssign = defineTool({
  name: "clickup_draft_assign_task",
  description:
    "Draft an assignment of an existing ClickUp task to a developer. Queues for approval. assigneeClickupUserId MUST be a numeric ClickUp user ID from clickup_list_members — never a name or guess.",
  schema: z.object({
    taskId: z.string(),
    assigneeClickupUserId: z
      .string()
      .describe("Numeric ClickUp user ID from clickup_list_members."),
  }),
  run: async ({ taskId, assigneeClickupUserId }, ctx) => {
    await ctx.db.insert(pendingActions).values({
      projectId: ctx.projectId,
      type: "clickup_assign_task",
      summary: `Assign task ${taskId} to user ${assigneeClickupUserId}`,
      payload: { taskId, assigneeClickupUserId },
    });
    return `Queued assignment of task ${taskId} for approval.`;
  },
});

const listMembers = defineTool({
  name: "clickup_list_members",
  description:
    "List the people who can be assigned tasks in this project's ClickUp list, with their NUMERIC ClickUp user IDs. Call this to get valid assignee IDs BEFORE drafting a task assignment or an assigned task — never guess an assignee ID.",
  schema: z.object({}),
  run: async (_input, ctx) => {
    const listId = ctx.integrations.clickupListId;
    if (!listId) return "No ClickUp list configured for this project (set it in the project's Settings tab).";
    const data = await clickup<{ members: Array<{ id: number; username: string; email?: string }> }>(
      ctx,
      `/list/${listId}/member`,
    );
    if (!data.members?.length) return "No members found for this list.";
    return data.members
      .map((m) => `- ${m.username} (ClickUp user id: ${m.id}${m.email ? `, ${m.email}` : ""})`)
      .join("\n");
  },
});

export const clickupTools = [listTasks, getTask, listMembers, draftComment, draftCreateTask, draftAssign];

// ── Executors (called by the approval route once you approve) ──────────────────

export async function execClickupComment(ctx: ToolContext, payload: ClickupCommentPayload) {
  return clickup(ctx, `/task/${payload.taskId}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment_text: payload.comment }),
  });
}

/** ClickUp assignees must be numeric user IDs — return one only if valid. */
function validAssigneeId(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  return /^\d+$/.test(s) ? Number(s) : undefined;
}

export async function execClickupCreateTask(ctx: ToolContext, payload: ClickupCreateTaskPayload) {
  // `||` (not `??`) so an empty stored list id falls back to the project's current one.
  const listId = payload.listId || ctx.integrations.clickupListId;
  if (!listId) {
    throw new Error(
      "No ClickUp List ID set for this project. Add it under the project's Settings tab.",
    );
  }
  // If the assignee isn't a valid numeric ClickUp user ID, create the task
  // UNASSIGNED rather than failing — better to have the task than a hard error.
  const assigneeId = validAssigneeId(payload.assigneeClickupUserId);
  return clickup(ctx, `/list/${listId}/task`, {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      assignees: assigneeId ? [assigneeId] : undefined,
    }),
  });
}

export async function execClickupAssign(ctx: ToolContext, payload: ClickupAssignPayload) {
  const assigneeId = validAssigneeId(payload.assigneeClickupUserId);
  if (!assigneeId) {
    throw new Error(
      `"${payload.assigneeClickupUserId}" is not a valid ClickUp user ID (must be numeric). Use clickup_list_members to get valid IDs, or set the developer's numeric ClickUp user ID under the Team tab.`,
    );
  }
  return clickup(ctx, `/task/${payload.taskId}`, {
    method: "PUT",
    body: JSON.stringify({ assignees: { add: [assigneeId] } }),
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClickupTask {
  id: string;
  name: string;
  description?: string;
  status?: { status: string };
  assignees?: Array<{ username: string }>;
  due_date?: string;
}
export interface ClickupCommentPayload {
  taskId: string;
  comment: string;
}
export interface ClickupCreateTaskPayload {
  listId?: string | null;
  name: string;
  description?: string;
  assigneeClickupUserId?: string;
}
export interface ClickupAssignPayload {
  taskId: string;
  assigneeClickupUserId: string;
}
