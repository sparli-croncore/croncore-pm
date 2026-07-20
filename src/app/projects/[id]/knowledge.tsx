"use client";

import { useEffect, useState } from "react";
import Markdown from "@/app/markdown";

interface KItem {
  id: string;
  kind: string;
  title: string;
  content: string;
  sourceRef: string | null;
}
interface RItem {
  id: string;
  category: string;
  content: string;
  enabled: boolean;
}

export default function ProjectKnowledge({ projectId }: { projectId: string }) {
  const [knowledge, setKnowledge] = useState<KItem[]>([]);
  const [rules, setRules] = useState<RItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // manual knowledge
  const [kTitle, setKTitle] = useState("");
  const [kContent, setKContent] = useState("");
  // rule
  const [rCategory, setRCategory] = useState("general");
  const [rContent, setRContent] = useState("");

  async function load() {
    const [k, r] = await Promise.all([
      fetch(`/api/knowledge?projectId=${projectId}`, { cache: "no-store" }),
      fetch(`/api/rules?projectId=${projectId}`, { cache: "no-store" }),
    ]);
    if (k.ok) setKnowledge((await k.json()).knowledge);
    if (r.ok) {
      const data = await r.json();
      setRules(data.rules);
      setCategories(data.categories);
    }
  }
  useEffect(() => {
    load();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addKnowledge() {
    if (!kTitle.trim() || !kContent.trim()) return;
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, kind: "text", title: kTitle, content: kContent }),
    });
    setKTitle("");
    setKContent("");
    await load();
  }

  async function delKnowledge(id: string) {
    await fetch("/api/knowledge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function addRule() {
    if (!rContent.trim()) return;
    await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeProjectId: projectId, category: rCategory, content: rContent }),
    });
    setRContent("");
    await load();
  }

  async function delRule(id: string) {
    await fetch("/api/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <>
      <section className="card">
        <h2>Knowledge base</h2>
        <p className="muted">
          What the agent knows about this project. Build it from repos in the <b>Repos</b> tab, or
          add your own notes / markdown below.
        </p>
        {knowledge.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            No knowledge yet. Use <b>Repos → Build knowledge</b>, or paste your own below.
          </p>
        )}
        {knowledge.map((k) => (
          <details key={k.id} style={{ marginTop: 10 }}>
            <summary>
              <span className="badge">{k.kind}</span> {k.title}{" "}
              {k.sourceRef && <span className="muted">— {k.sourceRef}</span>}
            </summary>
            <div style={{ marginTop: 8 }}>
              <Markdown>{k.content}</Markdown>
            </div>
            <button className="secondary" onClick={() => delKnowledge(k.id)}>
              Delete
            </button>
          </details>
        ))}

        <div className="field" style={{ marginTop: 16 }}>
          <label>Add knowledge (paste text / notes / md)</label>
          <input value={kTitle} onChange={(e) => setKTitle(e.target.value)} placeholder="Title" />
          <textarea
            rows={3}
            style={{ marginTop: 8 }}
            value={kContent}
            onChange={(e) => setKContent(e.target.value)}
            placeholder="Paste anything the agent should know…"
          />
          <div style={{ marginTop: 8 }}>
            <button onClick={addKnowledge} disabled={!kTitle.trim() || !kContent.trim()}>
              Add to knowledge base
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <strong>Project rules</strong>
        <p className="muted" style={{ marginTop: 4 }}>
          Apply only to this project (in addition to global rules).
        </p>
        {rules.map((r) => (
          <div className="row" key={r.id} style={{ marginTop: 10 }}>
            <span>
              <span className="badge">{r.category}</span> {r.content}
            </span>
            <button className="secondary" onClick={() => delRule(r.id)}>
              Delete
            </button>
          </div>
        ))}
        <div className="field" style={{ marginTop: 12 }}>
          <label>Add a project rule</label>
          <div className="inline">
            <select value={rCategory} onChange={(e) => setRCategory(e.target.value)} style={{ width: "auto" }}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input value={rContent} onChange={(e) => setRContent(e.target.value)} placeholder="e.g. Deploy only on Tuesdays" />
            <button onClick={addRule} disabled={!rContent.trim()}>
              Add
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
