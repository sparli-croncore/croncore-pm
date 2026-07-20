# CroncorePM

An AI **project-manager agent** for Croncore (an AI agency). It assigns and tracks
developer tasks, triages pull requests, writes status reports, and drafts client
email — across **many projects**, with a **draft-and-approve** safety gate so
nothing touches ClickUp or a client inbox without your OK.

Built to scale from **one project to many**: onboarding a project / developer /
client is a database row, not a code change.

---

## Architecture at a glance

```
Next.js app on Vercel
├─ Dashboard            chat with the agent, approve drafts, read reports
├─ /api/agent          run the agent for a project (interactive)
├─ /api/cron/daily-report   fans out: one agent run per active project
├─ /api/actions/approve     execute a queued ClickUp/email action
└─ /api/projects            onboard a project

Agent brain  ── pluggable provider ──┬─ API key  (Anthropic Messages API)  ← runs anywhere
                                     └─ Subscription (Claude Code)         ← local/self-hosted only

Tools (defined once, used by either provider)
  ClickUp · GitHub · Gmail · reporting/memory   — all project-scoped

Postgres (Neon): projects, developers, clients, repos, integrations,
                 agent_memory, pending_actions, reports, messages
```

### Two ways to power the agent (your choice, per the dashboard)

| Provider | Auth | Runs on Vercel? | Use it for |
|---|---|---|---|
| **API key** | `ANTHROPIC_API_KEY` (pay-as-you-go) | ✅ Yes | The deployed/cloud agent. The production path. |
| **Subscription** | `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`, needs Claude Pro/Max) | ❌ No | **Local / self-hosted only** dev & testing on your own machine. |

The provider is selectable in the dashboard and overridable per request. On
serverless (Vercel) the subscription option is auto-disabled and the app falls
back to the API provider. The subscription path drives **Claude Code** and is
intended for your own development use — for a client-facing deployed service, use
the API key (this is also what Anthropic's terms require).

> Both providers run the **same tools and the same agent logic** — only the
> "brain" swaps. Adding Bedrock/Vertex later is a third provider class, no agent
> changes.

---

## Setup — almost entirely from the dashboard

You set only **two** things by hand; everything else is operated in the UI.

### 1. Install & run — that's it

```bash
npm install
npm run dev          # http://localhost:3000
```

**Zero configuration.** On first load it auto-initializes a **built-in embedded
database** (PGlite — real Postgres, in-process, persisted to `.croncore/pgdata`)
and an encryption key (`.croncore/encryption.key`). No external database, no
connection string, no CLI. Open the dashboard and start using it.

### 2. (Optional) Connect an external Postgres for production

For a deployed instance (Vercel), the embedded DB won't persist across cold
starts — use a real Postgres. Open **Setup → Advanced**, paste a connection
string (a free [Neon](https://neon.tech) DB or any Postgres), and it persists
`DATABASE_URL`, creates all tables, and seeds the template. On Vercel, also set
`DATABASE_URL` and `ENCRYPTION_KEY` in project env. Those are the only two env
vars you'd ever set by hand.

### 3. Add keys (in the dashboard)

Open **Keys** and paste your Anthropic API key (and ClickUp / GitHub / Gmail as
needed). They're encrypted at rest (AES-256-GCM) and override any env values. For
the subscription provider, run `claude setup-token` and paste the token here too.

### 4. Add team & rules (optional)

- **Team** — add people and dashboard roles (owner/admin/manager/viewer).
- **Rules** — global rules the agent follows on every project (assignment rules,
  todos/not-todos, communication style). Per-project rules live inside a project.

### 5. Create a project (guided)

Click **New project**. Enter the name, brief, ClickUp list, and repos. The agent
reads each repo (structure, branches, contributors, README), builds the project's
knowledge base, then asks you a few clarifying questions and saves your answers.
Open the project to chat, approve drafts, view reports, and manage its knowledge
base and rules.

---

## How scaling works

- **Everything is scoped to `project_id`.** Each agent run loads only that
  project's tasks, devs, repos, and memory — so 20 projects cost 20 small runs,
  not one giant expensive one.
- **The daily cron fans out** over every `active` project. 1 → N projects = more
  rows; no redeploy.
- **Shared accounts, per-project config.** One ClickUp token / GitHub PAT / Gmail
  account; *which* list/repo/client is stored per project in the DB. (Per-project
  credential overrides are supported in the schema for a future "hybrid" mode.)
- **Memory is per project** — the agent's knowledge of Project A never leaks into
  Project B.

---

## Safety: draft-and-approve

The agent **cannot** post to ClickUp or send a client email directly. Write
actions create a row in `pending_actions`; you approve from the dashboard, and
only then does `/api/actions/approve` execute it against the external system.
Gmail defaults to creating a **draft** (nothing sent); sending is a separately
gated, approval-required action.

---

## Deploy (Vercel)

1. Push to a Git repo and import into Vercel.
2. Add all env vars from `.env.example` (set `LLM_PROVIDER=api` and
   `ANTHROPIC_API_KEY` — the subscription provider does not run on Vercel).
3. Set `CRON_SECRET`; the daily report cron is configured in `vercel.json`
   (`0 8 * * *`). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

---

## Status / roadmap

**Phase 1 (this scaffold):** multi-project core, provider abstraction (API +
subscription), ClickUp/GitHub/Gmail/reporting tools, draft-and-approve, daily
report cron, minimal dashboard, auth seam.

**Next:** richer onboarding UI (developers/clients/repos forms), ClickUp webhook
→ agent, real dashboard auth (the `getCurrentUser()` seam is already in place),
deeper PR technical review, weekly reports.

---

## Notes / things to verify on first install

- `src/lib/providers/subscription.ts` uses the Claude Agent SDK symbols
  (`query`, `createSdkMcpServer`, `tool`) and options (`systemPrompt`,
  `permissionMode`, `mcpServers`). These match the published SDK at time of
  writing; if the installed version differs, the TypeScript compiler will point
  at the exact line to adjust. The API provider has no such dependency.
- The subscription provider needs the `claude` CLI / Agent SDK available in the
  runtime and `CLAUDE_CODE_OAUTH_TOKEN` set — i.e. your machine or a server you
  control, not Vercel.
