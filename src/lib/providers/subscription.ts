import type { LLMProvider, RunInput, RunResult } from "./types";

/**
 * Provider B — Claude subscription via the Claude Agent SDK (Claude Code).
 *
 * ⚠️ LOCAL / SELF-HOSTED ONLY. This drives Claude Code, which authenticates with
 * your Claude Max plan through CLAUDE_CODE_OAUTH_TOKEN (generate with
 * `claude setup-token`). It CANNOT run on Vercel serverless (no headless OAuth),
 * and consumer plans are intended for your own interactive/dev use — not for
 * powering a client-facing commercial service. The selector (./index.ts)
 * disables this provider in serverless environments.
 *
 * Our shared tools are exposed to Claude Code as an in-process MCP server, so the
 * exact same tool implementations run under either provider.
 *
 * NOTE: symbol/option names below (`query`, `createSdkMcpServer`, `tool`,
 * `permissionMode`, `systemPrompt`) match the published Agent SDK at time of
 * writing — verify against the installed version after `npm install`; the
 * compiler will flag any drift and these are the only lines that would change.
 */
export class SubscriptionProvider implements LLMProvider {
  readonly id = "subscription" as const;

  constructor(private oauthToken?: string) {}

  private model(tier: RunInput["tier"]): string {
    // Claude Code uses model aliases: opus | sonnet | haiku | fable
    if (tier === "cheap") return "haiku";
    return process.env.LLM_SUBSCRIPTION_MODEL ?? "opus";
  }

  async run({ system, history, prompt, tools, ctx, tier }: RunInput): Promise<RunResult> {
    // Claude Code's query() is single-shot, so fold recent conversation into the
    // prompt to give the agent memory of this thread.
    const transcript = (history ?? [])
      .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`)
      .join("\n\n");
    const fullPrompt = transcript
      ? `# Conversation so far (for context)\n${transcript}\n\n# The user's new message\n${prompt}`
      : prompt;
    const token = this.oauthToken ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!token) {
      throw new Error(
        "SubscriptionProvider: no Claude Code token. Run `claude setup-token` and add it in the dashboard (Keys).",
      );
    }
    // Per-call env (no global mutation): the SDK reads the token from here, and we
    // drop ANTHROPIC_API_KEY for this call only — an API key would otherwise take
    // precedence over the subscription token.
    const env: Record<string, string | undefined> = { ...process.env };
    // Strip any stray whitespace (copy/paste line-wraps) — an invalid bearer otherwise.
    env.CLAUDE_CODE_OAUTH_TOKEN = token.replace(/\s+/g, "");
    delete env.ANTHROPIC_API_KEY;
    // Dynamic import keeps this heavy, Node-only dependency out of any path that
    // doesn't actually use the subscription provider.
    const { query, createSdkMcpServer, tool } = await import(
      "@anthropic-ai/claude-agent-sdk"
    );

    const mcpServer = createSdkMcpServer({
      name: "croncore",
      version: "1.0.0",
      tools: tools.map((t) =>
        tool(t.name, t.description, t.schema.shape, async (args: unknown) => ({
          content: [
            { type: "text", text: await t.run(args as never, ctx) },
          ],
        })),
      ),
    });

    let text = "";
    const usage: RunResult["usage"] = {};
    let stderrBuf = "";

    try {
      for await (const message of query({
        prompt: fullPrompt,
        options: {
          model: this.model(tier),
          systemPrompt: system,
          maxTurns: 12,
          // Skip interactive permission prompts — required for unattended runs.
          permissionMode: "bypassPermissions",
          mcpServers: { croncore: mcpServer },
          allowedTools: tools.map((t) => `mcp__croncore__${t.name}`),
          env,
          // Capture the Claude Code subprocess stderr for real error messages.
          stderr: (data: string) => {
            stderrBuf += data;
          },
        },
      })) {
        if (message.type === "result" && message.subtype === "success") {
          text = (message.result ?? "").trim();
          usage.inputTokens = message.usage.input_tokens;
          usage.outputTokens = message.usage.output_tokens;
        }
      }
    } catch (err) {
      const detail = stderrBuf.trim();
      throw new Error(
        `Claude Code (subscription) failed: ${String(err)}${detail ? `\n\n${detail.slice(-1500)}` : ""}`,
      );
    }

    return { text, provider: this.id, usage };
  }
}
