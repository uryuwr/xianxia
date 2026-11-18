// 丹器房器物插画（炼器鼎 / 丹炉）烘焙：node tools/vessel_gen.mjs [--install ding=<变体> furnace=<变体>]
//   启动 Vite → Playwright 打开 tools/vessels/bake.html → 用 tools/icons/inkicons.js 的纸性位图渲染器把 tools/vessels/vessels.js 的模板画成 512×512 透明 png。
//   不带参数：输出全部变体到 docs/ui/v2/forge_v2/vessels/（示意对比用）+ meta.json。
//   --install：把选定的变体写进游戏：src/ui/ink/art_ding.png、src/ui/ink/art_furnace.png、src/ui/cave/vessel_meta.json。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const inst = args.includes("--install") ? Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split("="))) : null;
const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5990 + Math.floor(Math.random() * 90), strictPort: false } });
await server.listen();
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(server.resolvedUrls.local[0] + "tools/vessels/bake.html");
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__bakeErr);
if (err) (console.error(err), process.exit(1));
const r = await page.evaluate(() => window.__bake);
const save = (file, url) => (fs.mkdirSync(path.dirname(file), { recursive: true }), fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64")), (fs.statSync(file).size / 1024).toFixed(0) + " KB");
if (!inst) {
  const dir = path.join(ROOT, "docs", "ui", "v2", "forge_v2", "vessels");
  for (const [id, v] of Object.entries(r.out)) console.log(id, save(path.join(dir, id + ".png"), v.png), v.ms + "ms");
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ size: r.S, meta: r.META, variants: r.VARIANTS }, null, 1));
} else {
  const dst = { ding: "src/ui/ink/art_ding.png", furnace: "src/ui/ink/art_furnace.png" };
  const meta = {};
  for (const [kind, id] of Object.entries(inst)) {
    if (!r.out[id]) throw new Error("没有这个变体：" + id);
    console.log(kind, id, save(path.join(ROOT, dst[kind]), r.out[id].png));
    meta[kind] = { id, ...r.META[id] };
  }
  const mf = path.join(ROOT, "src", "ui", "cave", "vessel_meta.json");
  const old = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
  fs.writeFileSync(mf, JSON.stringify({ ...old, ...meta }, null, 1));
  console.log("meta", mf);
}
await browser.close();
await server.close();
