import { eq, desc, or, isNull, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  projectIntegrations,
  repos as reposTable,
  developers,
  projectDevelopers,
  clients,
  projectClients,
  agentMemory,
  knowledgeSources,
  agentRules,
} from "@/lib/db/schema";
import type { ToolContext } from "@/lib/tools/types";
import { resolveProjectCredentials } from "@/lib/credentials";

export interface ProjectContext {
  ctx: ToolContext;
  system: string;
}

/**
 * Load everything the agent needs for ONE project and build its system prompt.
 * Context is intentionally project-scoped — the agent never sees other projects'
 * data, which keeps every run cheap and fast no matter how many projects exist.
 */
export async function buildProjectContext(
  projectId: string,
  source: string,
): Promise<ProjectContext> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found`);

  const [integ] = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.projectId, projectId));

  const repos = await db.select().from(reposTable).where(eq(reposTable.projectId, projectId));

  const devs = await db
    .select({
      name: developers.name,
      email: developers.email,
      clickupUserId: developers.clickupUserId,
      githubLogin: developers.githubLogin,
      role: projectDevelopers.role,
    })
    .from(projectDevelopers)
    .innerJoin(developers, eq(projectDevelopers.developerId, developers.id))
    .where(eq(projectDevelopers.projectId, projectId));

  const projClients = await db
    .select({
      name: clients.name,
      email: clients.email,
      company: clients.company,
      isPrimary: projectClients.isPrimary,
    })
    .from(projectClients)
    .innerJoin(clients, eq(projectClients.clientId, clients.id))
    .where(eq(projectClients.projectId, projectId));

  const memory = await db
    .select()
    .from(agentMemory)
    .where(eq(agentMemory.projectId, projectId))
    .orderBy(desc(agentMemory.createdAt))
    .limit(30);

  const knowledge = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.projectId, projectId))
    .orderBy(desc(knowledgeSources.updatedAt));

  const rules = await db
    .select()
    .from(agentRules)
    .where(
      and(
        eq(agentRules.enabled, true),
        or(isNull(agentRules.scopeProjectId), eq(agentRules.scopeProjectId, projectId)),
      ),
    );

  // Dashboard-managed credentials (DB, decrypted) with env fallback.
  const creds = await resolveProjectCredentials(projectId);

  const ctx: ToolContext = {
    db,
    projectId,
    projectName: project.name,
    integrations: {
      clickupListId: integ?.clickupListId,
      clickupSpaceId: integ?.clickupSpaceId,
    },
    repos: repos.map((r) => ({
      owner: r.owner,
      name: r.name,
      defaultBranch: r.defaultBranch,
    })),
    credentials: {
      clickupToken: creds.clickupToken,
      githubToken: creds.githubToken,
      gmailClientId: creds.gmailClientId,
      gmailClientSecret: creds.gmailClientSecret,
      gmailRefreshToken: creds.gmailRefreshToken,
      gmailSender: creds.gmailSender,
    },
    source,
  };

  const system = [
    "You are CroncorePM, the AI project manager for Croncore (an AI agency, croncore.com).",
    "You manage software projects: assign and track developer tasks, triage pull requests, write status reports, and draft client communication.",
    "",
    `# Current project: ${project.name} (status: ${project.status})`,
    project.brief ? `\n## Brief\n${project.brief}` : "",
    devs.length
      ? `\n## Developers\n${devs
          .map(
            (d) =>
              `- ${d.name}${d.role ? ` (${d.role})` : ""} — ClickUp id: ${
                d.clickupUserId ?? "n/a"
              }, GitHub: ${d.githubLogin ?? "n/a"}`,
          )
          .join("\n")}`
      : "\n## Developers\n(none assigned yet)",
    projClients.length
      ? `\n## Clients\n${projClients
          .map((c) => `- ${c.name} <${c.email}>${c.company ? ` (${c.company})` : ""}${c.isPrimary ? " [primary]" : ""}`)
          .join("\n")}`
      : "",
    ctx.repos.length
      ? `\n## Repos\n${ctx.repos.map((r) => `- ${r.owner}/${r.name}`).join("\n")}`
      : "",
    knowledge.length
      ? `\n## Knowledge base\n${knowledge
          .map((k) => `### ${k.title} (${k.kind})\n${k.content}`)
          .join("\n\n")}`
      : "",
    rules.length
      ? `\n## Project rules (follow these)\n${rules
          .map((r) => `- [${r.category}] ${r.content}`)
          .join("\n")}`
      : "",
    memory.length
      ? `\n## What you remember about this project\n${memory.map((m) => `- (${m.type}) ${m.content}`).join("\n")}`
      : "",
    "",
    "# Operating rules",
    "- DRAFT-AND-APPROVE: never act directly on ClickUp or clients. Use the draft/queue tools; the user approves before anything is posted or sent.",
    "- Client emails: draft by default (gmail_create_draft). Only queue a send (gmail_send_email) when the user explicitly asks to send a specific email.",
    "- ClickUp comments and tasks post AS THE USER (their token) — be professional and concise.",
    "- PRs: lightweight tracking only for now — surface stale/large/unreviewed PRs; do not post code review.",
    "- Use `remember` to persist durable facts/decisions/preferences for this project.",
    "- Be concise and outcome-first. Lead with what happened or what you need.",
  ]
    .filter(Boolean)
    .join("\n");

  return { ctx, system };
}
