// 精细化小样 v1 截图：node docs/art/精细化小样_v1/shoot.mjs [名字…] → png/*.png
//   每张：打开 index.html#状态，等加载完、再跑 1.5 秒（动画 / 风动稳定），只截 1280×720 画布区域（stage）；
//   另截一张整页（page.png）看 UI。同时打印该状态下的实测（帧率受无头模式约束，看 GPU 毫秒与 draw call）。
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const SHOTS = {
  old_game: "ver=old&cam=game",
  A_game: "ver=new&shade=A&cam=game",
  B_game: "ver=new&shade=B&cam=game",
  C_game: "ver=new&shade=C&cam=game",
  old_close: "ver=old&cam=orbit",
  A_close: "ver=new&shade=A&cam=orbit",
  B_close: "ver=new&shade=B&cam=orbit",
  C_close: "ver=new&shade=C&cam=orbit",
  B_roof: "ver=new&shade=B&cam=orbit&o=4.5,9.5,6,0.5,4.8,-3",
  B_rock: "ver=new&shade=B&cam=orbit&o=-4.5,2.6,4.5,-8.2,0.8,-0.5",
  B_eave: "ver=new&shade=B&cam=orbit&o=6.6,1.6,1.4,3.4,3.4,-2.2",
  C_roof: "ver=new&shade=C&cam=orbit&o=4.5,9.5,6,0.5,4.8,-3",
  A_roof: "ver=new&shade=A&cam=orbit&o=4.5,9.5,6,0.5,4.8,-3",
  old_roof: "ver=old&cam=orbit&o=4.5,9.5,6,0.5,4.8,-3",
  B_attack: "ver=new&shade=B&cam=orbit&anim=attack&o=2.0,4.2,12.5,4.0,1.3,2.4",
  B_raw: "ver=new&shade=B&cam=game&post=raw",
};
const want = process.argv.slice(2);
const list = (want.length ? want : [...Object.keys(SHOTS), "page"]).filter((k) => k !== "sheet");
const b = await chromium.launch({ executablePath: exe, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
fs.mkdirSync(path.join(DIR, "png"), { recursive: true });
for (const k of list) {
  const p = await b.newPage({ viewport: { width: 1840, height: 860 } });
  p.on("pageerror", (e) => console.log("[err]", k, e.message));
  p.on("console", (m) => m.type() === "error" && console.log("[console]", k, m.text()));
  const hash = k === "page" ? "ver=new&shade=B&cam=game" : SHOTS[k];
  await p.goto(pathToFileURL(path.join(DIR, "index.html")).href + "#" + hash + "&pr=1");
  await p.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 120000 });
  await p.waitForTimeout(k.includes("attack") ? 2300 : 1500);
  const bench = await p.evaluate(async () => { const a = await window.__demo.bench(40); const b = await window.__demo.bench(40); return Math.min(a, b); });
  const o = path.join(DIR, "png", `${k}.png`);
  if (k === "page") {
    await p.screenshot({ path: o, fullPage: true });
    fs.writeFileSync(path.join(DIR, "parts.json"), JSON.stringify(await p.evaluate(() => window.__demo.parts()), null, 1));
  }
  else await (await p.$("#stage")).screenshot({ path: o });
  const d = await p.evaluate(() => ({ gpu: window.__demo.gpu, calls: window.__demo.calls, cpu: window.__demo.cpu, programs: window.__demo.programs, build: window.__demo.buildMs, bakeMB: window.__demo.bake.bytes / 1048576, tris: document.getElementById("tris").textContent, vram: document.getElementById("vram").textContent }));
  console.log("ok", k, "GPU基准", bench && bench.toFixed(2), "ms", JSON.stringify(d));
  await p.close();
}
// 对比拼图：现状 / A / B / C（游戏镜头）与近景
if (!want.length || want.includes("sheet")) {
  const p = await b.newPage({ viewport: { width: 1600, height: 960 } });
  const img = (n) => "data:image/png;base64," + fs.readFileSync(path.join(DIR, "png", n + ".png")).toString("base64");
  const cell = (n, t) => `<figure><img src="${img(n)}"><figcaption>${t}</figcaption></figure>`;
  const html = (rows) => `<html><body style="margin:0;background:#ece6d6;font:22px KaiTi,serif;color:#15181b"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px">${rows}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 4px 6px}</style></body></html>`;
  for (const [name, list] of [["sheet_game", [["old_game", "现状（游戏镜头）"], ["A_game", "精细版 · A 现行 toon"], ["B_game", "精细版 · B 水墨写意"], ["C_game", "精细版 · C 写实 PBR"]]], ["sheet_close", [["old_close", "现状（近景）"], ["A_close", "精细版 · A"], ["B_close", "精细版 · B"], ["C_close", "精细版 · C"]]], ["sheet_roof", [["old_roof", "现状屋顶"], ["A_roof", "精细版屋顶 · A"], ["B_roof", "精细版屋顶 · B"], ["C_roof", "精细版屋顶 · C"]]]]) {
    if (!list.every(([n]) => fs.existsSync(path.join(DIR, "png", n + ".png")))) continue;
    await p.setContent(html(list.map(([n, t]) => cell(n, t)).join("")));
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(DIR, "png", name + ".png"), fullPage: true });
    console.log("ok", name);
  }
}
await b.close();
