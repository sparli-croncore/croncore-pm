"use client";

import { useState } from "react";
import Markdown from "@/app/markdown";

const ACTIONS: Array<{ key: string; label: string; prompt: string; note: string }> = [
  {
    key: "standup",
    label: "Run standup",
    note: "Saved to Reports.",
    prompt:
      "Produce today's standup / status report. Review ClickUp tasks (clickup_list_tasks) and open PRs (github_list_open_prs). Summarize progress, blockers, stale/large/unreviewed PRs, and what each developer should focus on today. Save it with save_report (kind=daily). Then reply with the report.",
  },
  {
    key: "tasks",
    label: "Draft today's tasks",
    note: "Drafts queued in Console → approvals.",
    prompt:
      "Based on the project goals, the current ClickUp tasks, and open PRs, decide what each developer should work on today. Draft the tasks/assignments and check-in comments using the ClickUp draft tools (they queue for my approval — do NOT post directly). Then summarize what you queued.",
  },
  {
    key: "prs",
    label: "Summarize PRs",
    note: "Read-only.",
    prompt:
      "List and triage every open pull request across the project's repos (github_list_open_prs). Flag stale (>3 days), large (>500 lines), or unreviewed PRs and say who needs to act on each. Do not change anything.",
  },
  {
    key: "client",
    label: "Draft client update",
    note: "Creates a Gmail draft (not sent).",
    prompt:
      "Draft a concise, professional client status update email based on recent progress: what shipped, what's in progress, any blockers, and next steps. Use gmail_create_draft to the primary client (do NOT send). If you don't know the client's email, say so instead.",
  },
];

export default function QuickActions({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ label: string; text: string } | null>(null);

  async function run(a: (typeof ACTIONS)[number]) {
    setBusy(a.key);
    setResult(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, prompt: a.prompt, tier: "smart" }),
      });
      const data = await res.json();
      setResult({ label: a.label, text: res.ok ? data.text : `Error: ${data.error}` });
    } catch (err) {
      setResult({ label: a.label, text: `Error: ${String(err)}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2>Quick actions</h2>
      <p className="muted" style={{ marginTop: 2 }}>
        One click for the everyday PM jobs. Drafts always wait for your approval.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {ACTIONS.map((a) => (
          <button key={a.key} className="secondary" onClick={() => run(a)} disabled={busy !== null}>
            {busy === a.key ? "Working…" : a.label}
          </button>
        ))}
      </div>
      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ marginBottom: 6 }}>{result.label}</div>
          <div
            style={{
              padding: "14px 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <Markdown>{result.text}</Markdown>
          </div>
        </div>
      )}
    </section>
  );
}
