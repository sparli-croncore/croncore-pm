import type { ToolSpec, ToolContext } from "@/lib/tools/types";

export type ModelTier = "smart" | "cheap";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RunInput {
  /** System prompt: who the agent is + the project brief/context. */
  system: string;
  /** Prior turns of THIS conversation (oldest → newest), so the agent has memory. */
  history?: ChatTurn[];
  /** The turn to act on (a user message, or a cron instruction like "produce today's report"). */
  prompt: string;
  tools: ToolSpec[];
  ctx: ToolContext;
  /** "smart" → Opus-tier reasoning; "cheap" → Haiku for routine work. */
  tier?: ModelTier;
}

export interface RunResult {
  text: string;
  provider: ProviderId;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type ProviderId = "api" | "subscription";

/**
 * The agent's "brain" behind one interface. Swap implementations without
 * touching agent logic, tools, or the schema.
 */
export interface LLMProvider {
  readonly id: ProviderId;
  run(input: RunInput): Promise<RunResult>;
}
