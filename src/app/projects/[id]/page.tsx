"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ProjectConsole from "./console";
import ProjectKnowledge from "./knowledge";
import ProjectRepos from "./repos";
import ProjectTeam from "./team";
import QuickActions from "./quick-actions";
import ProjectSettings from "./settings";
import Markdown from "@/app/markdown";

interface Pending {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
}
interface Report {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}
interface Provider {
  id: "api" | "subscription";
  label: string;
  available: boolean;
}

const TABS = ["Console", "Repos", "Knowledge & Rules", "Team", "Reports", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [tab, setTab] = useState<Tab>("Console");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [notFound, setNotFound] = useState(false);

  async function loadProject() {
    const proj = await fetch(`/api/projects/${id}`, { cache: "no-store" }).then((r) => r.json());
    if (proj.error) {
      setNotFound(true);
      return;
    }
    setName(proj.project.name);
    setStatus(proj.project.status);
    setPending(proj.pending ?? []);
    setReports(proj.reports ?? []);
  }

  useEffect(() => {
    (async () => {
      await loadProject();
      const pr = await fetch("/api/providers", { cache: "no-store" }).then((r) => r.json());
      setProviders((pr.providers ?? []).map((p: Provider) => ({ id: p.id, label: p.label, available: p.available })));
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) {
    return (
      <main>
        <p className="muted"><Link href="/">← Projects</Link></p>
        <h1>Project not found</h1>
      </main>
    );
  }

  return (
    <main>
      <div className="page-head">
        <p className="muted"><Link href="/">← Projects</Link></p>
        <div className="row">
          <h1>{name || "Loading…"}</h1>
          <span className="inline">
            {status && <span className={`badge ${status === "active" ? "good" : ""}`}>{status}</span>}
            <button
              className="ghost btn-sm"
              onClick={async () => {
                if (!confirm(`Delete project "${name}"? This removes its repos, team, knowledge, and reports.`)) return;
                await fetch(`/api/projects/${id}`, { method: "DELETE" });
                router.push("/");
              }}
            >
              Delete
            </button>
          </span>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
            {t === "Console" && pending.length > 0 ? ` (${pending.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "Console" && (
        <>
          <QuickActions projectId={id} />
          <ProjectConsole projectId={id} providers={providers} pending={pending} />
        </>
      )}

      {tab === "Repos" && <ProjectRepos projectId={id} />}

      {tab === "Knowledge & Rules" && <ProjectKnowledge projectId={id} />}

      {tab === "Team" && <ProjectTeam projectId={id} />}

      {tab === "Settings" && <ProjectSettings projectId={id} />}

      {tab === "Reports" && (
        <section className="card">
          <h2>Reports</h2>
          {reports.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No reports yet. Run a standup from the Console tab.</p>}
          {reports.map((r) => (
            <details key={r.id} style={{ marginTop: 10 }}>
              <summary>
                {r.title} <span className="muted">— {new Date(r.createdAt).toLocaleString()}</span>
              </summary>
              <div style={{ marginTop: 8 }}>
                <Markdown>{r.body}</Markdown>
              </div>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
