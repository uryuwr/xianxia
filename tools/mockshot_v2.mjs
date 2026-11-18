// UI 示意图 v2 渲染：docs/ui/v2/*.html → docs/ui/v2/png/*.png（1280×720），并生成总览拼图 _overview.png
// 用法：node tools/mockshot_v2.mjs [页面名...]   不带参数时渲染全部（先自动更新字体子集）；另外总会渲染 kit/gallery.html → png/gallery.png
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs", "ui", "v2");
const PNG = path.join(DIR, "png");
fs.mkdirSync(PNG, { recursive: true });
const ORDER = ["start", "hud", "prep", "bag", "result", "cave", "alchemy", "realm", "map"];
let names = process.argv.slice(2);
if (!process.env.NOFONT) execFileSync(process.execPath, [path.join(ROOT, "tools", "ui_fonts.mjs")], { stdio: "ignore" });
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ executablePath: exe, args: ["--allow-file-access-from-files"] });
const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
if (!names.length) names = all;
for (const n of names) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(pathToFileURL(path.join(DIR, n + ".html")).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(PNG, n + ".png") });
  await p.close();
  console.log("png", n);
}
// 组件总览（整页长图）
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(pathToFileURL(path.join(DIR, "kit", "gallery.html")).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(PNG, "gallery.png"), fullPage: true });
  await p.close();
  console.log("png gallery");
}
// 总览：3×3 拼图
const list = ORDER.filter((n) => fs.existsSync(path.join(PNG, n + ".png")));
const p = await browser.newPage({ viewport: { width: 1920, height: 360 * Math.ceil(list.length / 3) } });
const imgs = list.map((n) => [n, "data:image/png;base64," + fs.readFileSync(path.join(PNG, n + ".png")).toString("base64")]);
await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(3,640px);background:#222">${imgs.map(([n, s]) => `<div style="position:relative"><img src="${s}" width=640 style="display:block"><b style="position:absolute;left:8px;top:6px;color:#fff;background:rgba(0,0,0,.45);padding:1px 6px;font:14px sans-serif">${n}</b></div>`).join("")}</body>`);
await p.screenshot({ path: path.join(PNG, "_overview.png") });
await browser.close();
