import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LLMProvider, RunInput, RunResult } from "./types";

/**
 * Provider A — Anthropic Messages API with a pay-as-you-go API key.
 * Runs anywhere (Vercel, local). This is the production path.
 *
 * Uses the SDK tool runner: it drives the agent loop (call → execute tool →
 * feed result back → repeat) until the model stops calling tools.
 */
export class ApiProvider implements LLMProvider {
  readonly id = "api" as const;
  private client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      throw new Error(
        "ApiProvider: ANTHROPIC_API_KEY is not set. Create one at https://console.anthropic.com.",
      );
    }
    this.client = new Anthropic({ apiKey: apiKey.replace(/\s+/g, "") });
  }

  private model(tier: RunInput["tier"]): string {
    if (tier === "cheap") return process.env.LLM_MODEL_CHEAP ?? "claude-haiku-4-5";
    return process.env.LLM_MODEL_SMART ?? "claude-opus-4-8";
  }

  async run({ system, history, prompt, tools, ctx, tier }: RunInput): Promise<RunResult> {
    // Adapt our shared tools to the SDK's tool-runner format. The closure binds
    // each tool to this run's project-scoped context.
    const runnerTools = tools.map((t) =>
      betaZodTool({
        name: t.name,
        description: t.description,
        inputSchema: t.schema,
        run: async (input) => t.run(input, ctx),
      }),
    );

    const finalMessage = await this.client.beta.messages.toolRunner({
      model: this.model(tier),
      max_tokens: 8000,
      system,
      tools: runnerTools,
      messages: [
        ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt },
      ],
    });

    const text = finalMessage.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return {
      text,
      provider: this.id,
      usage: {
        inputTokens: finalMessage.usage?.input_tokens,
        outputTokens: finalMessage.usage?.output_tokens,
      },
    };
  }
}
