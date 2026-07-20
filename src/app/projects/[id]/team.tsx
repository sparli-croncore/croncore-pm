"use client";

import { useEffect, useState } from "react";

interface Dev {
  id: string;
  name: string;
  email: string | null;
  clickupUserId: string | null;
  githubLogin: string | null;
  role: string | null;
}
interface Client {
  id: string;
  name: string;
  email: string;
  company: string | null;
  isPrimary: boolean;
}

export default function ProjectTeam({ projectId }: { projectId: string }) {
  const [devs, setDevs] = useState<Dev[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [dName, setDName] = useState("");
  const [dRole, setDRole] = useState("");
  const [dClickup, setDClickup] = useState("");
  const [dGithub, setDGithub] = useState("");

  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cCompany, setCCompany] = useState("");

  async function load() {
    const res = await fetch(`/api/projects/${projectId}/team`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setDevs(data.developers);
      setClients(data.clients);
    }
  }
  useEffect(() => {
    load();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addDev() {
    if (!dName.trim()) return;
    await fetch(`/api/projects/${projectId}/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "developer",
        name: dName,
        role: dRole,
        clickupUserId: dClickup,
        githubLogin: dGithub,
      }),
    });
    setDName("");
    setDRole("");
    setDClickup("");
    setDGithub("");
    await load();
  }

  async function addClient() {
    if (!cName.trim() || !cEmail.trim()) return;
    await fetch(`/api/projects/${projectId}/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "client", name: cName, email: cEmail, company: cCompany }),
    });
    setCName("");
    setCEmail("");
    setCCompany("");
    await load();
  }

  async function remove(kind: "developer" | "client", memberId: string) {
    await fetch(`/api/projects/${projectId}/team`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, memberId }),
    });
    await load();
  }

  return (
    <>
      <section className="card">
        <h2>Developers</h2>
        <p className="muted">
          The agent assigns and tracks work for these people. ClickUp user ID lets it assign tasks;
          GitHub login links them to PRs.
        </p>
        {devs.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No developers yet.</p>}
        {devs.map((d) => (
          <div className="row" key={d.id} style={{ marginTop: 10 }}>
            <span>
              <strong>{d.name}</strong>
              {d.role && <span className="badge" style={{ marginLeft: 8 }}>{d.role}</span>}{" "}
              <span className="muted">
                {d.githubLogin ? `· gh:${d.githubLogin}` : ""} {d.clickupUserId ? `· cu:${d.clickupUserId}` : ""}
              </span>
            </span>
            <button className="secondary btn-sm" onClick={() => remove("developer", d.id)}>
              Remove
            </button>
          </div>
        ))}
        <div className="field" style={{ marginTop: 16 }}>
          <label>Add a developer</label>
          <div className="inline" style={{ flexWrap: "wrap" }}>
            <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Name" style={{ maxWidth: 180 }} />
            <input value={dRole} onChange={(e) => setDRole(e.target.value)} placeholder="Role (e.g. backend)" style={{ maxWidth: 160 }} />
            <input value={dGithub} onChange={(e) => setDGithub(e.target.value)} placeholder="GitHub login" style={{ maxWidth: 150 }} />
            <input value={dClickup} onChange={(e) => setDClickup(e.target.value)} placeholder="ClickUp user ID" style={{ maxWidth: 150 }} />
            <button onClick={addDev} disabled={!dName.trim()}>Add</button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Clients</h2>
        <p className="muted">Who the agent drafts status emails for.</p>
        {clients.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No clients yet.</p>}
        {clients.map((c) => (
          <div className="row" key={c.id} style={{ marginTop: 10 }}>
            <span>
              <strong>{c.name}</strong> <span className="muted">&lt;{c.email}&gt;</span>
              {c.company && <span className="muted"> · {c.company}</span>}
            </span>
            <button className="secondary btn-sm" onClick={() => remove("client", c.id)}>
              Remove
            </button>
          </div>
        ))}
        <div className="field" style={{ marginTop: 16 }}>
          <label>Add a client</label>
          <div className="inline" style={{ flexWrap: "wrap" }}>
            <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Name" style={{ maxWidth: 180 }} />
            <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="Email" style={{ maxWidth: 200 }} />
            <input value={cCompany} onChange={(e) => setCCompany(e.target.value)} placeholder="Company" style={{ maxWidth: 160 }} />
            <button onClick={addClient} disabled={!cName.trim() || !cEmail.trim()}>Add</button>
          </div>
        </div>
      </section>
    </>
  );
}
