import { and, eq, isNull } from "drizzle-orm";
import { db, ensureReady } from "@/lib/db";
import { appCredentials } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";

/** Logical credential names ↔ their env-var fallbacks. */
export const CREDENTIALS = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  claude_code_oauth_token: "CLAUDE_CODE_OAUTH_TOKEN",
  clickup_api_token: "CLICKUP_API_TOKEN",
  github_token: "GITHUB_TOKEN",
  gmail_client_id: "GMAIL_CLIENT_ID",
  gmail_client_secret: "GMAIL_CLIENT_SECRET",
  gmail_refresh_token: "GMAIL_REFRESH_TOKEN",
  gmail_sender: "GMAIL_SENDER",
} as const;

export type CredentialName = keyof typeof CREDENTIALS;

/** Display catalog for the Keys page, grouped by integration, with where-to-get hints. */
export const KEY_CATALOG: Array<{
  name: CredentialName;
  label: string;
  group: string;
  hint: string;
}> = [
  {
    name: "anthropic_api_key",
    label: "Anthropic API key",
    group: "LLM provider",
    hint: "console.anthropic.com → API keys. Starts with sk-ant-. Pay-as-you-go; powers the deployed agent.",
  },
  {
    name: "claude_code_oauth_token",
    label: "Claude Code token (subscription)",
    group: "LLM provider",
    hint: "Run `claude setup-token` in your terminal (needs Claude Pro/Max). Local/self-hosted only — not on Vercel.",
  },
  {
    name: "clickup_api_token",
    label: "ClickUp API token",
    group: "ClickUp",
    hint: "ClickUp → Settings → Apps → API Token. Starts with pk_. Comments/tasks post as you.",
  },
  {
    name: "github_token",
    label: "GitHub token",
    group: "GitHub",
    hint: "github.com → Settings → Developer settings → Fine-grained PAT. Needs Contents: Read and Pull requests: Read.",
  },
  { name: "gmail_client_id", label: "Gmail client ID", group: "Gmail (optional)", hint: "Google Cloud Console → APIs & Services → Credentials → OAuth client." },
  { name: "gmail_client_secret", label: "Gmail client secret", group: "Gmail (optional)", hint: "From the same OAuth client." },
  { name: "gmail_refresh_token", label: "Gmail refresh token", group: "Gmail (optional)", hint: "Obtained via the OAuth consent flow for the gmail.modify scope." },
  { name: "gmail_sender", label: "Gmail sender address", group: "Gmail (optional)", hint: "The from address, e.g. croncore@gmail.com." },
];

/**
 * Resolve a single credential: per-project override → global (DB, decrypted) →
 * env-var fallback. Safe before the DB exists (returns env only).
 */
export async function getCredential(
  name: CredentialName,
  projectId?: string,
): Promise<string | undefined> {
  {
    try {
      await ensureReady();
      if (projectId) {
        const [scoped] = await db
          .select()
          .from(appCredentials)
          .where(and(eq(appCredentials.name, name), eq(appCredentials.scopeProjectId, projectId)))
          .limit(1);
        if (scoped) return decryptSecret(scoped.encryptedValue);
      }
      const [global] = await db
        .select()
        .from(appCredentials)
        .where(and(eq(appCredentials.name, name), isNull(appCredentials.scopeProjectId)))
        .limit(1);
      if (global) return decryptSecret(global.encryptedValue);
    } catch {
      // Table may not exist yet (pre-migration) — fall through to env.
    }
  }
  return process.env[CREDENTIALS[name]];
}

export interface ResolvedCredentials {
  anthropicApiKey?: string;
  claudeCodeOauthToken?: string;
  clickupToken?: string;
  githubToken?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
  gmailSender?: string;
}

/** Resolve the full set the agent + tools need for a project. */
export async function resolveProjectCredentials(projectId?: string): Promise<ResolvedCredentials> {
  const [
    anthropicApiKey,
    claudeCodeOauthToken,
    clickupToken,
    githubToken,
    gmailClientId,
    gmailClientSecret,
    gmailRefreshToken,
    gmailSender,
  ] = await Promise.all([
    getCredential("anthropic_api_key", projectId),
    getCredential("claude_code_oauth_token", projectId),
    getCredential("clickup_api_token", projectId),
    getCredential("github_token", projectId),
    getCredential("gmail_client_id", projectId),
    getCredential("gmail_client_secret", projectId),
    getCredential("gmail_refresh_token", projectId),
    getCredential("gmail_sender", projectId),
  ]);
  return {
    anthropicApiKey,
    claudeCodeOauthToken,
    clickupToken,
    githubToken,
    gmailClientId,
    gmailClientSecret,
    gmailRefreshToken,
    gmailSender,
  };
}
