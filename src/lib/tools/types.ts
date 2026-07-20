import { z } from "zod";
import type { DB } from "@/lib/db";

/**
 * Resolved, project-scoped context handed to every tool call.
 * Built once per agent run (see lib/agent/run.ts) so a tool never sees more than
 * the current project's data or credentials.
 */
export interface ToolContext {
  db: DB;
  projectId: string;
  projectName: string;
  /** Per-project integration config (which ClickUp list, which repos, etc.). */
  integrations: {
    clickupListId?: string | null;
    clickupSpaceId?: string | null;
  };
  repos: Array<{ owner: string; name: string; defaultBranch: string }>;
  /** Resolved credentials — dashboard-managed (DB) value, or env fallback. */
  credentials: {
    clickupToken?: string;
    githubToken?: string;
    gmailClientId?: string;
    gmailClientSecret?: string;
    gmailRefreshToken?: string;
    gmailSender?: string;
  };
  /** "dashboard" | "cron" | "clickup" — where the run was triggered. */
  source: string;
}

/**
 * A tool is defined ONCE here and adapted to whichever provider runs it:
 *  - API provider     → wrapped as a betaZodTool for the Messages API tool runner
 *  - Subscription     → exposed as an in-process MCP tool for the Claude Agent SDK
 */
export interface ToolSpec<S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<string>;
}

/** Helper so each tool file gets full input typing without restating generics. */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(spec: ToolSpec<S>): ToolSpec {
  return spec as unknown as ToolSpec;
}
