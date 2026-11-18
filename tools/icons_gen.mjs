// 物品图标图集生成（构建期，一次性）：node tools/icons_gen.mjs [--q 0.82]
//   启动 Vite → 用 Playwright 打开 tools/icons/bake.html → 注册全部物品（items_db + 流程 / 洞府 / 委托的兜底物品），
//   按 tools/icons/inkicons.js 的笔路模板画成"水墨纸性位图"（主图集）与"墨拓剪影"（未鉴定 / 先露形用）→ 打包 webp。
// 产物（入库，运行时只读）：src/ui/icons/items.webp（物品 + 技能）、items_sil.webp（墨拓剪影）、items_map.webp（地图图标 64px）、items.json
// 新增物品后重跑本脚本即可；没重跑时运行时按类别兜底（src/ui/icons.js），不会报错。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "ui", "icons");
const qi = process.argv.indexOf("--q");
const q = qi > 0 ? Number(process.argv[qi + 1]) : 0.82;
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false } });
await server.listen();
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(server.resolvedUrls.local[0] + "tools/icons/bake.html?q=" + q);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__bakeErr);
if (err) {
  console.error(err);
  process.exit(1);
}
const r = await page.evaluate(() => window.__bake);
const save = (name, dataUrl) => {
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(OUT, name), buf);
  return (buf.length / 1024).toFixed(0) + " KB";
};
console.log("items.webp", save("items.webp", r.main), `${r.json.main.W}×${r.json.main.H}`);
console.log("items_sil.webp", save("items_sil.webp", r.sil), `${r.json.sil.W}×${r.json.sil.H}`);
console.log("items_map.webp", save("items_map.webp", r.map), `${r.json.map.W}×${r.json.map.H}`);
fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(r.json));
console.log("items.json", Object.keys(r.json.main.rects).length, "main rects ·", Object.keys(r.json.sil.rects).length, "sil rects");
console.log("stats", JSON.stringify(r.stats));
await browser.close();
await server.close();
