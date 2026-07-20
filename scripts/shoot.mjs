import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

async function shot(name, url, { theme = "light", waitMs = 1200 } = {}) {
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await page.reload({ waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot", name);
}

// Find a project id (created earlier)
let pid = "";
try {
  const res = await page.request.get(`${BASE}/api/projects`);
  const data = await res.json();
  pid = data.projects?.[0]?.id ?? "";
} catch {}
console.log("project id:", pid);

await shot("01-home-light", "/");
await shot("02-home-dark", "/", { theme: "dark" });
await shot("03-keys", "/keys");
await shot("04-setup", "/setup");
await shot("05-team", "/team");
await shot("06-rules", "/rules");
await shot("07-new-project", "/projects/new");
if (pid) {
  await shot("08-project-console", `/projects/${pid}`);
  // click Repos tab
  await page.getByRole("button", { name: "Repos" }).click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/09-project-repos.png`, fullPage: true });
  await page.getByRole("button", { name: "Team" }).click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/10-project-team.png`, fullPage: true });
}

await browser.close();
console.log("done");
