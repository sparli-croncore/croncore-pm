"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/app/markdown";

interface PendingAction {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
}
interface ProviderOption {
  id: "api" | "subscription";
  label: string;
  available: boolean;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
}
interface Convo {
  id: string;
  title: string;
  updatedAt: string;
}

export default function ProjectConsole({
  projectId,
  pending,
  providers,
}: {
  projectId: string;
  pending: PendingAction[];
  providers: ProviderOption[];
}) {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<"api" | "subscription">(
    providers.find((p) => p.available)?.id ?? "api",
  );
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeCid, setActiveCid] = useState<string | null>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [actions, setActions] = useState(pending);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = providers.find((p) => p.id === provider);
    if (!current?.available) {
      const firstAvailable = providers.find((p) => p.available);
      if (firstAvailable) setProvider(firstAvailable.id);
    }
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadConvos(selectId?: string) {
    const res = await fetch(`/api/projects/${projectId}/conversations`, { cache: "no-store" });
    const list: Convo[] = res.ok ? (await res.json()).conversations : [];
    if (list.length === 0) {
      // No threads yet — create the first one.
      const created = await fetch(`/api/projects/${projectId}/conversations`, { method: "POST" });
      const c = (await created.json()).conversation as Convo;
      setConvos([c]);
      setActiveCid(c.id);
      setThread([]);
      return;
    }
    setConvos(list);
    const active = selectId && list.find((c) => c.id === selectId) ? selectId : list[0].id;
    setActiveCid(active);
    loadThread(active);
  }

  async function loadThread(cid: string) {
    const res = await fetch(`/api/projects/${projectId}/conversations/${cid}`, { cache: "no-store" });
    setThread(res.ok ? ((await res.json()).messages ?? []).map((m: Msg) => ({ role: m.role, content: m.content })) : []);
  }

  async function refreshPending() {
    const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (res.ok) setActions((await res.json()).pending ?? []);
  }

  useEffect(() => {
    loadConvos();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, busy]);

  async function switchTo(cid: string) {
    if (cid === activeCid) return;
    setActiveCid(cid);
    await loadThread(cid);
  }

  async function newChat() {
    const res = await fetch(`/api/projects/${projectId}/conversations`, { method: "POST" });
    const c = (await res.json()).conversation as Convo;
    setConvos((cs) => [c, ...cs]);
    setActiveCid(c.id);
    setThread([]);
    setPrompt("");
  }

  async function renameActive() {
    if (!activeCid) return;
    const cur = convos.find((c) => c.id === activeCid);
    const title = window.prompt("Rename chat", cur?.title ?? "");
    if (!title?.trim()) return;
    await fetch(`/api/projects/${projectId}/conversations/${activeCid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setConvos((cs) => cs.map((c) => (c.id === activeCid ? { ...c, title: title.trim() } : c)));
  }

  async function deleteActive() {
    if (!activeCid) return;
    if (!confirm("Delete this chat thread?")) return;
    await fetch(`/api/projects/${projectId}/conversations/${activeCid}`, { method: "DELETE" });
    const remaining = convos.filter((c) => c.id !== activeCid);
    setConvos(remaining);
    if (remaining.length) {
      setActiveCid(remaining[0].id);
      await loadThread(remaining[0].id);
    } else {
      await newChat();
    }
  }

  async function send() {
    const text = prompt.trim();
    if (!text || busy || !activeCid) return;
    setPrompt("");
    setThread((t) => [...t, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, prompt: text, provider, conversationId: activeCid }),
      });
      const data = await res.json();
      setThread((t) => [
        ...t,
        { role: "assistant", content: res.ok ? data.text : `⚠️ Error: ${data.error}` },
      ]);
      await Promise.all([refreshPending(), loadConvos(activeCid)]);
    } catch (err) {
      setThread((t) => [...t, { role: "assistant", content: `⚠️ Error: ${String(err)}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(actionId: string, decision: "approve" | "reject") {
    const res = await fetch("/api/actions/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, decision }),
    });
    if (res.ok) setActions((a) => a.filter((x) => x.id !== actionId));
    else {
      const data = await res.json();
      alert(`Failed: ${data.error ?? "unknown"}`);
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Chats</h2>
          <div className="inline">
            {activeCid && (
              <>
                <button className="ghost btn-sm" onClick={renameActive}>Rename</button>
                <button className="ghost btn-sm" onClick={deleteActive}>Delete</button>
              </>
            )}
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "api" | "subscription")}
              style={{ width: "auto" }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.label}
                  {p.available ? "" : " (unavailable)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="convo-tabs">
          <button className="convo-chip new" onClick={newChat}>+ New chat</button>
          {convos.map((c) => (
            <button
              key={c.id}
              className={`convo-chip ${c.id === activeCid ? "active" : ""}`}
              onClick={() => switchTo(c.id)}
              title={c.title}
            >
              {c.title}
            </button>
          ))}
        </div>

        {thread.length === 0 && !busy && (
          <p className="muted" style={{ marginTop: 10 }}>
            New thread — the agent remembers this chat, and shares the project&apos;s knowledge base,
            rules and memory with your other chats.
          </p>
        )}

        {(thread.length > 0 || busy) && (
          <div className="thread">
            {thread.map((m, i) =>
              m.role === "user" ? (
                <div className="msg user" key={i}>
                  <div className="bubble">{m.content}</div>
                </div>
              ) : (
                <div className="msg assistant" key={i}>
                  <Markdown>{m.content}</Markdown>
                </div>
              ),
            )}
            {busy && <div className="msg assistant muted">Working…</div>}
            <div ref={bottomRef} />
          </div>
        )}

        <textarea
          rows={3}
          value={prompt}
          placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          style={{ marginTop: 12 }}
        />
        <div style={{ marginTop: 10 }}>
          <button onClick={send} disabled={busy || !prompt.trim()}>
            {busy ? "Working…" : "Send"}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Pending approvals</h2>
          <span className="muted">{actions.length}</span>
        </div>
        {actions.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Nothing waiting.</p>}
        {actions.map((a) => (
          <div className="tile" key={a.id} style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 12 }}>{a.type}</div>
            <div style={{ margin: "6px 0 10px" }}>{a.summary}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-sm" onClick={() => decide(a.id, "approve")}>Approve</button>
              <button className="secondary btn-sm" onClick={() => decide(a.id, "reject")}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
