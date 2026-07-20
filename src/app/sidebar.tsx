"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type IconName = "projects" | "keys" | "team" | "rules" | "setup";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "ico",
  };
  switch (name) {
    case "projects":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "keys":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="4" />
          <path d="M10.8 10.8 21 21M16 16l2-2M19 19l2-2" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.2a3.2 3.2 0 0 1 0 6.1M18 20a5.5 5.5 0 0 0-3-5" />
        </svg>
      );
    case "rules":
      return (
        <svg {...common}>
          <path d="M9 11l2 2 4-4" />
          <rect x="4" y="3" width="16" height="18" rx="2" />
        </svg>
      );
    case "setup":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </svg>
      );
  }
}

const NAV: Array<{ section: string; items: Array<{ href: string; label: string; icon: IconName }> }> = [
  { section: "Workspace", items: [{ href: "/", label: "Projects", icon: "projects" }] },
  {
    section: "Settings",
    items: [
      { href: "/keys", label: "Keys", icon: "keys" },
      { href: "/team", label: "Team", icon: "team" },
      { href: "/rules", label: "Rules", icon: "rules" },
      { href: "/setup", label: "Setup", icon: "setup" },
    ],
  },
];

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const resolved =
    t === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : t;
  document.documentElement.dataset.theme = resolved;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme) || "light";
    setTheme(saved);
  }, []);
  function choose(t: Theme) {
    setTheme(t);
    localStorage.setItem("theme", t);
    applyTheme(t);
  }
  return (
    <div className="seg" role="group" aria-label="Theme">
      {(["light", "dark", "system"] as Theme[]).map((t) => (
        <button key={t} className={theme === t ? "on" : ""} onClick={() => choose(t)}>
          {t === "light" ? "Light" : t === "dark" ? "Dark" : "Auto"}
        </button>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/projects") : pathname.startsWith(href);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">C</span> Croncore PM
      </div>
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="nav-section">{group.section}</div>
          {group.items.map((n) => (
            <Link key={n.href} href={n.href} className={`navlink ${isActive(n.href) ? "active" : ""}`}>
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </div>
      ))}
      <div className="sidebar-foot">
        <ThemeToggle />
      </div>
    </aside>
  );
}
