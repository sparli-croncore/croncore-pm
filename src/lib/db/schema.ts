/**
 * CroncorePM database schema — multi-tenant from day one.
 *
 * Everything is scoped to a `project`. Onboarding a new project/developer/client
 * is INSERTing rows, never a code change. One org (Croncore) today; the `orgs`
 * table is here so multi-org is a non-breaking addition later.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const projectStatus = pgEnum("project_status", [
  "active",
  "paused",
  "archived",
]);

export const actionType = pgEnum("action_type", [
  "clickup_comment",
  "clickup_create_task",
  "clickup_assign_task",
  "email_send",
  "clickup_dm",
  "clickup_update_task",
  "clickup_create_subtask",
]);

export const actionStatus = pgEnum("action_status", [
  "pending", // drafted by the agent, awaiting your approval
  "approved", // you approved; queued to execute
  "executed", // performed against the external system
  "rejected", // you declined
  "failed", // execution errored
]);

export const memoryType = pgEnum("memory_type", [
  "fact", // durable project context
  "decision", // a decision made
  "preference", // how you want things done on this project
]);

// Dashboard-access roles (enforced once login is wired to the getCurrentUser seam).
export const userRole = pgEnum("user_role", ["owner", "admin", "manager", "viewer"]);

// Knowledge base source kinds.
export const kbKind = pgEnum("kb_kind", ["repo", "file", "text", "markdown"]);

// Agent rule categories (how the agent should behave on this project).
export const ruleCategory = pgEnum("rule_category", [
  "assignment", // how to assign tasks / who does what
  "todo", // what counts as a todo / not-a-todo
  "communication", // tone, when to email/comment
  "general",
]);

// ── Organization (single row today: Croncore) ────────────────────────────────
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Dashboard users (for the future login; the getCurrentUser seam reads this) ──
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: userRole("role").default("viewer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Encrypted credentials (managed from the dashboard) ────────────────────────
// Values are AES-256-GCM encrypted at rest (see lib/crypto.ts). `scopeProjectId`
// null = a global/shared key; set = a per-project override. `name` is the logical
// key, e.g. "anthropic_api_key", "clickup_api_token", "github_token",
// "gmail_client_id", "gmail_client_secret", "gmail_refresh_token".
export const appCredentials = pgTable(
  "app_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeProjectId: uuid("scope_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("app_credentials_lookup_idx").on(t.name, t.scopeProjectId)],
);

// ── Projects (the tenant boundary) ────────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: projectStatus("status").default("active").notNull(),
    // Free-form brief the agent reads each run: goals, deadlines, scope notes.
    brief: text("brief"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

// ── Per-project integration config (shared accounts; config differs per project)
// Credentials themselves stay in env (shared). Here we store WHICH list/repo/etc.
export const projectIntegrations = pgTable("project_integrations", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  clickupListId: text("clickup_list_id"),
  clickupSpaceId: text("clickup_space_id"),
  // GitHub repos are in their own table (a project can have several).
  // Optional per-project credential overrides for the "hybrid" model later —
  // null means "use the shared env credential".
  clickupTokenOverride: text("clickup_token_override"),
  githubTokenOverride: text("github_token_override"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Developers (many-to-many with projects) ───────────────────────────────────
export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  clickupUserId: text("clickup_user_id"),
  githubLogin: text("github_login"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projectDevelopers = pgTable(
  "project_developers",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "cascade" }),
    role: text("role"), // e.g. "lead", "backend", "frontend"
  },
  (t) => [primaryKey({ columns: [t.projectId, t.developerId] })],
);

// ── Clients (many-to-many with projects) ──────────────────────────────────────
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projectClients = pgTable(
  "project_clients",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").default(false).notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.clientId] })],
);

// ── GitHub repos per project ──────────────────────────────────────────────────
export const repos = pgTable(
  "repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(), // e.g. "croncore"
    name: text("name").notNull(), // e.g. "acme-api"
    defaultBranch: text("default_branch").default("main").notNull(),
    lastIngestedAt: timestamp("last_ingested_at", { withTimezone: true }),
  },
  (t) => [index("repos_project_idx").on(t.projectId)],
);

// ── Knowledge base (per project) ──────────────────────────────────────────────
// Repo understanding (code/branches/contributors → summarized), plus manual
// sources: uploaded files, pasted text, markdown. The agent loads these as context.
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: kbKind("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(), // extracted/summarized knowledge, or pasted text
    sourceRef: text("source_ref"), // e.g. "owner/repo" or original filename
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("knowledge_sources_project_idx").on(t.projectId)],
);

// ── Agent rules (how the agent should operate; global or per-project) ──────────
export const agentRules = pgTable(
  "agent_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeProjectId: uuid("scope_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }), // null = applies to all projects
    category: ruleCategory("category").default("general").notNull(),
    content: text("content").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_rules_scope_idx").on(t.scopeProjectId)],
);

// ── Agent memory (scoped per project) ─────────────────────────────────────────
export const agentMemory = pgTable(
  "agent_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: memoryType("type").default("fact").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_memory_project_idx").on(t.projectId)],
);

// ── Pending actions (draft-and-approve) ───────────────────────────────────────
// The agent never touches ClickUp/clients directly. It writes a pending action;
// you approve from the dashboard; then it executes.
export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: actionType("type").notNull(),
    status: actionStatus("status").default("pending").notNull(),
    // Human-readable summary shown in the approval UI.
    summary: text("summary").notNull(),
    // Structured payload the executor needs (taskId, body, to/subject/body, etc.).
    payload: jsonb("payload").notNull(),
    result: jsonb("result"), // external system response or error
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("pending_actions_project_idx").on(t.projectId),
    index("pending_actions_status_idx").on(t.status),
  ],
);

// ── Reports (status summaries the agent produces) ─────────────────────────────
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").default("daily").notNull(), // daily | weekly | adhoc
    title: text("title").notNull(),
    body: text("body").notNull(), // markdown
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("reports_project_idx").on(t.projectId)],
);

// ── Conversations (multiple chat threads per project) ─────────────────────────
// Each thread has its own message history, but ALL threads share the project's
// knowledge base, rules, memory, repos and team — so they're "interconnected".
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").default("New chat").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("conversations_project_idx").on(t.projectId)],
);

// ── Conversation log (messages within a thread) ───────────────────────────────
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    source: text("source").default("dashboard").notNull(), // dashboard | clickup | cron
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("messages_project_idx").on(t.projectId),
    index("messages_conversation_idx").on(t.conversationId),
  ],
);
