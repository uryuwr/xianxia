// 单文件分享包：vite build（全部内联、动态 import 合并）→ 把 JS / CSS / 模型塞进一个 HTML，双击即可离线试玩。
// 用法：node tools/pack.mjs   → 输出 release/墨途_v1.html（另附 release/墨途_v1_web/ 目录版，可放到任意静态服务器）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "release");
const WEB = path.join(OUT, "墨途_v1_web");
const NAME = "墨途_v1.html";

await build({
  root: ROOT,
  base: "./",
  logLevel: "warn",
  build: {
    outDir: WEB,
    emptyOutDir: !0,
    assetsInlineLimit: 1e9, // 字体、svg、光标全部内联成 data URL
    cssCodeSplit: !1,
    modulePreload: !1,
    chunkSizeWarningLimit: 1e5,
    rollupOptions: { output: { inlineDynamicImports: !0 } }, // 懒加载的洞府 / 委托模块并进同一个文件
  },
});

// 模型：目录版拷一份，单文件版内联
const models = path.join(ROOT, "assets", "models");
fs.mkdirSync(path.join(WEB, "assets", "models"), { recursive: !0 });
const embed = {};
for (const f of fs.readdirSync(models).filter((f) => f.endsWith(".glb"))) {
  const buf = fs.readFileSync(path.join(models, f));
  fs.writeFileSync(path.join(WEB, "assets", "models", f), buf);
  embed["/assets/models/" + f] = "data:model/gltf-binary;base64," + buf.toString("base64");
}

// 目录版：模型路径改为相对（静态服务器子目录下也能用）
let html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
const rel = {};
for (const k of Object.keys(embed)) rel[k] = "." + k;
fs.writeFileSync(path.join(WEB, "index.html"), html.replace("<head>", `<head>\n<script>window.__EMBED=${JSON.stringify(rel)}</script>`));

// 单文件版：内联脚本与样式
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => `<script type="module">${safe(fs.readFileSync(path.join(WEB, src), "utf8"))}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => `<style>${fs.readFileSync(path.join(WEB, href), "utf8")}</style>`);
if (/src="\.\/assets\/|href="\.\/assets\//.test(html)) throw new Error("还有未内联的外部资源");
html = html.replace("<head>", `<head>\n<script>window.__EMBED=${JSON.stringify(embed)}</script>`);
fs.mkdirSync(OUT, { recursive: !0 });
fs.writeFileSync(path.join(OUT, NAME), html);
console.log(`${NAME}  ${(fs.statSync(path.join(OUT, NAME)).size / 1048576).toFixed(1)} MB`);
