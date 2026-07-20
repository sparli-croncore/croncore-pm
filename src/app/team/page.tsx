"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default function TeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/team", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setRoles(data.roles);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    setEmail("");
    setName("");
    setRole("viewer");
    setBusy(false);
    await load();
  }

  async function remove(id: string) {
    await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <main>
      <h1>Team</h1>
      <p className="muted">
        Dashboard users and their access roles. Roles are stored now and enforced once login is
        added. (Developer roles per project — lead/backend/frontend — are managed inside each
        project.)
      </p>

      <section className="panel">
        <strong>Add a person</strong>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@croncore.com" />
        </div>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button onClick={add} disabled={busy || !email.trim()}>
          {busy ? "Adding…" : "Add person"}
        </button>
      </section>

      <section className="panel">
        <strong>Members</strong>
        {users.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No one yet.</p>}
        {users.map((u) => (
          <div className="row" key={u.id} style={{ marginTop: 10 }}>
            <span>
              {u.name ? `${u.name} · ` : ""}
              {u.email}
            </span>
            <span className="inline">
              <span className="badge">{u.role}</span>
              <button className="secondary" onClick={() => remove(u.id)}>
                Remove
              </button>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
