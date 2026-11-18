// 精细化小样 v1 打包：node tools/art_refine_v1/build.mjs
//   esbuild 把 tools/art_refine_v1/src/main.js（及其 import 的 src/render/*、three、角色模块）打成一个 IIFE，
//   和 page.html 一起内联成 docs/art/精细化小样_v1/index.html —— 可直接双击（file://）打开，不依赖网络、不 fetch。
//   资源：.glb → Uint8Array（binary 加载器），.png / .webp → data: URL。
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const OUT_DIR = path.join(ROOT, "docs/art/精细化小样_v1");
// 角色（art-char 交付）：docs/art/精细化小样_v1/assets/ 下有 char_mats.js + hero_v2.glb + qingya_v2.glb 就打包进来，否则用现状模型占位
const CA = path.join(OUT_DIR, "assets");
const has = (f) => fs.existsSync(path.join(CA, f));
const fwd = (p) => p.split(path.sep).join("/");
const hasC = has("char_mats.js") && !process.env.NOCHARS;
const charsSrc = hasC
  ? [`export * as C from ${JSON.stringify(fwd(path.join(CA, "char_mats.js")))};`,
     has("hero_v2.glb") ? `export { default as heroV2 } from ${JSON.stringify(fwd(path.join(CA, "hero_v2.glb")))};` : "export const heroV2 = null;",
     has("qingya_v2.glb") ? `export { default as bossV2 } from ${JSON.stringify(fwd(path.join(CA, "qingya_v2.glb")))};` : "export const bossV2 = null;"].join(";")
  : "export const C = null, heroV2 = null, bossV2 = null;";
console.log("角色：", hasC ? `char_mats.js ✓ · hero_v2 ${has("hero_v2.glb") ? "✓" : "（缺，用现状占位）"} · qingya_v2 ${has("qingya_v2.glb") ? "✓" : "（缺，用现状占位）"}` : "现状模型占位");
const virtualChars = {
  name: "virtual-chars",
  setup(b) {
    b.onResolve({ filter: /^virtual:chars$/ }, () => ({ path: "chars", namespace: "vchars" }));
    b.onLoad({ filter: /.*/, namespace: "vchars" }, () => ({ contents: charsSrc, resolveDir: fwd(DIR), loader: "js" }));
  },
};
const t0 = Date.now();
const res = await esbuild.build({
  entryPoints: [path.join(DIR, "src/main.js")],
  bundle: true,
  format: "iife",
  minify: process.env.NOMIN ? false : true,
  write: false,
  target: "es2020",
  loader: { ".glb": "binary", ".png": "dataurl", ".webp": "dataurl", ".jpg": "dataurl" },
  nodePaths: [path.join(ROOT, "node_modules")],
  legalComments: "none",
  logLevel: "warning",
  plugins: [virtualChars],
  define: { "import.meta.env.DEV": "false" },
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = fs.readFileSync(path.join(DIR, "page.html"), "utf8");
const html = page.replace("/*__BUNDLE__*/", () => js);
fs.mkdirSync(path.join(OUT_DIR, "png"), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
console.log(`ok index.html ${(html.length / 1024 / 1024).toFixed(2)} MB（脚本 ${(js.length / 1024 / 1024).toFixed(2)} MB）${Date.now() - t0}ms`);
