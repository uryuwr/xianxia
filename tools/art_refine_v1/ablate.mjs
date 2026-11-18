// 分项消融：node tools/art_refine_v1/ablate.mjs [igpu]  —— B 模式、游戏镜头，逐项隐藏后测 GPU 基准，差值 = 该项成本
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(DIR, "../../docs/art/精细化小样_v1/index.html");
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const igpu = process.argv.includes("igpu");
const mode = process.argv.find((a) => /^[ABC]$/.test(a)) || "B";
const b = await chromium.launch({ executablePath: exe, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", ...(igpu ? ["--force_low_power_gpu"] : [])] });
const ctx = await b.newContext(igpu ? { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 } : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 });
const CASES = [["基线", null], ["−瓦（板瓦+筒瓦）", "^tiles-(pan|cover)$"], ["−瓦当滴水", "^tiles-(wadang|dishui)$"], ["−草", "^grass$"], ["−山石", "^rocks$"], ["−竹叶", "^bamboo-leaves$"], ["−地面", "^ground$"], ["−斗拱椽望", "^(brackets|rafters|roof-under|purlins)$"], ["−日光投影", "SHADOW"]];
const out = [];
for (const [name, re] of CASES) {
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(PAGE).href + `#ver=new&shade=${mode}&cam=game&size=full&pr=${igpu ? 1 : 1.5}`);
  await p.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(async (re) => {
    if (re === "SHADOW") window.__demo.shadows(false);
    else if (re) window.__demo.hide(re);
    await window.__demo.bench(10);
    const v = [];
    for (let k = 0; k < 3; k++) v.push(await window.__demo.bench(40));
    return Math.min(...v.filter((x) => x != null));
  }, re);
  out.push([name, r]);
  console.log(name.padEnd(14), r.toFixed(2), "ms", out.length > 1 ? `（省 ${(out[0][1] - r).toFixed(2)}）` : "");
  await p.close();
}
await b.close();
