"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  status: string;
}
interface Provider {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
}
interface Step {
  id: string;
  title: string;
  done: boolean;
  href: string;
}

export default function Home() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [onboardingComplete, setOnboardingComplete] = useState(true);

  useEffect(() => {
    (async () => {
      const status = await fetch("/api/setup/status", { cache: "no-store" }).then((r) => r.json());
      setReady(Boolean(status.ready));

      const ob = await fetch("/api/onboarding/status", { cache: "no-store" }).then((r) => r.json());
      setSteps(ob.steps ?? []);
      setOnboardingComplete(Boolean(ob.complete));

      if (status.ready) {
        const [p, pr] = await Promise.all([
          fetch("/api/projects", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/providers", { cache: "no-store" }).then((r) => r.json()),
        ]);
        setProjects(p.projects ?? []);
        setProviders(pr.providers ?? []);
      }
    })();
  }, []);

  if (ready === null) {
    return (
      <main>
        <div className="page-head">
          <h1>Croncore PM</h1>
        </div>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-head">
        <h1>Home</h1>
        <p className="muted">Your AI project manager — set up, then run your projects from here.</p>
      </div>

      {!onboardingComplete && (
        <section className="card">
          <div className="card-head">
            <h2>Get started</h2>
            <span className="muted">{steps.filter((s) => s.done).length}/{steps.length} done</span>
          </div>
          {steps.map((s) => (
            <Link key={s.id} href={s.href} style={{ color: "inherit" }}>
              <div className={`check ${s.done ? "done" : ""}`}>
                <span className="mark">{s.done ? "✓" : ""}</span>
                <div>
                  <div className="ctitle">{s.title}</div>
                  {!s.done && <div className="muted">Click to do this →</div>}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}

      {ready && (
        <section className="card">
          <h2>LLM provider</h2>
          <p className="muted" style={{ marginTop: 2 }}>
            Used to run the agent. Add keys under <Link href="/keys">Keys</Link>.
          </p>
          {providers.map((p) => (
            <div className="row" key={p.id} style={{ marginTop: 10 }}>
              <span>{p.label}</span>
              <span className={`badge ${p.available ? "good" : "bad"}`}>
                {p.available ? "available" : p.reason ?? "unavailable"}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Projects</h2>
          <Link href="/projects/new">
            <button className="btn-sm">+ New project</button>
          </Link>
        </div>
        {!ready && (
          <p className="muted" style={{ marginTop: 10 }}>
            Finish setup above to create projects.
          </p>
        )}
        {ready && projects.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            No projects yet. Create one — the agent reads the repo, builds a knowledge base, and asks
            you a few questions.
          </p>
        )}
        {ready && projects.length > 0 && (
          <div className="grid" style={{ marginTop: 12 }}>
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} style={{ color: "inherit" }}>
                <div className="tile">
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                  <span className={`badge ${p.status === "active" ? "good" : ""}`}>{p.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
