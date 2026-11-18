// 构筑与成长 v1 总览截图：node docs/design/构筑与成长_v1/shoot.mjs → png/*.png（1440 宽，整页）
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(DIR, "png"), { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe });
const SHOTS = ["ov", "school-jian", "school-wux", "school-shen", "school-lei", "school-shou", "axes", "time", "q", "plan"];
for (const k of SHOTS) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", (e) => console.log("[err]", k, e.message));
  await p.goto(pathToFileURL(path.join(DIR, "index.html")).href + "#" + k);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  if (k === "q") await p.evaluate(() => document.querySelectorAll(".opt.rec")[0]?.click());
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.screenshot({ path: path.join(DIR, "png", `${k}.png`), fullPage: true });
  console.log("ok", k, "高", h);
  await p.close();
}
await b.close();
