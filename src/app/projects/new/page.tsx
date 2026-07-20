"use client";

import { useState } from "react";

type Step = "basics" | "ingesting" | "interview" | "done";

export default function NewProjectPage() {
  const [step, setStep] = useState<Step>("basics");
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [clickupListId, setClickupListId] = useState("");
  const [reposText, setReposText] = useState(""); // one "owner/name" per line
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState("");

  function addLog(line: string) {
    setLog((l) => [...l, line]);
  }

  const repos = reposText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [owner, name] = l.split("/");
      return { owner, name };
    })
    .filter((r) => r.owner && r.name);

  async function createAndIngest() {
    if (!name.trim()) return;
    setBusy(true);
    setStep("ingesting");
    setLog([]);
    try {
      addLog("Creating project…");
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brief, clickupListId, repos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      const id = data.project.id as string;
      setProjectId(id);
      addLog(`Project created.`);

      if (repos.length) {
        addLog(`Reading ${repos.length} repo(s) and building the knowledge base… (this can take a minute)`);
        const ing = await fetch(`/api/projects/${id}/ingest`, { method: "POST" });
        const ingData = await ing.json();
        addLog(ing.ok ? `Knowledge base built. ${ingData.text?.slice(0, 200) ?? ""}` : `Ingest issue: ${ingData.error}`);
      } else {
        addLog("No repos provided — skipping repo ingestion.");
      }

      // Ask the agent for clarifying questions.
      addLog("Asking the agent for clarifying questions…");
      const q = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          prompt:
            "You are onboarding this project. Based on the brief and the repo knowledge you just built, ask me 3–6 specific clarifying questions that will help you manage it well (deadlines, priorities, who owns what, how I want updates, dos/don'ts). Output ONLY a numbered list of questions.",
        }),
      });
      const qData = await q.json();
      if (q.ok) {
        setQuestions(qData.text);
        setStep("interview");
      } else {
        addLog(`Could not generate questions: ${qData.error}. You can still open the project.`);
        setStep("done");
      }
    } catch (err) {
      addLog(`Error: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswers() {
    if (!projectId) return;
    setBusy(true);
    try {
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt:
            "Here are my answers to your onboarding questions:\n\n" +
            answers +
            "\n\nSave the important, durable facts and preferences to the knowledge base using save_knowledge and remember so you recall them on every future run. Then confirm you're ready to manage this project.",
        }),
      });
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>New project</h1>
      <p className="muted">
        The agent will read the repo, build a knowledge base, and ask you a few questions before it
        starts managing the project.
      </p>

      {step === "basics" && (
        <section className="panel">
          <div className="field">
            <label>Project name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme App" />
          </div>
          <div className="field">
            <label>Brief (goals, deadline, scope)</label>
            <textarea
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Client portal rebuild. Deadline May 30. Two devs."
            />
          </div>
          <div className="field">
            <label>ClickUp list ID (optional)</label>
            <input value={clickupListId} onChange={(e) => setClickupListId(e.target.value)} placeholder="901234567" />
          </div>
          <div className="field">
            <label>GitHub repos (one per line, owner/name)</label>
            <textarea
              rows={3}
              value={reposText}
              onChange={(e) => setReposText(e.target.value)}
              placeholder={"croncore/acme-api\ncroncore/acme-web"}
            />
          </div>
          <button onClick={createAndIngest} disabled={busy || !name.trim()}>
            Create & build knowledge base
          </button>
        </section>
      )}

      {(step === "ingesting" || step === "interview" || step === "done") && (
        <section className="panel">
          <strong>Progress</strong>
          <pre style={{ marginTop: 10 }}>{log.join("\n")}</pre>
        </section>
      )}

      {step === "interview" && (
        <section className="panel">
          <strong>The agent asks</strong>
          <pre style={{ marginTop: 10 }}>{questions}</pre>
          <div className="field">
            <label>Your answers</label>
            <textarea
              rows={6}
              value={answers}
              onChange={(e) => setAnswers(e.target.value)}
              placeholder="Answer the questions above…"
            />
          </div>
          <button onClick={submitAnswers} disabled={busy || !answers.trim()}>
            {busy ? "Saving…" : "Save answers & finish"}
          </button>
        </section>
      )}

      {step === "done" && projectId && (
        <section className="panel">
          <p className="success">✓ Project is ready.</p>
          <a href={`/projects/${projectId}`}>
            <button>Open project →</button>
          </a>
        </section>
      )}
    </main>
  );
}
