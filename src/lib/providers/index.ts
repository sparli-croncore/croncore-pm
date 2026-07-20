import type { LLMProvider, ProviderId } from "./types";
import { ApiProvider } from "./api";
import { SubscriptionProvider } from "./subscription";
import { getCredential } from "@/lib/credentials";

export * from "./types";

/** True on Vercel / Lambda — where the subscription provider cannot run. */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export interface ProviderSecrets {
  anthropicApiKey?: string;
  claudeCodeOauthToken?: string;
}

/**
 * Dashboard-facing availability — resolves keys from the DB (or env) so the UI
 * reflects keys added through the Keys page, not just env vars.
 */
export async function providerAvailabilityAsync(): Promise<
  Array<{ id: ProviderId; label: string; available: boolean; reason?: string }>
> {
  const [apiKey, oauth] = await Promise.all([
    getCredential("anthropic_api_key"),
    getCredential("claude_code_oauth_token"),
  ]);
  return [
    {
      id: "api",
      label: "Anthropic API key",
      available: Boolean(apiKey),
      reason: apiKey ? undefined : "No Anthropic API key — add one in Keys",
    },
    {
      id: "subscription",
      label: "Claude subscription (Claude Code)",
      available: !isServerless() && Boolean(oauth),
      reason: isServerless()
        ? "Not available on serverless (Vercel) — run locally/self-hosted"
        : oauth
          ? undefined
          : "No Claude Code token — run `claude setup-token` and add it in Keys",
    },
  ];
}

/**
 * Pick the provider for this run. `preferred` comes from the dashboard toggle;
 * falls back to env `LLM_PROVIDER`, then "api". Secrets are passed in (resolved
 * from the DB/env by the caller). Falls back to api if subscription can't run.
 */
export function selectProvider(preferred?: ProviderId, secrets: ProviderSecrets = {}): LLMProvider {
  const apiKey = secrets.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  const token = secrets.claudeCodeOauthToken ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const subscriptionUsable = Boolean(token) && !isServerless();

  // What the caller asked for: explicit choice → env default → auto-pick.
  let wanted = preferred ?? (process.env.LLM_PROVIDER as ProviderId | undefined);
  if (!wanted) {
    // Nothing specified: use whatever is actually configured.
    wanted = apiKey ? "api" : subscriptionUsable ? "subscription" : "api";
  }

  if (wanted === "subscription") {
    if (subscriptionUsable) return new SubscriptionProvider(token);
    console.warn("[provider] subscription requested but not usable here — falling back to api.");
  }

  // API path requested but no key, while a subscription token IS available → use it
  // so the agent still runs instead of erroring.
  if (!apiKey && subscriptionUsable) return new SubscriptionProvider(token);

  return new ApiProvider(apiKey);
}
