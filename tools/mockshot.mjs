// UI 示意图生成器：把 docs/ui/*.html（自包含：样式与背景图都内联）生成出来，并用 Playwright 渲染成 1280×720 PNG。
// 用法：node tools/mockshot.mjs [页面名...]   不带参数时生成全部
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "ui");
const PNG = path.join(OUT, "png");
fs.mkdirSync(PNG, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const browser = await chromium.launch({ executablePath: exe });

// 游戏截图 → 压缩 JPEG（内联为 data URI，保持 HTML 自包含）
async function jpeg(name, q = 70, w = 1280, h = 720, filter = "") {
  const f = path.join(ROOT, "work", "shots", name + ".png");
  if (!fs.existsSync(f)) return "";
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  const b64 = fs.readFileSync(f).toString("base64");
  await p.setContent(`<body style="margin:0"><img src="data:image/png;base64,${b64}" style="width:${w}px;height:${h}px;object-fit:cover;display:block;filter:${filter}"></body>`);
  const buf = await p.screenshot({ type: "jpeg", quality: q });
  await p.close();
  return "data:image/jpeg;base64," + buf.toString("base64");
}

// 宣纸纹理（SVG 噪声）
const PAPER = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .35  0 0 0 0 .32  0 0 0 0 .26  0 0 0 .09 0'/></filter><rect width='300' height='300' filter='url(#n)'/></svg>`)}")`;
const FIBER = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.012 .2' numOctaves='2' seed='4'/><feColorMatrix values='0 0 0 0 .3  0 0 0 0 .27  0 0 0 0 .2  0 0 0 .05 0'/></filter><rect width='600' height='600' filter='url(#f)'/></svg>`)}")`;

const BASE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:720px;overflow:hidden}
body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#15181b;background:${PAPER},${FIBER},#ece6d6;background-blend-mode:multiply;position:relative}
.kai{font-family:"STKaiti","KaiTi","楷体","Kaiti SC",serif}
.paper{background:${PAPER},rgba(244,239,226,.94);box-shadow:0 0 0 1px rgba(21,24,27,.28),0 8px 24px rgba(21,24,27,.18),inset 0 0 22px rgba(120,100,70,.18);border-radius:3px}
.ink-line{height:2px;background:linear-gradient(90deg,transparent,#15181b 8%,#15181b 70%,transparent);opacity:.75;border-radius:2px}
.seal{display:inline-flex;align-items:center;justify-content:center;background:#b8291a;color:#f4ece0;font-family:"STKaiti","KaiTi",serif;font-weight:900;border-radius:3px;box-shadow:inset 0 0 0 2px rgba(244,236,224,.55),0 1px 2px rgba(0,0,0,.3)}
.btn{display:inline-flex;align-items:center;justify-content:center;font-family:"STKaiti","KaiTi",serif;font-weight:700;font-size:20px;padding:6px 22px;border:1.5px solid #15181b;border-radius:3px;background:rgba(244,239,226,.7)}
.btn.primary{background:#15181b;color:#f1eadb}
.q0{--q:#6a6760}.q1{--q:#3fae7a}.q2{--q:#2f7fa8}.q3{--q:#c9a040}.q4{--q:#c9a040}
.tag{display:inline-block;font-size:12px;padding:1px 6px;border-radius:2px;border:1px solid currentColor;line-height:16px}
.muted{color:#6a6760}
h1,h2,h3{font-family:"STKaiti","KaiTi",serif}
.bar{position:relative;height:10px;background:rgba(21,24,27,.18);border-radius:5px 2px 6px 2px;overflow:hidden}
.bar i{position:absolute;inset:0;border-radius:inherit;transform-origin:left}
`;

const IMG = {
  play: await jpeg("tint_play_tint", 72),
  overview: await jpeg("art_overview", 70, 1280, 720, "saturate(.8)"),
  pavilion: await jpeg("art_pavilion", 70, 1280, 720, "saturate(.8)"),
  fight: await jpeg("enemies_fight", 72),
};

// 物品格子：物品数据 [名, 字, 品质, 占格(1|2|4), 灵值, 是否未鉴定]
function cell(it) {
  const [n, g, q, size, v, unk] = it;
  const span = size === 4 ? "grid-column:span 2;grid-row:span 2" : size === 2 ? "grid-column:span 2" : "";
  return `<div class="it q${q}${unk ? " unk" : ""}" style="${span}"><b class="kai">${g}</b><span>${n}</span>${v ? `<em>${v}</em>` : ""}</div>`;
}
const ITEM_CSS = `
.grid{display:grid;grid-template-columns:repeat(6,62px);grid-auto-rows:62px;gap:5px}
.it,.slot{position:relative;border-radius:3px;background:rgba(236,230,214,.9);box-shadow:inset 0 0 0 2px var(--q,#6a6760),inset 0 0 14px rgba(21,24,27,.12)}
.slot{box-shadow:inset 0 0 0 1px rgba(21,24,27,.2);background:rgba(21,24,27,.05)}
.it b{position:absolute;left:0;right:0;top:6px;text-align:center;font-size:26px;color:var(--q)}
.it[style*="span 2;grid-row"] b{font-size:54px;top:22px}
.it[style*="span 2"]:not([style*="grid-row"]) b{font-size:28px}
.it span{position:absolute;left:0;right:0;bottom:3px;text-align:center;font-size:11px;color:#15181b;white-space:nowrap;overflow:hidden}
.it em{position:absolute;right:3px;top:2px;font-size:10px;font-style:normal;color:#8a6a20}
.it.unk{background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--q) 35%,transparent),rgba(236,230,214,.9) 70%)}
.it.unk b{filter:blur(.6px);opacity:.75}
`;

const PAGES = {};

// ---------------- 开始界面 ----------------
PAGES.start = `
<style>
.bg{position:absolute;inset:0;background:url(${IMG.overview}) center/cover;filter:saturate(.9)}
.fade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(236,230,214,0) 30%,rgba(236,230,214,.75) 58%,rgba(236,230,214,.97) 72%)}
.rod{position:absolute;right:56px;top:40px;bottom:40px;width:14px;background:linear-gradient(90deg,#3a2a1c,#7a5a3a,#3a2a1c);border-radius:7px}
.title{position:absolute;right:120px;top:70px;writing-mode:vertical-rl;font-size:118px;font-weight:900;letter-spacing:18px;line-height:1}
.title .seal{writing-mode:horizontal-tb;font-size:22px;width:52px;height:52px;margin-top:14px}
.sub{position:absolute;right:270px;top:90px;writing-mode:vertical-rl;font-size:22px;letter-spacing:8px;color:#3a3a36}
.menu{position:absolute;right:340px;top:300px;display:flex;flex-direction:column;gap:14px;align-items:flex-end}
.menu div{font-size:30px;font-weight:700;letter-spacing:10px;padding:2px 10px}
.menu .on{background:linear-gradient(90deg,transparent,rgba(21,24,27,.12) 30%,rgba(21,24,27,.12));border-right:4px solid #b8291a}
.menu small{display:block;text-align:right;font-family:"PingFang SC";font-size:13px;letter-spacing:1px;color:#5a5a55;margin-top:2px}
.ver{position:absolute;left:24px;bottom:16px;font-size:12px;color:#f4ece0;text-shadow:0 0 4px #000}
</style>
<div class="bg"></div><div class="fade"></div><div class="rod"></div>
<div class="title kai">墨途<span class="seal">墨州</span></div>
<div class="sub kai">一卷山河 · 一条归途</div>
<div class="menu kai">
  <div class="on">续卷<small>练气五层 · 竹海溪谷 · 第 5 次出行 · 0 时 52 分</small></div>
  <div>新卷</div><div>卷宗</div><div>设置</div><div>画外记</div>
</div>
<div class="ver">墨途 · 垂直切片 v0.1</div>`;

// ---------------- 局内 HUD ----------------
PAGES.hud = `
<style>
.bg{position:absolute;inset:0;background:url(${IMG.play}) center/cover}
.tl{position:absolute;left:18px;top:14px;width:330px;padding:10px 14px}
.row{display:flex;align-items:center;gap:10px;margin:4px 0}
.row b{width:34px;font-size:16px}
.row .bar{flex:1;height:12px}
.row span{font-size:12px;width:62px;text-align:right}
.dash{display:flex;gap:6px;margin-left:44px}.dash i{width:10px;height:10px;border-radius:50%;background:#15181b}
.mini{position:absolute;left:18px;top:128px;width:170px;height:118px;padding:6px}
.mini svg{width:100%;height:100%}
.time{position:absolute;left:50%;top:14px;transform:translateX(-50%);width:420px;padding:8px 16px;text-align:center}
.phases{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:4px 0}
.phases i{flex:1}
.cursor{position:absolute;top:30px;left:66%;width:3px;height:22px;background:#b8291a}
.tr{position:absolute;right:18px;top:14px;width:210px;padding:10px 14px;text-align:right}
.tr .v{font-size:34px;font-weight:900;color:#8a6a20;line-height:1}
.bot{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:flex-end}
.sk{width:58px;height:58px;border-radius:6px;background:radial-gradient(circle at 50% 40%,#f6f1e4,#e2d9c3);box-shadow:0 0 0 2px var(--c,#15181b),0 2px 6px rgba(0,0,0,.35);position:relative;display:flex;align-items:center;justify-content:center;font:900 30px "STKaiti","KaiTi",serif}
.sk small{position:absolute;left:4px;top:2px;font:700 11px "PingFang SC";opacity:.7}
.sk em{position:absolute;right:4px;bottom:2px;font:700 12px "PingFang SC";font-style:normal}
.sk.cd::after{content:"";position:absolute;inset:0;border-radius:6px;background:conic-gradient(rgba(21,24,27,.7) 62%,transparent 0)}
.sk.lock{opacity:.45;filter:grayscale(1);font-size:20px}
.sk.s{width:46px;height:46px;font-size:22px}
.sep{width:10px}
.br{position:absolute;right:18px;bottom:16px;width:230px;padding:8px 12px}
.feed{position:absolute;left:18px;bottom:20px;font-size:14px;line-height:24px}
.feed div{background:linear-gradient(90deg,rgba(236,230,214,.9),transparent);padding:0 40px 0 8px;border-left:3px solid var(--q)}
.ex{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);text-align:center}
.ring{width:150px;height:150px;border-radius:50%;background:conic-gradient(#15181b 0 64%,rgba(21,24,27,.15) 0);-webkit-mask:radial-gradient(circle,transparent 60px,#000 61px,#000 70px,transparent 71px);mask:radial-gradient(circle,transparent 60px,#000 61px,#000 70px,transparent 71px)}
.ex .t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:26px;font-weight:900;text-shadow:0 0 6px #f4ece0,0 0 10px #f4ece0}
.ex .t small{font-size:14px;font-weight:700}
.warn{position:absolute;left:50%;top:76%;transform:translateX(-50%);font-size:18px;color:#b8291a;font-weight:900;text-shadow:0 0 6px #f4ece0}
</style>
<div class="bg"></div>
<div class="tl paper kai">
  <div class="row"><b>气血</b><div class="bar"><i style="background:linear-gradient(#2a2d30,#15181b);transform:scaleX(.72)"></i></div><span>238 / 330</span></div>
  <div class="row"><b>真气</b><div class="bar"><i style="background:linear-gradient(#3f8fa8,#2b6f8c);transform:scaleX(.45)"></i></div><span>74 / 165</span></div>
  <div class="dash"><i></i><i style="opacity:.3"></i></div>
</div>
<div class="mini paper"><svg viewBox="0 0 170 118">
  <path d="M0 80 Q30 40 60 62 T120 50 T170 70 V118 H0Z" fill="#15181b" opacity=".18"/>
  <path d="M10 100 C40 70 70 90 100 60 S150 40 165 20" stroke="#15181b" stroke-width="2" fill="none" opacity=".5"/>
  <circle cx="74" cy="78" r="5" fill="#b8291a"/>
  <rect x="140" y="22" width="16" height="16" fill="#b8291a" rx="2"/><text x="148" y="34" font-size="11" text-anchor="middle" fill="#f4ece0" font-family="KaiTi">撤</text>
  <rect x="18" y="92" width="16" height="16" fill="none" stroke="#b8291a" stroke-dasharray="3 2" rx="2"/><text x="26" y="104" font-size="10" text-anchor="middle" fill="#b8291a" font-family="KaiTi">?</text>
  <text x="6" y="14" font-size="11" font-family="KaiTi">竹海 · 溪谷</text></svg></div>
<div class="time paper kai"><div style="font-size:15px"><b style="font-size:20px">暮</b> · 距入夜 2:14 · 妖兽 +20%</div>
  <div class="phases"><i style="background:#f1eadb"></i><i style="background:#e6cf9a"></i><i style="background:#c47a4a"></i><i style="background:#2c3550"></i></div>
  <div style="display:flex;justify-content:space-between;font-size:12px"><span>晨</span><span>午</span><span>暮</span><span>夜 · 妖潮</span></div><div class="cursor"></div></div>
<div class="tr paper"><div class="kai" style="font-size:14px">背包灵值</div><div class="v kai">1,284</div><div style="font-size:12px;margin-top:4px">储物袋 <b>21 / 24</b> · 锦囊 1 / 2</div><div style="font-size:12px;color:#c9a040">✦ 未鉴定·宝光 ×1</div></div>
<div class="feed"><div class="q2" style="--q:#2f7fa8">未鉴定的剑 · 宝光</div><div style="--q:#3fae7a">寒露草 ×3 <span class="muted">· 灵值 36</span></div><div style="--q:#6a6760">灵石 ×12</div><div style="--q:#3fae7a">感悟 +6 修为</div></div>
<div class="ex"><div class="ring"></div><div class="t kai">撤离中<small>4.6 秒 · 留在阵内</small></div></div>
<div class="warn kai">妖兽来袭 ×5</div>
<div class="bot">
  <div class="sk" style="--c:#c9a040"><small>Q</small>剑<em style="color:#2b6f8c">18</em></div>
  <div class="sk cd" style="--c:#2f7fa8"><small>E</small>冰<em style="color:#2b6f8c">26</em></div>
  <div class="sk lock"><small>R</small>锁</div><div class="sep"></div>
  <div class="sk" style="--c:#c9a040"><small>右键</small>冥</div>
  <div class="sk lock"><small>T</small>锁</div><div class="sep"></div>
  <div class="sk s"><small>1</small>春<em>2</em></div><div class="sk s"><small>2</small>气<em>3</em></div><div class="sk s"><small>3</small>符<em>1</em></div>
</div>
<div class="br paper kai"><div style="display:flex;justify-content:space-between;font-size:15px"><b>练气五层</b><span style="font-size:12px;font-family:PingFang SC">268 / 400</span></div><div class="bar" style="height:6px;margin-top:4px"><i style="background:linear-gradient(90deg,#c9a040,#e6cf9a);transform:scaleX(.67)"></i></div><div style="font-size:12px;font-family:PingFang SC;margin-top:3px" class="muted">本局感悟 +162（身陨亦保留）</div></div>`;

// ---------------- 储物袋 ----------------
const bagItems = [
  ["千年竹心", "竹", 3, 4, 360], ["未鉴定的剑", "剑", 2, 2, "?", 1], ["灵石", "灵", 0, 1, 50], ["灵石", "灵", 0, 1, 37],
  ["寒露草", "露", 1, 1, 36], ["紫藤", "藤", 1, 2, 48], ["狼妖内丹", "丹", 1, 1, 80], ["蝠翼", "翼", 0, 1, 12],
  ["赤炎果", "炎", 2, 1, 120], ["回春丹", "春", 1, 1, 30], ["狼皮", "皮", 0, 2, 24], ["凝露花", "花", 0, 1, 10],
  ["铁精石", "铁", 0, 1, 14], ["遁地符", "符", 1, 1, 40], ["功法残卷", "卷", 2, 1, 200],
];
PAGES.bag = `
<style>${ITEM_CSS}
.wrap{position:absolute;inset:60px 48px auto;display:grid;grid-template-columns:420px 1fr 300px;gap:22px;align-items:start}
.col{padding:18px}
h2{font-size:28px;margin-bottom:6px}
.sub{font-size:13px;margin-bottom:10px}
.pouch{display:grid;grid-template-columns:repeat(2,62px);grid-auto-rows:62px;gap:5px;padding:10px;border:2px dashed #b8291a;border-radius:6px;width:max-content}
.det h3{font-size:26px}
.det .q{color:#2f7fa8;font-weight:700}
.kv{display:flex;justify-content:space-between;font-size:14px;padding:5px 0;border-bottom:1px dashed rgba(21,24,27,.2)}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px}
.big{font-size:30px;font-weight:900;color:#8a6a20}
</style>
<div class="wrap">
  <div class="col paper"><h2>储物袋 <span style="font-size:16px" class="muted">灵丝储物袋</span></h2><div class="sub muted">21 / 24 格 · 物品按大小占格</div>
    <div class="grid">${bagItems.map(cell).join("")}${'<div class="slot"></div>'.repeat(3)}</div>
    <div class="foot"><span class="kai" style="font-size:16px">总灵值</span><span class="big kai">1,284</span></div></div>
  <div class="col paper"><h2>贴身锦囊</h2><div class="sub muted">身陨也不会丢失 · 只能放 1 格物品</div>
    <div class="pouch">${cell(["功法残卷", "卷", 2, 1, 200])}<div class="slot"></div></div>
    <div class="ink-line" style="margin:18px 0"></div>
    <h2 style="font-size:22px">身陨时</h2>
    <div class="kv"><span>储物袋物品</span><b style="color:#b8291a">遗落（区域二）</b></div>
    <div class="kv"><span>锦囊物品</span><b>保留</b></div>
    <div class="kv"><span>装备</span><b style="color:#b8291a">随机 1 件遗落（认主 / 本命除外）</b></div>
    <div class="kv"><span>本局感悟修为</span><b>保留</b></div>
    <div class="kv"><span>遗落储物袋</span><b>下一局取回：装备 100% · 其余 60%</b></div>
    <div class="foot"><span class="btn">整理</span><span class="btn">丢弃</span><span class="btn primary">放入锦囊</span></div></div>
  <div class="col paper det"><div style="display:flex;gap:12px;align-items:center"><div class="it q2 unk" style="width:124px;height:62px"><b style="font-size:30px">剑</b></div><div><h3>未鉴定的剑</h3><div class="q">宝光 · 二条词条</div></div></div>
    <div class="ink-line" style="margin:12px 0"></div>
    <div class="kv"><span>大小</span><b>2 格</b></div><div class="kv"><span>估计灵值</span><b>200 ~ 900</b></div><div class="kv"><span>来源</span><b>守宝精英 · 藤妖</b></div>
    <p style="font-size:14px;line-height:22px;margin-top:12px">剑身蒙着一层石青色的灵光，看不清铭文。<br>带回洞府交给玄机子鉴定，方知其真面目。</p>
    <p class="kai muted" style="margin-top:14px;font-size:15px">玄机子："这光色……老夫看着手痒。"</p></div>
</div>`;

// ---------------- 撤离结算 ----------------
const loot = [["千年竹心", "竹", 3, 360, "灵物 · 可炼化 360 修为", 1], ["未鉴定的剑", "剑", 2, "?", "宝光 · 待鉴定", 1], ["功法残卷（寒冰锥 2/3）", "卷", 2, 200, "再得 1 页可参悟", 0], ["赤炎果 ×2", "炎", 2, 240, "炼丹 · 破障丹辅药", 0], ["狼妖内丹 ×2", "丹", 1, 160, "炼化 80 修为 / 枚", 0], ["寒露草 ×6", "露", 1, 72, "", 0], ["灵石 ×87", "灵", 0, 87, "", 0], ["其他 9 件", "…", 0, 165, "", 0]];
PAGES.result = `
<style>
.bg{position:absolute;inset:0;background:url(${IMG.pavilion}) center/cover;filter:blur(2px) saturate(.6) brightness(1.05)}
.card{position:absolute;inset:34px 120px;display:grid;grid-template-columns:330px 1fr;gap:26px;padding:26px 30px}
.big{font-size:64px;font-weight:900;line-height:1;letter-spacing:6px}
.stamp{width:110px;height:110px;font-size:32px;line-height:1.1;text-align:center;transform:rotate(-8deg);margin:18px 0}
.kv{display:flex;justify-content:space-between;font-size:15px;padding:7px 0;border-bottom:1px dashed rgba(21,24,27,.2)}
.kv b{font-size:17px}
.list .r{display:grid;grid-template-columns:40px 1fr 90px;align-items:center;gap:10px;padding:6px 0;border-bottom:1px dashed rgba(21,24,27,.15)}
.list .g{width:40px;height:40px;border-radius:3px;box-shadow:inset 0 0 0 2px var(--q);display:flex;align-items:center;justify-content:center;font:900 22px "STKaiti","KaiTi";color:var(--q);background:#ece6d6}
.list .n{font-size:15px}.list .n small{display:block;font-size:12px;color:#6a6760}
.list .v{text-align:right;font-weight:700;color:#8a6a20}
.new{font-size:11px;background:#b8291a;color:#f4ece0;padding:0 4px;border-radius:2px;margin-left:6px}
.first{margin-top:12px;font-size:14px;line-height:24px}
</style>
<div class="bg"></div>
<div class="card paper">
  <div><div class="big kai">撤离成功</div><div class="muted" style="margin-top:6px">竹海 · 溪谷 · 第 5 次出行</div>
    <div class="seal stamp">满载<br>而归</div>
    <div class="kv"><span>用时</span><b>13:42（入暮后撤离）</b></div>
    <div class="kv"><span>撤离点</span><b>断涧古传送阵</b></div>
    <div class="kv"><span>斩妖</span><b>34（精英 2）</b></div>
    <div class="kv"><span>本局感悟</span><b>+204 修为</b></div>
    <div class="kv"><span>带回灵值</span><b style="color:#8a6a20;font-size:24px" class="kai">1,284</b></div>
    <div class="first"><b class="kai">首次发现</b><br>· 残阵「竹海东」已记录<br>· 天机镜着墨 +12%<br>· 药园：赤炎果成熟 ×1</div></div>
  <div><h2 style="font-size:24px">带回之物</h2><div class="ink-line" style="margin:6px 0 4px"></div>
    <div class="list">${loot.map(([n, g, q, v, d, nw]) => `<div class="r q${q}"><div class="g">${g}</div><div class="n">${n}${nw ? '<span class="new">新</span>' : ""}<small>${d}</small></div><div class="v">${v}</div></div>`).join("")}</div>
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:14px"><span class="btn">查看仓库</span><span class="btn primary">回洞府</span></div></div>
</div>`;

// ---------------- 出行准备 ----------------
PAGES.prep = `
<style>${ITEM_CSS}
.wrap{position:absolute;inset:40px 34px auto;display:grid;grid-template-columns:400px 1fr 330px;gap:18px;align-items:start}
.col{padding:16px 18px}
h2{font-size:26px}
.reg{border-radius:4px;overflow:hidden;height:160px;background:url(${IMG.overview}) 40% 30%/220% auto;margin:10px 0;box-shadow:inset 0 0 0 1px rgba(21,24,27,.3)}
.kv{display:flex;justify-content:space-between;font-size:14px;padding:5px 0;border-bottom:1px dashed rgba(21,24,27,.2)}
.risk{color:#b8291a;font-weight:700}
.tabs{display:flex;gap:6px;margin:8px 0}.tabs span{font-family:"STKaiti","KaiTi";font-size:16px;padding:3px 12px;border-radius:3px;border:1px solid rgba(21,24,27,.35)}.tabs .on{background:#15181b;color:#f1eadb}
.eq{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}
.eqs{height:84px;border-radius:4px;background:rgba(236,230,214,.9);box-shadow:inset 0 0 0 2px var(--q,#6a6760);padding:6px 8px;font-size:12px;position:relative}
.eqs b{display:block;font:900 24px "STKaiti","KaiTi";color:var(--q)}
.eqs.lock{opacity:.45;box-shadow:inset 0 0 0 1px rgba(21,24,27,.3);background:rgba(21,24,27,.05)}
.sp{display:flex;gap:8px;margin-top:8px}.sp .eqs{flex:1;height:70px}
.slots{display:flex;gap:8px;margin-top:8px}
.slots .it{width:62px;height:62px}
.go{position:absolute;right:34px;bottom:40px}
</style>
<div class="wrap">
  <div class="col paper"><h2>出行 · 选择区域</h2>
    <div class="tabs"><span>青岚山外</span><span class="on">竹海 · 溪谷</span><span style="opacity:.4">黑风岭 · 后续</span></div>
    <div class="reg"></div>
    <div class="kv"><span>推荐境界</span><b>练气 5 – 9 → 筑基</b></div>
    <div class="kv"><span>风险</span><b class="risk">高 · 储物袋与消耗品遗落；随机 1 件未认主装备遗落</b></div>
    <div class="kv"><span>天时</span><b>晨 0–5 · 午 –9 · 暮 –12 · 夜</b></div>
    <div class="kv"><span>已知撤离点</span><b>古传送阵 2 · 残阵 每局 2（1 假）</b></div>
    <div class="kv"><span>遗府</span><b>剑修遗府（未开启 · 需二段跳）</b></div>
    <div class="kv"><span>Boss</span><b>碧鳞水蟒 · 未击败</b></div>
    <div class="kv"><span>遗落储物袋</span><b style="color:#8a6a20">有 · 装备 100% · 其余 60%</b></div></div>
  <div class="col paper"><h2>备战 · 构筑</h2><div class="muted" style="font-size:13px">本命法宝、认主 / 护器符装备身陨不掉</div>
    <div class="eq"><div class="eqs q2"><span>法剑</span><b>青锋剑</b>攻击 +18 · 暴击 +5% · <span style="color:#8a6a20">认主</span></div><div class="eqs q1"><span>法衣</span><b>灵丝道袍</b>气血 +60 · 撤离读条 −10% · <span style="color:#2f7fa8">护器符</span></div><div class="eqs q1"><span>玉佩</span><b>寒玉佩</b>冷却缩减 +4% · <span style="color:#b8291a">可能遗落</span></div></div>
    <div class="ink-line" style="margin:14px 0 6px"></div><div class="kai" style="font-size:18px">法术 · 法宝 · 阵法</div>
    <div class="sp"><div class="eqs q3"><span>Q</span><b>剑气斩</b>金 · 破防</div><div class="eqs q2"><span>E</span><b>寒冰锥</b>水 · 单体爆发</div><div class="eqs lock"><span>R</span><b>锁</b>筑基解锁</div></div>
    <div class="sp"><div class="eqs q3"><span>法宝</span><b>青冥飞剑</b>本命 · 不掉</div><div class="eqs lock"><span>阵法</span><b>锁</b>练气七层</div><div class="eqs q1"><span>心法</span><b>斩敌回气</b></div></div></div>
  <div class="col paper"><h2>带出去的</h2><div class="muted" style="font-size:13px">区域二：消耗品身陨遗落（锦囊内除外）</div>
    <div class="kai" style="font-size:17px;margin-top:10px">丹药囊 3 格</div>
    <div class="slots">${cell(["回春丹 ×3", "春", 1, 1, 0])}${cell(["回气丹 ×3", "气", 1, 1, 0])}${cell(["回春丹 ×2", "春", 1, 1, 0])}</div>
    <div class="kai" style="font-size:17px;margin-top:12px">撤离符</div>
    <div class="slots">${cell(["遁地符 ×2", "符", 1, 1, 0])}</div>
    <div class="kai" style="font-size:17px;margin-top:12px">贴身锦囊（2 格）</div>
    <div class="slots"><div class="slot" style="width:62px;height:62px"></div><div class="slot" style="width:62px;height:62px"></div></div>
    <div class="kv" style="margin-top:12px"><span>储物袋</span><b>灵丝储物袋 · 24 格</b></div></div>
</div>
<div class="go"><span class="btn primary" style="font-size:26px;padding:8px 40px">启程</span></div>`;

// ---------------- 洞府总览 ----------------
const fac = [["灵泉", "二级", 300, 330, "可炼化"], ["炼丹炉", "一级", 560, 250, "材料已齐"], ["炼器鼎", "一级", 700, 420, ""], ["鉴宝台", "", 420, 470, "待鉴定 1"], ["药园", "一级", 200, 470, "可收获"], ["出行台", "", 620, 120, ""], ["仓库", "", 160, 210, ""], ["参悟蒲团", "", 470, 160, "残卷 2/3"]];
PAGES.cave = `
<style>
.ill{position:absolute;left:24px;top:24px;width:860px;height:672px;border-radius:4px;background:url(${IMG.pavilion}) center/cover;box-shadow:0 0 0 1px rgba(21,24,27,.3),0 8px 24px rgba(0,0,0,.2)}
.ill::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(236,230,214,.7))}
.f{position:absolute;transform:translate(-50%,-50%);text-align:center;z-index:2}
.f .seal{font-size:18px;padding:6px 10px;writing-mode:vertical-rl;letter-spacing:4px}
.f .lv{display:block;font-size:12px;background:rgba(236,230,214,.9);margin-top:4px;padding:0 4px;border-radius:2px}
.f .note{position:absolute;left:100%;top:0;margin-left:6px;white-space:nowrap;font-size:12px;background:#c9a040;color:#15181b;padding:1px 6px;border-radius:8px;font-weight:700}
.side{position:absolute;right:24px;top:24px;width:350px;bottom:24px;padding:18px 20px}
h2{font-size:30px}
.todo div{display:flex;align-items:center;gap:10px;font-size:15px;padding:9px 0;border-bottom:1px dashed rgba(21,24,27,.2)}
.todo i{width:10px;height:10px;border-radius:50%;background:#c9a040;flex:none}
.lvl{display:flex;justify-content:space-between;font-size:14px;padding:4px 0}
</style>
<div class="ill">${fac.map(([n, l, x, y, note]) => `<div class="f" style="left:${x}px;top:${y}px"><span class="seal">${n}</span>${l ? `<span class="lv">${l}</span>` : ""}${note ? `<span class="note">${note}</span>` : ""}</div>`).join("")}</div>
<div class="side paper"><h2>破洞府</h2><div class="muted">青岚山外 · 竹径崖下 · 灵脉 一阶</div>
  <div class="ink-line" style="margin:12px 0"></div>
  <div class="kai" style="font-size:19px">待办</div>
  <div class="todo"><div><i></i>鉴宝台：未鉴定的剑 · 宝光</div><div><i></i>灵泉：可炼化 千年竹心（+360 修为）</div><div><i></i>药园：赤炎果成熟</div><div><i></i>炼丹炉：聚气丹 材料已齐</div><div><i style="background:#b8291a"></i>修为将满：练气六层可突破</div></div>
  <div class="ink-line" style="margin:14px 0"></div>
  <div class="kai" style="font-size:19px">洞府</div>
  <div class="lvl"><span>仓库物品</span><b>142 件 · 灵值 6,820</b></div><div class="lvl"><span>灵石</span><b>1,036</b></div><div class="lvl"><span>出行次数</span><b>6（成功 5）</b></div>
  <div style="display:flex;gap:10px;margin-top:16px"><span class="btn">搬迁</span><span class="btn primary">去出行台</span></div></div>`;

// ---------------- 炼丹炉 ----------------
PAGES.alchemy = `
<style>
.wrap{position:absolute;inset:30px 40px;display:grid;grid-template-columns:300px 1fr 300px;gap:20px}
.col{padding:16px 18px}
h2{font-size:26px}
.rec{padding:9px 10px;border-radius:3px;margin:6px 0;font-size:15px;display:flex;justify-content:space-between;border:1px solid rgba(21,24,27,.15)}
.rec.ok{border-color:#3fae7a;background:rgba(63,174,122,.08)}.rec.on{background:#15181b;color:#f1eadb}.rec.no{opacity:.45}
.fur{position:relative;display:flex;flex-direction:column;align-items:center;padding-top:10px}
.gauge{position:relative;width:560px;height:46px;border-radius:23px;background:linear-gradient(90deg,#2c3550,#5a6a8a 25%,#e6cf9a 50%,#d2621e 75%,#a8241a);box-shadow:inset 0 0 0 2px #15181b}
.band{position:absolute;top:-6px;bottom:-6px;left:47%;width:15%;border:3px solid #15181b;border-radius:8px;background:rgba(244,236,224,.35)}
.needle{position:absolute;top:-12px;bottom:-12px;left:53%;width:5px;background:#15181b;border-radius:3px}
.curve{width:560px;height:150px;margin-top:20px}
.ding{width:230px;height:200px;margin-top:4px}
.res{display:flex;gap:10px;margin-top:8px}.res span{font-size:13px;padding:2px 8px;border-radius:2px;background:rgba(21,24,27,.08)}.res .on{background:#2f7fa8;color:#fff}
.mat{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed rgba(21,24,27,.2);font-size:14px}
.mat b{width:38px;height:38px;border-radius:3px;box-shadow:inset 0 0 0 2px var(--q);display:flex;align-items:center;justify-content:center;font:900 20px "STKaiti","KaiTi";color:var(--q)}
</style>
<div class="wrap">
  <div class="col paper"><h2>丹方</h2><div class="muted" style="font-size:13px">炼丹炉 一级 · 材料已齐的会高亮</div>
    <div class="rec ok on"><span>聚气丹</span><span>×2 可炼</span></div><div class="rec ok"><span>回春丹</span><span>×6</span></div><div class="rec ok"><span>回气丹</span><span>×4</span></div>
    <div class="rec no"><span>护脉丹</span><span>炉需二级</span></div><div class="rec no"><span>筑基丹</span><span>丹方未得</span></div></div>
  <div class="col paper fur"><h2>聚气丹 · 火候</h2><div class="muted" style="font-size:13px;margin:4px 0 12px">按住加火、松开降温，让炉温停在火候带内 · 剩余 9 秒</div>
    <div class="gauge"><div class="band"></div><div class="needle"></div></div>
    <svg class="curve" viewBox="0 0 560 150"><path d="M0 110 C80 105 120 60 200 70 S320 120 380 80 S500 30 560 50" stroke="#15181b" stroke-width="22" fill="none" opacity=".12"/><path d="M0 110 C80 105 120 60 200 70 S320 120 380 80 S500 30 560 50" stroke="#15181b" stroke-width="2" fill="none" stroke-dasharray="6 5"/><path d="M0 112 C70 108 130 68 200 74 S300 110 340 92" stroke="#b8291a" stroke-width="3" fill="none"/><circle cx="340" cy="92" r="6" fill="#b8291a"/><text x="4" y="146" font-size="12" fill="#6a6760">火候带随时间变化 · 红线为你的炉温</text></svg>
    <svg class="ding" viewBox="0 0 230 200"><ellipse cx="115" cy="60" rx="80" ry="16" fill="#15181b" opacity=".85"/><path d="M40 62 Q40 150 115 160 Q190 150 190 62Z" fill="#2a2d30"/><path d="M60 158 L48 196 M170 158 L182 196 M115 162 L115 198" stroke="#15181b" stroke-width="9" stroke-linecap="round"/><path d="M95 40 Q100 10 115 20 T135 4" stroke="#6a6760" stroke-width="3" fill="none" opacity=".6"/><path d="M80 120 Q115 140 150 120" stroke="#d2621e" stroke-width="6" fill="none" opacity=".8"/></svg>
    <div class="res"><span>废丹</span><span>下品</span><span>中品</span><span class="on">上品 · 带内 86%</span><span>极品</span></div></div>
  <div class="col paper"><h2>投入</h2>
    <div class="mat q1" style="--q:#3fae7a"><b>丹</b><div>主药 · 狼妖内丹 ×1<br><small class="muted">灵品 · 火候带 +5%</small></div></div>
    <div class="mat" style="--q:#6a6760"><b>草</b><div>辅药 · 青灵草 ×3</div></div>
    <div class="mat" style="--q:#3f8fa8"><b>泉</b><div>药引 · 灵泉水 ×1</div></div>
    <div class="ink-line" style="margin:14px 0"></div>
    <div style="font-size:14px;line-height:24px">一次炼制：<b>2 枚</b><br>预计效果：修为 +90 ～ +120 / 枚<br>本层已服：<b>1 / 3</b>（丹毒上限）</div>
    <div style="margin-top:16px"><span class="btn primary">开炉</span></div></div>
</div>`;

// ---------------- 境界 / 突破 ----------------
PAGES.realm = `
<style>
.left{position:absolute;left:30px;top:30px;bottom:30px;width:520px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 55%,rgba(63,143,168,.18),transparent 60%)}
.right{position:absolute;right:30px;top:30px;bottom:30px;width:660px;padding:22px 26px}
.realm{font-size:64px;font-weight:900;letter-spacing:8px;line-height:1}
.kv{display:grid;grid-template-columns:90px 1fr 90px;align-items:center;font-size:15px;padding:6px 0;border-bottom:1px dashed rgba(21,24,27,.2)}
.kv .up{color:#3fae7a;font-weight:700;text-align:right}
.unl{display:flex;gap:10px;margin-top:10px}
.unl div{flex:1;padding:10px;border-radius:4px;border:1.5px solid #c9a040;background:rgba(201,160,64,.08);font-size:13px}
.unl b{display:block;font:900 20px "STKaiti","KaiTi"}
.feed{display:flex;align-items:center;gap:12px;margin-top:14px;font-size:14px}
.slider{flex:1;height:8px;border-radius:4px;background:rgba(21,24,27,.15);position:relative}.slider i{position:absolute;left:0;top:0;bottom:0;width:62%;background:#15181b;border-radius:4px}.slider u{position:absolute;left:62%;top:-6px;width:20px;height:20px;border-radius:50%;background:#b8291a;transform:translateX(-50%)}
</style>
<div class="left"><svg viewBox="0 0 400 460" width="430"><circle cx="200" cy="230" r="190" fill="none" stroke="#15181b" stroke-width="2" opacity=".15"/><circle cx="200" cy="230" r="150" fill="none" stroke="#3f8fa8" stroke-width="10" opacity=".18" stroke-dasharray="40 20"/>
  <path d="M200 120 a28 28 0 1 1 0.1 0" fill="#15181b"/><circle cx="200" cy="96" r="9" fill="#15181b"/><path d="M196 92 C 170 120 150 150 160 190" stroke="#b8291a" stroke-width="5" fill="none"/>
  <path d="M200 175 C150 185 140 240 150 290 C120 300 90 320 95 345 C150 360 250 360 305 345 C310 320 280 300 250 290 C260 240 250 185 200 175Z" fill="#f4efe2" stroke="#15181b" stroke-width="4"/>
  <path d="M150 290 C175 300 225 300 250 290" stroke="#15181b" stroke-width="3" fill="none"/><path d="M170 250 C185 268 215 268 230 250" stroke="#15181b" stroke-width="3" fill="none"/>
  <text x="200" y="420" font-size="22" text-anchor="middle" font-family="KaiTi" fill="#3a3a36">灵泉 · 打坐炼化</text></svg></div>
<div class="right paper"><div class="muted kai" style="font-size:18px">境界</div><div class="realm kai">练气五层</div>
  <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:14px"><span>修为</span><b>268 / 400</b></div>
  <div class="bar" style="height:14px;margin-top:4px"><i style="background:linear-gradient(90deg,#c9a040,#e6cf9a);transform:scaleX(.67)"></i><i style="background:rgba(63,174,122,.55);transform:scaleX(1);left:67%;width:33%"></i></div>
  <div class="feed"><span class="kai" style="font-size:17px">投入灵石</span><div class="slider"><i></i><u></u></div><b>120</b><span class="muted">→ +360 修为</span></div>
  <div class="feed"><span class="kai" style="font-size:17px">炼化灵物</span><span>千年竹心 ×1（+360）</span><span class="btn" style="font-size:15px;padding:2px 12px">投入</span></div>
  <div class="ink-line" style="margin:16px 0 6px"></div>
  <div class="kai" style="font-size:19px">突破至练气六层</div>
  <div class="kv"><span>气血</span><span class="muted">320 → 350</span><span class="up">+30</span></div>
  <div class="kv"><span>真气</span><span class="muted">160 → 175</span><span class="up">+15</span></div>
  <div class="kv"><span>攻击 / 法力</span><span class="muted">36 → 40</span><span class="up">+4</span></div>
  <div class="kv"><span>防御</span><span class="muted">13 → 15</span><span class="up">+2</span></div>
  <div class="kai" style="font-size:17px;margin-top:12px">下一个大关</div>
  <div class="unl"><div><b>练气七层</b>法宝栏（本命）· 阵法栏 · 鹿皮乾坤袋</div><div><b>筑基</b>筑基丹 · 心魔考验 → 法术栏 3 · 御剑</div></div>
  <div style="margin-top:16px;text-align:right"><span class="btn primary" style="font-size:22px">突破</span></div></div>`;

// ---------------- 天机镜地图 ----------------
PAGES.map = `
<style>
.scroll{position:absolute;left:30px;right:30px;top:70px;height:470px;border-radius:4px;overflow:hidden;box-shadow:0 0 0 1px rgba(21,24,27,.3),0 8px 24px rgba(0,0,0,.2);background:${PAPER},#ece6d6}
.rodl,.rodr{position:absolute;top:60px;width:16px;height:490px;background:linear-gradient(90deg,#3a2a1c,#7a5a3a,#3a2a1c);border-radius:8px}
.rodl{left:18px}.rodr{right:18px}
.head{position:absolute;left:40px;top:18px;display:flex;align-items:baseline;gap:16px}
.head h2{font-size:34px}
svg.m{position:absolute;inset:0;width:100%;height:100%}
.leg{position:absolute;left:40px;right:40px;bottom:22px;display:flex;gap:22px;align-items:center;font-size:14px}
.leg span{display:flex;align-items:center;gap:6px}
.mk{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:3px;font:900 13px "STKaiti","KaiTi"}
</style>
<div class="head"><h2 class="kai">天机镜 · 万象山河图</h2><span class="muted">已着墨 58% · 第 5 次出行后 · 洞府已迁至溪谷</span></div>
<div class="rodl"></div><div class="rodr"></div>
<div class="scroll"><svg class="m" viewBox="0 0 1220 470" preserveAspectRatio="none">
  <defs><linearGradient id="fadeR" x1="0" x2="1"><stop offset="0" stop-color="#ece6d6" stop-opacity="0"/><stop offset="1" stop-color="#ece6d6"/></linearGradient>
  <filter id="ink"><feTurbulence baseFrequency=".02" numOctaves="3"/><feDisplacementMap in="SourceGraphic" scale="14"/></filter></defs>
  <g filter="url(#ink)">
    <path d="M0 330 Q60 240 120 280 T240 230 T360 270 T470 210 L470 470 H0Z" fill="#15181b" opacity=".32"/>
    <path d="M0 380 Q90 330 180 360 T380 330 T470 350 L470 470 H0Z" fill="#15181b" opacity=".5"/>
    <path d="M440 300 Q520 170 600 240 T760 190 T860 240 L860 470 H440Z" fill="#2f5e46" opacity=".45"/>
    <path d="M440 380 Q560 320 660 360 T860 330 L860 470 H440Z" fill="#15181b" opacity=".35"/>
    <path d="M620 470 C640 400 610 330 660 260" stroke="#3f8fa8" stroke-width="10" fill="none" opacity=".6"/>
    <path d="M840 330 Q900 230 980 280 T1100 220 L1100 470 H840Z" fill="#15181b" opacity=".18"/>
  </g>
  <rect x="820" y="0" width="400" height="470" fill="url(#fadeR)"/>
  <text x="160" y="190" font-size="30" font-family="KaiTi" fill="#15181b">青岚山外</text><text x="168" y="215" font-size="14" fill="#5a5a55">练气 1–4 · 风险低</text>
  <text x="560" y="150" font-size="30" font-family="KaiTi" fill="#15181b">竹海 · 溪谷</text><text x="568" y="175" font-size="14" fill="#5a5a55">练气 5–9 · 风险高</text>
  <text x="930" y="170" font-size="30" font-family="KaiTi" fill="#15181b" opacity=".35">黑风岭</text><text x="934" y="195" font-size="14" fill="#5a5a55" opacity=".5">下一章 · 后续</text>
  <text x="1100" y="90" font-size="20" font-family="KaiTi" fill="#5a5a55" opacity=".4">留白之境 →</text>
  ${[[90, 300, "撤", 1], [330, 250, "撤", 1], [560, 300, "撤", 1], [720, 260, "撤", 1], [430, 330, "?", 0], [770, 340, "?", 0]].map(([x, y, t, s]) => s ? `<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="3" fill="#b8291a"/><text x="${x}" y="${y + 6}" font-size="16" text-anchor="middle" fill="#f4ece0" font-family="KaiTi">${t}</text>` : `<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="3" fill="none" stroke="#b8291a" stroke-width="2" stroke-dasharray="4 3"/><text x="${x}" y="${y + 6}" font-size="16" text-anchor="middle" fill="#b8291a" font-family="KaiTi">${t}</text>`).join("")}
  <circle cx="250" cy="330" r="12" fill="none" stroke="#15181b" stroke-dasharray="3 3" opacity=".5"/><text x="250" y="355" font-size="11" text-anchor="middle" fill="#5a5a55">旧府</text><circle cx="830" cy="250" r="16" fill="#15181b"/><text x="830" y="256" font-size="16" text-anchor="middle" fill="#ece6d6" font-family="KaiTi">府</text>
  <circle cx="380" cy="300" r="15" fill="none" stroke="#15181b" stroke-width="3"/><text x="380" y="305" font-size="14" text-anchor="middle" font-family="KaiTi">遗</text>
  <circle cx="660" cy="250" r="15" fill="none" stroke="#15181b" stroke-width="3"/><text x="660" y="255" font-size="14" text-anchor="middle" font-family="KaiTi">遗</text>
  <path d="M190 260 l12 -20 l12 20 z" fill="#15181b"/><text x="202" y="280" font-size="12" text-anchor="middle">青牙 · 已斩</text>
  <path d="M640 330 l12 -20 l12 20 z" fill="#b8291a"/><text x="652" y="350" font-size="12" text-anchor="middle" fill="#b8291a">碧鳞水蟒</text>
  <circle cx="520" cy="215" r="34" fill="#c9a040" opacity=".18"/><text x="520" y="219" font-size="12" text-anchor="middle" fill="#8a6a20">灵光？</text>
  <g transform="translate(700 380)"><rect x="-12" y="-10" width="24" height="20" rx="4" fill="#8a6a20"/><text x="0" y="28" font-size="12" text-anchor="middle" fill="#8a6a20">遗落储物袋</text></g>
</svg></div>
<div class="leg"><span><i class="mk seal">撤</i>古传送阵（常驻）</span><span><i class="mk" style="border:2px dashed #b8291a;color:#b8291a">?</i>残阵（未明 · 每局随机）</span><span><i class="mk" style="background:#15181b;color:#ece6d6;border-radius:50%">府</i>洞府</span><span><i class="mk" style="border:2px solid #15181b;border-radius:50%">遗</i>遗府</span><span><i class="mk" style="color:#b8291a">▲</i>Boss</span><span><i class="mk" style="background:rgba(201,160,64,.3);border-radius:50%"></i>灵光点（大致范围）</span><span class="muted">留白处尚未探索</span></div>`;

const only = process.argv.slice(2);
for (const [name, body] of Object.entries(PAGES)) {
  if (only.length && !only.includes(name)) continue;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>墨途 UI · ${name}</title><style>${BASE}</style></head><body>${body}</body></html>`;
  const f = path.join(OUT, name + ".html");
  fs.writeFileSync(f, html);
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(pathToFileURL(f).href);
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(PNG, name + ".png") });
  await p.close();
  console.log("ok", name, (fs.statSync(f).size / 1024).toFixed(0) + "KB");
}
await browser.close();
