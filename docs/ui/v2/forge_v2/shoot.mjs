// 炼器 v2 示意图截图：node docs/ui/v2/forge_v2/shoot.mjs [页面.html 输出.png [脚本]]
// 不带参数时：a / b / c 三个方向各截一张 1280×720 → docs/ui/v2/png/forge_v2_*.png
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(DIR, "..", "png");
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe });
const jobs = process.argv[2]
  ? [[process.argv[2], process.argv[3], process.argv[4]]]
  : [
      ["a_cepage.html", "forge_v2_a_cepage.png"],
      ["b_ding.html", "forge_v2_b_ding.png"],
      ["c_changjuan.html", "forge_v2_c_changjuan.png"],
    ];
for (const [page, out, hash] of jobs) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on("pageerror", (e) => console.log("[err]", page, e.message));
  p.on("console", (m) => m.type() === "error" && console.log("[console]", page, m.text()));
  await p.goto(pathToFileURL(path.resolve(DIR, page)).href + (hash ? "#" + hash : ""));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => console.log("no __ready", page));
  await p.waitForTimeout(900);
  const o = path.isAbsolute(out) ? out : path.join(PNG, out);
  await p.screenshot({ path: o });
  await p.close();
  console.log("ok", o);
}
await b.close();
