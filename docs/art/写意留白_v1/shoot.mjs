// 写意留白 v1 截图：node docs/art/写意留白_v1/shoot.mjs [V1 V2 …] → png/<变体>_{bust,full,game}.png
//   打开 file:// 的 index.html，用 #t= 固定动作时间；一个浏览器实例，跑完即关。
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const want = process.argv.slice(2);
const VS = want.length ? want : ["V0", "V1", "V2", "V3", "V4"];
const SHOTS = [["bust", "idle", 0.6], ["full", "idle", 0.6], ["game", "idle", 0.6], ["full", "slash", 0.22]];
const b = await chromium.launch({ executablePath: exe, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 1800, height: 900 } });
p.on("pageerror", (e) => console.log("[err]", e.message));
p.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));
const url = pathToFileURL(path.join(DIR, "index.html")).href;
for (const v of VS) {
  for (const [view, anim, t] of SHOTS) {
    await p.goto(`${url}?r=${Date.now()}#v=${v}&view=${view}&anim=${anim}&post=ink&t=${t}`);
    await p.waitForFunction(() => window.__xy && window.__xy.ready, null, { timeout: 180000 });
    await p.waitForTimeout(500);
    const name = `${v}_${view}${anim === "slash" ? "_slash" : ""}.png`;
    await (await p.$("#stage")).screenshot({ path: path.join(DIR, "png", name) });
    console.log("ok", name);
  }
}
await b.close();
