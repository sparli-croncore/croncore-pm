"use client";

import { useEffect, useState } from "react";

interface Rule {
  id: string;
  category: string;
  content: string;
  enabled: boolean;
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("general");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/rules", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules);
      setCategories(data.categories);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!content.trim()) return;
    setBusy(true);
    await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, content }),
    });
    setContent("");
    setBusy(false);
    await load();
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch("/api/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch("/api/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <main>
      <h1>Rules</h1>
      <p className="muted">
        Global rules the agent follows on every project — how to assign tasks, what counts as a
        todo, communication style, dos and don&apos;ts. (Per-project rules live inside each project.)
      </p>

      <section className="panel">
        <strong>Add a rule</strong>
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Rule</label>
          <textarea
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="e.g. Never assign more than 3 open tasks to one developer at a time."
          />
        </div>
        <button onClick={add} disabled={busy || !content.trim()}>
          {busy ? "Adding…" : "Add rule"}
        </button>
      </section>

      <section className="panel">
        <strong>Active rules</strong>
        {rules.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No rules yet.</p>}
        {rules.map((r) => (
          <div className="row" key={r.id} style={{ marginTop: 12 }}>
            <span style={{ opacity: r.enabled ? 1 : 0.5 }}>
              <span className="badge">{r.category}</span> {r.content}
            </span>
            <span className="inline">
              <button className="secondary" onClick={() => toggle(r.id, !r.enabled)}>
                {r.enabled ? "Disable" : "Enable"}
              </button>
              <button className="secondary" onClick={() => remove(r.id)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
