import type { ToolContext } from "@/lib/tools/types";

/**
 * Task-management provider abstraction. ClickUp is the first implementation;
 * Slack / Trello / Linear become drop-in adapters later without touching agent
 * logic — they just implement this interface and register in ./index.ts.
 */
export interface TaskProvider {
  readonly id: string;
  comment(ctx: ToolContext, p: { taskId: string; comment: string }): Promise<unknown>;
  createTask(
    ctx: ToolContext,
    p: { listId?: string | null; name: string; description?: string; assigneeId?: string },
  ): Promise<unknown>;
  assign(ctx: ToolContext, p: { taskId: string; assigneeId: string }): Promise<unknown>;
}
