// 搜取 v2 草图截图：node docs/ui/v2/loot_v2/shoot.mjs → docs/ui/v2/png/搜取_v2_草图.png（四个时刻 + 状态说明）
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUT = path.join(ROOT, "docs/ui/v2/png");
const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5900 + Math.floor(Math.random() * 90) } });
await server.listen();
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
p.on("pageerror", (e) => console.log("[err]", e.message));
await p.routeWebSocket(/./, () => {});
await p.goto(server.resolvedUrls.local[0] + "docs/ui/v2/loot_v2/index.html?auto=0");
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await p.waitForTimeout(400);
const clip = { x: 520, y: 160, width: 640, height: 400 };
const shots = [];
const snap = async (name, wait = 0) => {
  if (wait) await p.waitForTimeout(wait);
  const f = path.join(ROOT, "work/shots", "loot_v2_" + name + ".png");
  await p.screenshot({ path: f, clip });
  shots.push([name, f]);
};
// 推进到"某格走到 v"（逐帧 1/60 秒）
const until = (fn) => p.evaluate(async (src) => {
  const f = new Function("W", "return " + src);
  for (let k = 0; k < 2000 && !f(__lw2.W); k++) __lw2.step(1 / 60);
}, fn);
await until("W.i === 3 && W.local > W.need[3] * 0.72");
await snap("1_形", 350);
await until("W.i === 5 && W.local < 0.02");
await snap("2_仙品揭示", 140);
await until("W.done");
await p.evaluate(() => { const W = __lw2.W; W.cells[4].dispatchEvent(new Event("mouseenter")); });
await snap("3_全部揭示", 700);
await p.evaluate(() => __lw2.setSense(100));
await until("W.i === 1 && W.local > W.need[1] * 0.5");
await snap("4_神识100预感", 300);
await p.screenshot({ path: path.join(ROOT, "work/shots/loot_v2_legend.png"), clip: { x: 0, y: 720, width: 1280, height: 380 } });
// 拼图
const img = (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
const L = { "1_形": "探查中：神识一笔走到七成，墨封化开、露出剪影（探得其形）", "2_仙品揭示": "仙品揭示的瞬间：顿笔、泛金、名称浮出", "3_全部揭示": "全部揭示：悬停显示「名称 · 品质 · ×数量」；未鉴定保持剪影 + ？", "4_神识100预感": "神识 100：墨封下隐约浮现剪影轮廓（预感），探查更快" };
const s = await b.newPage({ viewport: { width: 1320, height: 100 } });
await s.setContent(`<body style="margin:0;background:#ece6d6;font-family:KaiTi,serif;padding:14px 20px"><h1 style="font:28px KaiTi;margin:0 0 8px;letter-spacing:.1em">搜取 v2 草图 · 物品签 + 先露形后显色</h1><div style="display:grid;grid-template-columns:640px 640px;gap:10px 20px">${shots.map(([n, f]) => `<div><b style="font-size:16px">${L[n]}</b><img src="${img(f)}" width=640 style="display:block;margin-top:4px"></div>`).join("")}</div><img src="${img(path.join(ROOT, "work/shots/loot_v2_legend.png"))}" width=1280 style="display:block;margin-top:12px"></body>`);
await s.setViewportSize({ width: 1320, height: await s.evaluate(() => document.body.scrollHeight) });
await s.screenshot({ path: path.join(OUT, "搜取_v2_草图.png"), fullPage: !0 });
console.log("ok", path.join(OUT, "搜取_v2_草图.png"));
await b.close();
await server.close();
