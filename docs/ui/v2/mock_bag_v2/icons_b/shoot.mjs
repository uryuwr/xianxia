// 路线 (b) 样例烘焙：打开 render.html（three.js 离屏渲染 + 水墨后期），取回图集与计时，写出 PNG / timing.json。
// 用法：node docs/ui/v2/mock_bag_v2/icons_b/shoot.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../../../../..");
const { chromium } = createRequire(path.join(ROOT, "package.json"))("playwright-core");
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const gpu = process.argv.includes("--gpu");
const args = ["--allow-file-access-from-files", ...(gpu ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])];
const browser = await chromium.launch({ executablePath: exe, args, headless: true });
const p = await browser.newPage({ viewport: { width: 2100, height: 520 } });
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(pathToFileURL(path.join(DIR, "render.html")).href);
await p.waitForFunction(() => window.__RESULT || null, null, { timeout: 60000 }).catch(() => {});
const r = await p.evaluate(() => window.__RESULT);
if (!r) { console.error("no result", errs); process.exit(1); }
const w = (f, url) => fs.writeFileSync(path.join(DIR, f), Buffer.from(url.split(",")[1], "base64"));
w("atlas_b.png", r.atlas);
w("atlas_b_256.png", r.atlas256);
for (const [n, u] of Object.entries(r.icons)) w(`b_${n}.png`, u);
for (const [n, u] of Object.entries(r.icons256)) w(`b_${n}_256.png`, u);
r.timing.mode = gpu ? "gpu" : "swiftshader";
const tf = path.join(DIR, gpu ? "timing_gpu.json" : "timing.json");
fs.writeFileSync(tf, JSON.stringify(r.timing, null, 2));
await p.screenshot({ path: path.join(DIR, "preview_b.png"), fullPage: true });
console.log(JSON.stringify(r.timing, null, 1), errs);
await browser.close();
