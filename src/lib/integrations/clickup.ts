import type { TaskProvider } from "./types";
import { execClickupComment, execClickupCreateTask, execClickupAssign } from "@/lib/tools/clickup";

/** ClickUp adapter — delegates to the ClickUp REST executors. */
export const clickupProvider: TaskProvider = {
  id: "clickup",
  comment: (ctx, p) => execClickupComment(ctx, p),
  createTask: (ctx, p) =>
    execClickupCreateTask(ctx, {
      listId: p.listId,
      name: p.name,
      description: p.description,
      assigneeClickupUserId: p.assigneeId,
    }),
  assign: (ctx, p) =>
    execClickupAssign(ctx, { taskId: p.taskId, assigneeClickupUserId: p.assigneeId }),
};
