"use client";

import { useEffect, useState } from "react";

interface Status {
  mode: "embedded" | "external";
  configured: boolean;
  reachable: boolean;
  migrated: boolean;
  encryptionConfigured: boolean;
  ready: boolean;
  error?: string;
}

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dbUrl, setDbUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/setup/status", { cache: "no-store" });
    setStatus(await res.json());
  }
  useEffect(() => {
    loadStatus();
  }, []);

  async function runSetup(body?: { databaseUrl: string }) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ kind: "ok", text: `Database ready (${data.mode}). You can add keys and create projects.` });
        await loadStatus();
      } else {
        setMsg({ kind: "err", text: data.error ?? "Setup failed" });
      }
    } catch (err) {
      setMsg({ kind: "err", text: String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Setup</h1>
      <p className="muted">
        CroncorePM ships with a built-in database, so it works with zero configuration. Connect an
        external Postgres only when you deploy.
      </p>

      <section className="panel">
        <strong>Status</strong>
        {!status && <p className="muted" style={{ marginTop: 10 }}>Checking…</p>}
        {status && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div className="row">
              <span>Database mode</span>
              <span className="badge">{status.mode === "embedded" ? "built-in (local)" : "external Postgres"}</span>
            </div>
            <Line label="Database reachable" ok={status.reachable} />
            <Line label="Tables created" ok={status.migrated} />
            <Line label="Encryption key ready" ok={status.encryptionConfigured} />
          </div>
        )}
      </section>

      {status?.ready ? (
        <section className="panel">
          <p className="success">✓ CroncorePM is set up and ready.</p>
          <p className="muted">
            Next: add API keys under <a href="/keys">Keys</a>, then create a project under{" "}
            <a href="/">Projects</a>.
          </p>
        </section>
      ) : (
        <section className="panel">
          <strong>Initialize</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            Use the built-in database — no connection string needed.
          </p>
          <button onClick={() => runSetup()} disabled={busy}>
            {busy ? "Initializing…" : "Initialize built-in database"}
          </button>
          {msg && (
            <p className={msg.kind === "ok" ? "success" : "error-text"} style={{ marginTop: 12 }}>
              {msg.text}
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <button className="secondary" onClick={() => setShowAdvanced((s) => !s)}>
          {showAdvanced ? "Hide" : "Advanced: connect external Postgres (for production)"}
        </button>
        {showAdvanced && (
          <>
            <p className="muted" style={{ marginTop: 10 }}>
              Paste a Postgres connection string (e.g. a free{" "}
              <a href="https://neon.tech" target="_blank" rel="noreferrer">
                Neon
              </a>{" "}
              DB). The wizard persists it, creates all tables, and seeds the template.
            </p>
            <div className="field">
              <label>DATABASE_URL</label>
              <input
                value={dbUrl}
                onChange={(e) => setDbUrl(e.target.value)}
                placeholder="postgresql://user:password@host/dbname?sslmode=require"
              />
            </div>
            <button onClick={() => runSetup({ databaseUrl: dbUrl.trim() })} disabled={busy || !dbUrl.trim()}>
              {busy ? "Connecting…" : "Connect & migrate"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function Line({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span className={`badge ${ok ? "good" : "bad"}`}>{ok ? "yes" : "no"}</span>
    </div>
  );
}
