// 洞府界面用的位图（模块 C）：把水墨套件里用 SVG 滤镜画的立绘、插画、纸纹、墨晕，离线栅格化成 PNG，
// 运行时直接用位图，免得第一次进洞府在主线程上跑 feTurbulence（实测单次 100–450ms）。
// 套件更新后重跑：node tools/cave_art.mjs   → 输出到 src/ui/cave/art/
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const INK = path.join(ROOT, "src/ui/ink");
const OUT = path.join(ROOT, "src/ui/cave/art");
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium-1243/chrome-win64/chrome.exe");

// 立绘 / 插画：按 1.5 倍栅格化（界面在 1080p 上会放大到 1.5 倍）
const ART = [["portrait_linmo.svg", 1.5], ["portrait_linmo_bust.svg", 1.5], ["art_danlu.svg", 1.5]];
// 纸纹、墨晕（strokes.css 里带 feTurbulence 的变量）：纹理按原尺寸平铺，墨晕按 512
const VARS = { "--ink-tex-paper": 0, "--ink-tex-fiber": 0, "--ink-tex-cloud": 0, "--ink-wash-1": 512, "--ink-wash-2": 512, "--ink-wash-round": 512 };

const css = fs.readFileSync(path.join(INK, "strokes.css"), "utf8");
const jobs = [];
for (const [f, k] of ART) jobs.push({ name: f.replace(/\.svg$/, ".png"), src: "data:image/svg+xml;base64," + fs.readFileSync(path.join(INK, f)).toString("base64"), k });
for (const [v, size] of Object.entries(VARS)) {
  const m = css.match(new RegExp(v + ':\\s*url\\("([^"]+)"\\)'));
  if (!m) continue;
  jobs.push({ name: v.replace(/^--ink-/, "") + ".png", src: m[1], size });
}

const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage();
for (const j of jobs) {
  const data = await p.evaluate(async ({ src, k, size }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = size || Math.round((img.naturalWidth || 512) * (k || 1)), h = size || Math.round((img.naturalHeight || 512) * (k || 1));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/png");
  }, j);
  const buf = Buffer.from(data.split(",")[1], "base64");
  fs.writeFileSync(path.join(OUT, j.name), buf);
  console.log(j.name, (buf.length / 1024).toFixed(0) + " KB");
}
await b.close();
