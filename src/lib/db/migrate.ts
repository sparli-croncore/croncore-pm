import { promises as fs } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgs, users } from "@/lib/db/schema";

/**
 * Apply the generated Drizzle SQL migrations (drizzle/*.sql) against the current
 * database. Idempotent-ish: statements use IF NOT EXISTS where Drizzle emits it;
 * we also tolerate "already exists" so re-running setup is safe.
 */
export async function applyMigrations(): Promise<{ applied: number }> {
  const dir = path.join(process.cwd(), "drizzle");
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let applied = 0;
  for (const file of files) {
    const content = await fs.readFile(path.join(dir, file), "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        await db.execute(sql.raw(stmt));
        applied++;
      } catch (err) {
        const msg = String(err);
        // Re-running setup: ignore "already exists" so it's safe to repeat.
        if (/already exists/i.test(msg)) continue;
        throw new Error(`Migration failed in ${file}: ${msg}\n--\n${stmt.slice(0, 200)}`);
      }
    }
  }
  return { applied };
}

/**
 * Idempotent schema patches applied on EVERY boot (the base migration only runs
 * on first init). Lets us evolve the schema on already-migrated databases:
 * additive columns/tables/enum-values that use IF NOT EXISTS.
 */
export async function applySchemaPatches(): Promise<void> {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS "conversations" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "project_id" uuid NOT NULL,
       "title" text DEFAULT 'New chat' NOT NULL,
       "created_at" timestamptz DEFAULT now() NOT NULL,
       "updated_at" timestamptz DEFAULT now() NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS "conversations_project_idx" ON "conversations" ("project_id")`,
    `ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "conversation_id" uuid`,
    `CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" ("conversation_id")`,
    `ALTER TYPE "action_type" ADD VALUE IF NOT EXISTS 'clickup_dm'`,
    `ALTER TYPE "action_type" ADD VALUE IF NOT EXISTS 'clickup_update_task'`,
    `ALTER TYPE "action_type" ADD VALUE IF NOT EXISTS 'clickup_create_subtask'`,
  ];
  for (const stmt of ddl) {
    try {
      await db.execute(sql.raw(stmt));
    } catch {
      /* already applied / not supported — safe to ignore */
    }
  }

  // Backfill: put any orphan (pre-conversations) messages into a per-project "Main" thread.
  try {
    const orphans = await db.execute(
      sql`select distinct project_id from messages where conversation_id is null`,
    );
    const rows = (orphans as unknown as { rows?: Array<{ project_id: string }> }).rows ?? [];
    for (const r of rows) {
      const conv = await db.execute(
        sql`insert into conversations (project_id, title) values (${r.project_id}, 'Main') returning id`,
      );
      const cid = (conv as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id;
      if (cid) {
        await db.execute(
          sql`update messages set conversation_id = ${cid} where project_id = ${r.project_id} and conversation_id is null`,
        );
      }
    }
  } catch {
    /* ignore */
  }
}

/** Seed the starter template: a default org and an owner user. */
export async function seedTemplate(ownerEmail: string): Promise<void> {
  const existingOrg = await db.select().from(orgs).limit(1);
  if (existingOrg.length === 0) {
    await db.insert(orgs).values({ name: "Croncore" });
  }
  const existingUser = await db.select().from(users).limit(1);
  if (existingUser.length === 0) {
    await db.insert(users).values({ email: ownerEmail, name: "Owner", role: "owner" });
  }
}
