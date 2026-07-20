import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1200, height: 1000 } }).then((c) => c.newPage());

// find a project
const res = await page.request.get(`${BASE}/api/projects`);
const pid = (await res.json()).projects?.[0]?.id;
console.log("project:", pid);

await page.goto(`${BASE}/projects/${pid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const prompt =
  "Reply in markdown only: a level-2 heading 'Progress Demo', a short intro sentence with one **bold** phrase, a 3-item bullet list, and a numbered list of 2 next steps. Keep it brief.";
await page.locator("textarea").first().fill(prompt);
await page.getByRole("button", { name: "Send" }).click();

// wait for the rendered markdown (.md) to appear
try {
  await page.waitForSelector(".md", { timeout: 90000 });
  await page.waitForTimeout(1500);
  console.log("response rendered");
} catch {
  console.log("no .md appeared in time");
}
await page.screenshot({ path: "/tmp/shots/md-console.png", fullPage: true });
await browser.close();
console.log("done");
