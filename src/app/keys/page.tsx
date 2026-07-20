"use client";

import { useEffect, useState } from "react";

interface KeyItem {
  name: string;
  label: string;
  group: string;
  hint: string;
  set: boolean;
  source: "db" | "env" | null;
  masked: string | null;
}

export default function KeysPage() {
  const [items, setItems] = useState<KeyItem[]>([]);
  const [encOk, setEncOk] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/keys", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setEncOk(data.encryptionConfigured);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(name: string) {
    const value = drafts[name];
    if (!value) return;
    setSavingName(name);
    await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, value }),
    });
    setDrafts((d) => ({ ...d, [name]: "" }));
    setSavingName(null);
    await load();
  }

  async function remove(name: string) {
    await fetch("/api/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await load();
  }

  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <main>
      <h1>Keys</h1>
      <p className="muted">
        Stored encrypted in your database (AES-256-GCM). Values are never shown again — only a
        masked preview. A key set here overrides the matching environment variable.
      </p>
      {!encOk && (
        <p className="error-text">ENCRYPTION_KEY not set — run setup first so keys can be encrypted.</p>
      )}

      {groups.map((g) => (
        <section className="panel" key={g}>
          <strong>{g}</strong>
          {items
            .filter((i) => i.group === g)
            .map((i) => (
              <div className="field" key={i.name}>
                <label>
                  {i.label}{" "}
                  {i.set ? (
                    <span className={`badge ${i.source === "db" ? "good" : "warn"}`}>
                      {i.source === "db" ? `saved ${i.masked}` : `from env ${i.masked}`}
                    </span>
                  ) : (
                    <span className="badge bad">not set</span>
                  )}
                </label>
                <div className="hint">{i.hint}</div>
                <div className="inline">
                  <input
                    type="password"
                    placeholder={i.set ? "Enter new value to replace" : "Paste value"}
                    value={drafts[i.name] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [i.name]: e.target.value }))}
                  />
                  <button onClick={() => save(i.name)} disabled={!drafts[i.name] || savingName === i.name}>
                    {savingName === i.name ? "Saving…" : "Save"}
                  </button>
                  {i.source === "db" && (
                    <button className="secondary" onClick={() => remove(i.name)}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ))}
        </section>
      ))}
    </main>
  );
}
