import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { defineTool, type ToolContext } from "./types";

function octokit(ctx: ToolContext): Octokit {
  const auth = ctx.credentials.githubToken;
  if (!auth) throw new Error("GitHub token not configured (GITHUB_TOKEN).");
  return new Octokit({ auth });
}

// Phase 1 = lightweight tracking: list/inspect/triage PRs. No deep code review yet.

const listOpenPrs = defineTool({
  name: "github_list_open_prs",
  description:
    "List open pull requests across all of this project's GitHub repos, with author, age in days, and size. Flag stale (>3 days) or large (>500 changed lines) PRs.",
  schema: z.object({}),
  run: async (_input, ctx) => {
    if (!ctx.repos.length) return "No GitHub repos are configured for this project.";
    const gh = octokit(ctx);
    const lines: string[] = [];
    for (const repo of ctx.repos) {
      const { data: prs } = await gh.pulls.list({
        owner: repo.owner,
        repo: repo.name,
        state: "open",
        per_page: 50,
      });
      if (!prs.length) {
        lines.push(`${repo.owner}/${repo.name}: no open PRs`);
        continue;
      }
      for (const pr of prs) {
        const ageDays = Math.floor(
          (Date.now() - new Date(pr.created_at).getTime()) / 86_400_000,
        );
        const flags = [ageDays > 3 ? "STALE" : "", pr.draft ? "draft" : ""].filter(Boolean);
        lines.push(
          `${repo.owner}/${repo.name}#${pr.number} "${pr.title}" by ${pr.user?.login} — ${ageDays}d old${
            flags.length ? ` [${flags.join(", ")}]` : ""
          }`,
        );
      }
    }
    return lines.join("\n");
  },
});

const getPr = defineTool({
  name: "github_get_pr",
  description:
    "Get one pull request's details: title, body, author, changed files count, additions/deletions, review state, mergeability.",
  schema: z.object({
    owner: z.string(),
    repo: z.string(),
    number: z.number(),
  }),
  run: async ({ owner, repo, number }, ctx) => {
    const gh = octokit(ctx);
    const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: number });
    return JSON.stringify(
      {
        title: pr.title,
        author: pr.user?.login,
        state: pr.state,
        draft: pr.draft,
        changed_files: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
        mergeable: pr.mergeable,
        body: pr.body?.slice(0, 1000),
      },
      null,
      2,
    );
  },
});

const readRepo = defineTool({
  name: "github_read_repo",
  description:
    "Read a repo to understand it: description, default branch, languages, branches, top contributors (who's working on it), README, and the top-level file tree. Use this when building or refreshing the project's knowledge base.",
  schema: z.object({
    owner: z.string(),
    repo: z.string(),
  }),
  run: async ({ owner, repo }, ctx) => {
    const gh = octokit(ctx);
    const [info, branches, contributors] = await Promise.all([
      gh.repos.get({ owner, repo }),
      gh.repos.listBranches({ owner, repo, per_page: 30 }),
      gh.repos.listContributors({ owner, repo, per_page: 20 }).catch(() => ({ data: [] })),
    ]);

    let readme = "(no README)";
    try {
      const r = await gh.repos.getReadme({ owner, repo });
      readme = Buffer.from(r.data.content, "base64").toString("utf8").slice(0, 6000);
    } catch {
      /* no readme */
    }

    let tree = "";
    try {
      const root = await gh.repos.getContent({ owner, repo, path: "" });
      if (Array.isArray(root.data)) {
        tree = root.data.map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n");
      }
    } catch {
      /* ignore */
    }

    return [
      `# ${owner}/${repo}`,
      info.data.description ? `Description: ${info.data.description}` : "",
      `Default branch: ${info.data.default_branch}`,
      `Language: ${info.data.language ?? "?"}`,
      `\n## Branches\n${branches.data.map((b) => `- ${b.name}`).join("\n")}`,
      `\n## Contributors (by commits)\n${
        (contributors.data as Array<{ login?: string; contributions?: number }>)
          .map((c) => `- ${c.login} (${c.contributions})`)
          .join("\n") || "(none)"
      }`,
      `\n## Top-level structure\n${tree || "(empty)"}`,
      `\n## README (excerpt)\n${readme}`,
    ]
      .filter(Boolean)
      .join("\n");
  },
});

export const githubTools = [listOpenPrs, getPr, readRepo];
