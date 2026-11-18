// 书法标题字体子集化：收集 docs/ui/v2 下所有页面用到的字，把开源书法字体裁成只含这些字的 woff2，内联进 kit/fonts.css。
// 字体（SIL Open Font License）：马善政楷书 Ma Shan Zheng（标题 / 按钮）、志莽行书 Zhi Mang Xing（大字）
// 源字体放在 assets/fonts/；需要 Python fonttools + brotli：python -m pip install fonttools brotli
// 用法：node tools/ui_fonts.mjs        游戏内集成时，同样从界面文案里收集字表再生成
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs", "ui", "v2");
const FONTS = path.join(ROOT, "assets", "fonts");
const OUT = path.join(SRC, "kit", "fonts.css");

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: !0 }).flatMap((e) => (e.isDirectory() ? (e.name === "png" ? [] : walk(path.join(d, e.name))) : e.name.endsWith(".html") ? [path.join(d, e.name)] : []));
}
let text = "";
for (const f of walk(SRC)) text += fs.readFileSync(f, "utf8").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
// 常备字：数字、标点、境界与常用界面词
text += "0123456789０１２３４５６７８９.,:;!?·—…「」『』（）《》、。，：；！？＋－×／% +-/";
text += "练气筑基金丹元婴一二三四五六七八九十层境界修为突破出行撤离储物袋洞府炼丹炉器鼎灵泉药园仓库鉴宝台参悟搬迁天机镜地图设置继续新卷续卷返回确认取消开始";
const chars = [...new Set([...text].filter((c) => c.trim()))].join("");
const tmp = path.join(ROOT, "work", "_subset_chars.txt");
fs.writeFileSync(tmp, chars);

let css = "/* 自动生成：node tools/ui_fonts.mjs —— 书法标题字体子集（SIL OFL 1.1） */\n";
for (const [fam, file] of [["MaShanZheng", "MaShanZheng-Regular.ttf"], ["ZhiMangXing", "ZhiMangXing-Regular.ttf"]]) {
  const src = path.join(FONTS, file);
  if (!fs.existsSync(src)) {
    console.warn("缺少字体，跳过：" + src);
    continue;
  }
  const out = path.join(ROOT, "work", fam + ".subset.woff2");
  execFileSync("python", ["-m", "fontTools.subset", src, `--text-file=${tmp}`, "--flavor=woff2", `--output-file=${out}`, "--layout-features=*", "--no-hinting"], { stdio: "inherit" });
  const b64 = fs.readFileSync(out).toString("base64");
  css += `@font-face { font-family: "${fam}"; src: url(data:font/woff2;base64,${b64}) format("woff2"); font-display: block; }\n`;
  console.log(fam, (b64.length / 1024).toFixed(0) + " KB (base64)");
}
fs.writeFileSync(OUT, css);
console.log("chars", chars.length, "→", path.relative(ROOT, OUT));
