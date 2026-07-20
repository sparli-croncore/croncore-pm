import { desc, eq } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { messages, conversations } from "@/lib/db/schema";
import { allTools } from "@/lib/tools";
import { buildProjectContext } from "./context";
import { selectProvider, type ModelTier, type ProviderId } from "@/lib/providers";
import { resolveProjectCredentials } from "@/lib/credentials";

export interface RunAgentArgs {
  projectId: string;
  prompt: string;
  /** "dashboard" | "cron" | "clickup" */
  source?: string;
  tier?: ModelTier;
  /** Override the default provider for this run (from the dashboard toggle). */
  provider?: ProviderId;
  /**
   * The chat thread this turn belongs to. When set, the turn is logged to that
   * thread and the thread's prior messages become the agent's memory. When unset
   * (quick actions, cron), the turn is one-off and not logged to any thread.
   */
  conversationId?: string;
}

export interface RunAgentResult {
  text: string;
  provider: ProviderId;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Run the PM agent for ONE project, through the selected provider, with
 * project-scoped tools and context. All chat threads for a project share the
 * same knowledge base, rules, memory, repos and team — only message history is
 * per-thread.
 */
export async function runAgentForProject(args: RunAgentArgs): Promise<RunAgentResult> {
  const { projectId, prompt, source = "dashboard", tier = "smart", provider, conversationId } = args;

  await ensureReady();
  const { ctx, system } = await buildProjectContext(projectId, source);
  const creds = await resolveProjectCredentials(projectId);
  const llm = selectProvider(provider, {
    anthropicApiKey: creds.anthropicApiKey,
    claudeCodeOauthToken: creds.claudeCodeOauthToken,
  });

  // Memory = this thread's prior turns (loaded BEFORE logging the current one).
  const history = conversationId
    ? (
        await db
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(16)
      )
        .reverse()
        .map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: m.content.length > 2000 ? `${m.content.slice(0, 2000)}…[truncated]` : m.content,
        }))
    : [];

  if (conversationId) {
    await db
      .insert(messages)
      .values({ projectId, conversationId, role: "user", content: prompt, source });
  }

  const result = await llm.run({ system, history, prompt, tools: allTools, ctx, tier });

  if (conversationId) {
    await db
      .insert(messages)
      .values({ projectId, conversationId, role: "assistant", content: result.text, source });
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    // Auto-title a fresh thread from its first user message.
    const [conv] = await db
      .select({ title: conversations.title })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (conv && conv.title === "New chat" && history.length === 0) {
      const title = prompt.trim().replace(/\s+/g, " ").slice(0, 48);
      await db.update(conversations).set({ title }).where(eq(conversations.id, conversationId));
    }
  }

  return { text: result.text, provider: result.provider, usage: result.usage };
}
