"use client";

import { useEffect, useState } from "react";

export default function ProjectSettings({ projectId }: { projectId: string }) {
  const [brief, setBrief] = useState("");
  const [clickupListId, setClickupListId] = useState("");
  const [status, setStatus] = useState("active");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (res.ok) {
        const { project } = await res.json();
        setBrief(project.brief ?? "");
        setClickupListId(project.clickupListId ?? "");
        setStatus(project.status ?? "active");
      }
    })();
  }, [projectId]);

  async function save() {
    setBusy(true);
    setSaved(false);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, clickupListId, status }),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section className="card">
      <h2>Project settings</h2>

      <div className="field">
        <label>ClickUp List ID</label>
        <div className="hint">
          The list where the agent creates &amp; comments on tasks. In ClickUp, open the List →
          its URL contains <code>/li/&lt;LIST_ID&gt;</code> (a number) — copy that. Or right-click
          the list → <b>Copy link</b> and grab the id from the link. Required for creating/assigning
          tasks.
        </div>
        <input
          value={clickupListId}
          onChange={(e) => setClickupListId(e.target.value)}
          placeholder="e.g. 901234567"
        />
      </div>

      <div className="field">
        <label>Brief (goals, deadline, scope)</label>
        <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} />
      </div>

      <div className="field">
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="archived">archived</option>
        </select>
      </div>

      <div className="inline">
        <button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="success">Saved ✓</span>}
      </div>
    </section>
  );
}
