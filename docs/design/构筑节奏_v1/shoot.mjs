// 构筑节奏 v1 草图截图：node docs/design/构筑节奏_v1/shoot.mjs → png/*.png（1440 宽，整页）
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe });
for (const k of ["base", "a", "b", "c", "ov"]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", (e) => console.log("[err]", k, e.message));
  await p.goto(pathToFileURL(path.join(DIR, "index.html")).href + "#" + k);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  const o = path.join(DIR, "png", `${k}.png`);
  await p.screenshot({ path: o, fullPage: true });
  console.log("ok", k, "高", h);
  await p.close();
}
await b.close();
