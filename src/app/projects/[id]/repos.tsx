"use client";

import { useEffect, useState } from "react";

interface Repo {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  lastIngestedAt: string | null;
}

export default function ProjectRepos({ projectId }: { projectId: string }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [busy, setBusy] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");

  async function load() {
    const res = await fetch(`/api/projects/${projectId}/repos`, { cache: "no-store" });
    if (res.ok) setRepos((await res.json()).repos);
  }
  useEffect(() => {
    load();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!owner.trim() || !name.trim()) return;
    setBusy(true);
    await fetch(`/api/projects/${projectId}/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: owner.trim(), name: name.trim(), defaultBranch: branch.trim() }),
    });
    setOwner("");
    setName("");
    setBranch("main");
    setBusy(false);
    await load();
  }

  async function remove(repoId: string) {
    await fetch(`/api/projects/${projectId}/repos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoId }),
    });
    await load();
  }

  async function ingest() {
    setIngesting(true);
    setIngestMsg("Reading repos and building the knowledge base… (up to a minute)");
    const res = await fetch(`/api/projects/${projectId}/ingest`, { method: "POST" });
    const data = await res.json();
    setIngestMsg(res.ok ? data.text || "Done — see the Knowledge tab." : `Error: ${data.error}`);
    setIngesting(false);
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Repositories</h2>
        {repos.length > 0 && (
          <button className="btn-sm" onClick={ingest} disabled={ingesting}>
            {ingesting ? "Ingesting…" : "Build knowledge from repos"}
          </button>
        )}
      </div>
      <p className="muted">
        Connect GitHub repos by owner/name. Auth uses the GitHub token from{" "}
        <a href="/keys">Keys</a> — no per-repo setup. &quot;Build knowledge&quot; reads each repo
        (branches, contributors, README, structure) into the knowledge base.
      </p>

      {repos.length === 0 && (
        <p className="muted" style={{ marginTop: 10 }}>No repos connected yet.</p>
      )}
      {repos.map((r) => (
        <div className="row" key={r.id} style={{ marginTop: 10 }}>
          <span>
            <strong>
              {r.owner}/{r.name}
            </strong>{" "}
            <span className="muted">· {r.defaultBranch}</span>
          </span>
          <button className="secondary btn-sm" onClick={() => remove(r.id)}>
            Remove
          </button>
        </div>
      ))}

      <div className="field" style={{ marginTop: 16 }}>
        <label>Add a repository</label>
        <div className="inline">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="owner (e.g. croncore)" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="repo name" />
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="branch" style={{ maxWidth: 120 }} />
          <button onClick={add} disabled={busy || !owner.trim() || !name.trim()}>
            Add
          </button>
        </div>
      </div>

      {ingestMsg && <pre style={{ marginTop: 12 }}>{ingestMsg}</pre>}
    </section>
  );
}
