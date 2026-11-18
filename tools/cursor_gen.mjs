// 游戏内光标（水墨）：生成 docs/ui/v2/kit/cursors/*.svg（每种 32×32 与 64×64 两个尺寸）
// 统一做法：墨色主体 + 一圈纸色描边（压在深色墨块和白纸地面上都看得清）+ 很淡的投影。
// 热点（hotspot）写在 cursors/README.md 里；64px 版用于高分屏（坐标 ×2）。
// 用法：node tools/cursor_gen.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "ui", "v2", "kit", "cursors");
fs.mkdirSync(OUT, { recursive: true });
const INK = "#15181b", PAPER = "#f5f0e3", ZHU = "#b8291a", GOLD = "#b8923a";
const EL = { metal: "#a8862f", wood: "#3f9a6e", water: "#2f7fa8", fire: "#c0392b", earth: "#9a6a32" };

// 外描边 + 阴影：把同一个形状先用纸色粗描一遍，再画本体
const halo = (d, w = 3) => `<path d="${d}" fill="${PAPER}" stroke="${PAPER}" stroke-width="${w}" stroke-linejoin="round" opacity=".92"/>`;
const shadow = `<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation=".8" flood-color="#000" flood-opacity=".35"/></filter>`;
// 毛笔尖形箭头：笔锋在左上（热点），笔肚圆润，尾部收笔略偏
const TIP = "M3 3 C 9 6, 16 10, 21 15 C 25 19, 25 25, 20 26 C 16 27, 13 24, 11 20 C 8 14, 5 8, 3 3 Z";
// 一笔圆相（粗细变化的开口圆）：用两段不同宽度的弧叠出提按
const enso = (cx, cy, r, c, w = 2.6, gap = 40, rot = -70) => {
  const a0 = (rot * Math.PI) / 180, a1 = ((rot + 360 - gap) * Math.PI) / 180;
  const p = (a, rr = r) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
  const mid = (a0 + a1) / 2;
  return `<path d="M${p(a0)} A${r} ${r} 0 0 1 ${p(mid)}" fill="none" stroke="${c}" stroke-width="${w * 1.25}" stroke-linecap="round"/>` +
    `<path d="M${p(mid)} A${r} ${r} 0 0 1 ${p(a1)}" fill="none" stroke="${c}" stroke-width="${w * 0.7}" stroke-linecap="round"/>`;
};
const ring = (cx, cy, r, c, w, gap, rot) => enso(cx, cy, r, PAPER, w + 2.4, gap, rot) + enso(cx, cy, r, c, w, gap, rot);
const dot = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r + 1.2}" fill="${PAPER}" opacity=".92"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const tick = (x1, y1, x2, y2, c, w = 2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${PAPER}" stroke-width="${w + 2.2}" stroke-linecap="round" opacity=".92"/><path d="M${x1} ${y1}L${x2} ${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;

const C = {};
// 默认：墨色笔尖
C.default = { hot: [3, 3], body: halo(TIP) + `<path d="${TIP}" fill="${INK}"/>` + `<path d="M6 6 C 10 9, 14 12, 17 15" stroke="${PAPER}" stroke-width=".8" opacity=".35" fill="none"/>` };
// 悬停界面按钮：笔尖 + 尾部一点泥金（朱色留给敌人与决断）
C.ui = { hot: [3, 3], body: halo(TIP) + `<path d="${TIP}" fill="${INK}"/>` + dot(24, 25, 3.2, GOLD) };
// 可交互（拾取、对话、开阵）：笔尖 + 泥金小圆相
C.interact = { hot: [3, 3], body: halo(TIP) + `<path d="${TIP}" fill="${INK}"/>` + ring(24, 23, 5.5, GOLD, 2, 50, -40) };
// 指向敌人：朱砂圆相 + 四道短笔（准星），中心一点
C.enemy = { hot: [16, 16], body: ring(16, 16, 9, ZHU, 2.6, 36, -60) + tick(16, 1.5, 16, 5.5, ZHU) + tick(16, 26.5, 16, 30.5, ZHU) + tick(1.5, 16, 5.5, 16, ZHU) + tick(26.5, 16, 30.5, 16, ZHU) + dot(16, 16, 1.6, ZHU) };
// 不可用：淡墨圆相 + 一道斜笔
C.invalid = { hot: [16, 16], body: ring(16, 16, 10, "rgba(21,24,27,.55)", 2.4, 30, -50) + tick(9, 23, 23, 9, "rgba(21,24,27,.6)", 2.4) };
// 施法瞄准（按五行着色）：细圆相 + 十字细笔 + 中心点
for (const [k, c] of Object.entries(EL))
  C["aim-" + k] = { hot: [16, 16], body: ring(16, 16, 11, c, 2, 26, -80) + ring(16, 16, 5, c, 1.4, 60, 120) + dot(16, 16, 1.5, c) };

let readme = "# 水墨光标\n\n由 `node tools/cursor_gen.mjs` 生成。每种光标有 32 / 64 两个尺寸，64 是 32 的两倍坐标。\n\n| 名称 | 用途 | 热点 32 | 热点 64 |\n|---|---|---|---|\n";
const use = { default: "默认（场景中）", ui: "悬停可点的界面元素", interact: "可交互物（拾取、对话、开阵、撤离点）", enemy: "指向敌人", invalid: "不可施放 / 超出范围 / 冷却中", "aim-metal": "瞄准（金）", "aim-wood": "瞄准（木）", "aim-water": "瞄准（水）", "aim-fire": "瞄准（火）", "aim-earth": "瞄准（土）" };
for (const [k, v] of Object.entries(C)) {
  for (const s of [32, 64]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32"><defs>${shadow}</defs><g filter="url(#sh)">${v.body}</g></svg>`;
    fs.writeFileSync(path.join(OUT, `${k}_${s}.svg`), svg);
  }
  readme += `| \`${k}\` | ${use[k]} | ${v.hot.join(", ")} | ${v.hot.map((n) => n * 2).join(", ")} |\n`;
}
readme += `
CSS 用法（界面层）：\`cursor: image-set(url(cursors/default_32.svg) 1x, url(cursors/default_64.svg) 2x) 3 3, default;\`

游戏内若用自绘光标（隐藏系统光标、DOM/Canvas 元素跟随鼠标），把热点坐标当作元素的 transform-origin / 偏移即可；
光标元素放在最上层、\`pointer-events: none\`，不参与水墨后处理（保证任何画面下都清楚）。
`;
fs.writeFileSync(path.join(OUT, "README.md"), readme);
console.log("cursors", Object.keys(C).length, "× 2");
