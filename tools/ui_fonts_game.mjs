// 游戏内书法字体子集（模块 A）：从界面文案（src/ui、src/game、src/data 的源码字符串 + docs/ui/v2 示意图）收集汉字，
// 把马善政楷书 / 志莽行书裁成子集，写成 src/ui/ink/<字体>.woff2，并生成 src/ui/ink/fonts.css。没收录的字自动回退到系统楷体。
// 用法：node tools/ui_fonts_game.mjs（需要 assets/fonts/*.ttf 与 python fonttools + brotli，见 tools/ui_fonts.mjs）
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = path.join(ROOT, "assets", "fonts");
const OUT = path.join(ROOT, "src", "ui", "ink", "fonts.css");
const walk = (d, ext) =>
  fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: !0 }).flatMap((e) => (e.isDirectory() ? (["png", "ink", "node_modules"].includes(e.name) ? [] : walk(path.join(d, e.name), ext)) : ext.some((x) => e.name.endsWith(x)) ? [path.join(d, e.name)] : [])) : [];
let text = "";
for (const f of [...walk(path.join(ROOT, "src"), [".js"]), ...walk(path.join(ROOT, "docs", "ui", "v2"), [".html"])]) text += fs.readFileSync(f, "utf8");
text += "0123456789.,:;!?·—…「」『』（）《》、。，：；！？＋－×／% +-/";
const chars = [...new Set([...text].filter((c) => /[　-〿一-鿿＀-￯0-9.,:;!?+\-/%·—…]/.test(c)))].join("");
const tmp = path.join(ROOT, "work", "_subset_chars_game.txt");
fs.writeFileSync(tmp, chars);
console.log("字数", chars.length);
let css = "/* 自动生成：node tools/ui_fonts_game.mjs —— 书法字体子集（SIL OFL 1.1），字表取自游戏界面文案 */\n";
for (const [fam, file] of [["MaShanZheng", "MaShanZheng-Regular.ttf"], ["ZhiMangXing", "ZhiMangXing-Regular.ttf"]]) {
  const src = path.join(FONTS, file);
  if (!fs.existsSync(src)) {
    console.warn("缺少字体，跳过：" + src);
    continue;
  }
  const out = path.join(ROOT, "src", "ui", "ink", fam + ".woff2");
  execFileSync("python", ["-m", "fontTools.subset", src, `--text-file=${tmp}`, "--flavor=woff2", `--output-file=${out}`, "--layout-features=*", "--no-hinting"], { stdio: "inherit" });
  css += `@font-face { font-family: "${fam}"; src: url("./${fam}.woff2") format("woff2"); font-display: swap; }\n`;
  console.log(fam, (fs.statSync(out).size / 1024).toFixed(0) + " KB");
}
fs.writeFileSync(OUT, css);
