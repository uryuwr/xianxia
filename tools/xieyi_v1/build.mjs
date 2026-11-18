// 写意留白 v1 打包：node tools/xieyi_v1/build.mjs → docs/art/写意留白_v1/index.html（file:// 可直接打开，不 fetch）
//   与总小样同一套：esbuild 打成 IIFE 内联；.glb → Uint8Array，.png / .webp → data: URL；顶层 await 包进 async IIFE。
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const OUT_DIR = path.join(ROOT, "docs/art/写意留白_v1");
const t0 = Date.now();
const res = await esbuild.build({
  entryPoints: [path.join(DIR, "src/main.js")],
  bundle: true,
  format: "esm",
  minify: !process.env.NOMIN,
  write: false,
  target: "es2022",
  loader: { ".glb": "binary", ".png": "dataurl", ".webp": "dataurl", ".jpg": "dataurl" },
  nodePaths: [path.join(ROOT, "node_modules")],
  legalComments: "none",
  logLevel: "warning",
  define: { "import.meta.env.DEV": "false" },
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = fs.readFileSync(path.join(DIR, "page.html"), "utf8").replace("<script>/*__BUNDLE__*/</script>", '<script type="module">/*__BUNDLE__*/</script>');
const html = page.replace("/*__BUNDLE__*/", () => js);
fs.mkdirSync(path.join(OUT_DIR, "png"), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
console.log(`ok docs/art/写意留白_v1/index.html ${(html.length / 1024 / 1024).toFixed(2)} MB ${Date.now() - t0}ms`);
