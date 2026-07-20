import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type DbMode = "external" | "embedded";

/** External Postgres when DATABASE_URL is set; otherwise a zero-config embedded DB. */
export function dbMode(): DbMode {
  return process.env.DATABASE_URL ? "external" : "embedded";
}

const EMBEDDED_DIR = path.join(process.cwd(), ".croncore", "pgdata");

/**
 * Cache the instance on globalThis so there is EXACTLY ONE per process — Next dev
 * hot-reloads and separate route/page bundles would otherwise each create their
 * own PGlite instance on the same data directory and corrupt it ("Aborted()").
 */
const globalStore = globalThis as unknown as {
  __croncoreDb?: {
    db: DB | null;
    pool: { end: () => Promise<void> } | null;
    ready: Promise<void> | null;
  };
};
const store = (globalStore.__croncoreDb ??= { db: null, pool: null, ready: null });

/**
 * PGlite runs single-threaded WASM and crashes on concurrent queries. The app
 * fires several DB requests in parallel (one page → many fetches), so we
 * serialize every query through a promise chain.
 */
function serializeQueries(client: { query: (...a: unknown[]) => Promise<unknown> }) {
  let tail: Promise<unknown> = Promise.resolve();
  const original = client.query.bind(client);
  client.query = ((...args: unknown[]) => {
    const result = tail.then(() => original(...args));
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }) as typeof client.query;
}

async function initDb(): Promise<void> {
  if (store.db) return;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /\bsslmode=require\b/.test(process.env.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : undefined,
    });
    store.pool = pool;
    store.db = drizzlePg(pool, { schema });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const client = await PGlite.create(EMBEDDED_DIR);
    serializeQueries(client as unknown as { query: (...a: unknown[]) => Promise<unknown> });
    store.db = drizzlePglite(client, { schema }) as unknown as DB;
  }
}

async function isMigrated(): Promise<boolean> {
  try {
    const res = await store.db!.execute(sql`select to_regclass('public.projects') as t`);
    const rows = (res as unknown as { rows?: Array<{ t: string | null }> }).rows ?? [];
    return Boolean(rows[0]?.t);
  } catch {
    return false;
  }
}

/**
 * Idempotent, once-per-process: connect the DB and ensure the schema + template
 * exist. Called by every entry point so the app self-initializes.
 */
export function ensureReady(): Promise<void> {
  if (!store.ready) {
    store.ready = (async () => {
      await initDb();
      const { applyMigrations, seedTemplate, applySchemaPatches } = await import("./migrate");
      if (!(await isMigrated())) {
        await applyMigrations();
        await seedTemplate(process.env.OWNER_EMAIL ?? "croncore@gmail.com");
      }
      // Additive schema evolution — runs every boot, idempotent.
      await applySchemaPatches();
    })().catch((err) => {
      store.ready = null; // allow retry on next call
      throw err;
    });
  }
  return store.ready;
}

/** Reset cached client — call after DATABASE_URL changes (e.g. from setup). */
export async function resetDb(): Promise<void> {
  if (store.pool) await store.pool.end().catch(() => {});
  store.pool = null;
  store.db = null;
  store.ready = null;
}

export async function getDbHealth(): Promise<{
  mode: DbMode;
  configured: boolean;
  reachable: boolean;
  migrated: boolean;
  error?: string;
}> {
  const mode = dbMode();
  try {
    await ensureReady();
    return { mode, configured: true, reachable: true, migrated: true };
  } catch (err) {
    return { mode, configured: mode === "embedded", reachable: false, migrated: false, error: String(err) };
  }
}

/** Lazy proxy — existing `db.select()…` call sites work unchanged. Requires that
 *  ensureReady() has been awaited first (every entry point does). */
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    if (!store.db) {
      throw new Error("Database not initialized — await ensureReady() before using db.");
    }
    const real = store.db as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export { schema };
