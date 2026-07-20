import { z } from "zod";
import { defineTool } from "./types";
import { reports, agentMemory } from "@/lib/db/schema";

const saveReport = defineTool({
  name: "save_report",
  description:
    "Save a status report for this project (e.g. the daily summary). Body is markdown. Use this to record the report you've compiled so it shows on the dashboard.",
  schema: z.object({
    kind: z.enum(["daily", "weekly", "adhoc"]).default("daily"),
    title: z.string(),
    body: z.string().describe("Report content in markdown"),
  }),
  run: async ({ kind, title, body }, ctx) => {
    await ctx.db.insert(reports).values({ projectId: ctx.projectId, kind, title, body });
    return `Saved ${kind} report "${title}".`;
  },
});

const remember = defineTool({
  name: "remember",
  description:
    "Persist a durable fact, decision, or preference about THIS project so future runs recall it (e.g. 'client prefers Friday updates', 'deadline is May 30'). Scoped to this project only.",
  schema: z.object({
    type: z.enum(["fact", "decision", "preference"]).default("fact"),
    content: z.string(),
  }),
  run: async ({ type, content }, ctx) => {
    await ctx.db.insert(agentMemory).values({ projectId: ctx.projectId, type, content });
    return `Remembered (${type}): ${content}`;
  },
});

export const reportingTools = [saveReport, remember];
