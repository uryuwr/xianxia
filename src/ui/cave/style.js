// 洞府界面样式（模块 C）。外观来自 UI 设计师的水墨套件（docs/UI风格指南_v1.md）：
//   用流程模块拷进 src/ui/ink/ 的套件（ink-ui.css / strokes.css / fonts.css / 立绘 svg）。
// 性能：滤镜画的纸纹、墨晕、立绘在洞府挂载时预烘成位图（bake.js）；全屏进场只动 opacity / transform，不对整屏做 filter。
// 这里只补洞府专用的布局（对照 docs/ui/v2/png 的 cave / alchemy / realm / bag 示意图）与演出。原则：不画方框。
const KIT = import.meta.glob(["../ink/ink-ui.css", "../ink/strokes.css", "../ink/fonts.css"]);
const KIT_JS = import.meta.glob("../ink/ink-ui.js");

import { bakeInkTextures, bakeArt } from "./bake.js";
const SVG = import.meta.glob("../ink/*.svg", { query: "?url", import: "default", eager: !0 });
const svg = (n) => SVG["../ink/" + n] || "";
// 立绘 / 插画地址：先是 svg，预烘焙完成后换成同尺寸 PNG
const PNG = import.meta.glob("./art/*.png", { query: "?url", import: "default", eager: !0 });
const png = (n) => PNG["./art/" + n];
// 立绘 / 插画：用离线栅格好的 PNG（tools/cave_art.mjs），没有时退回套件的 svg
export const ART = { portrait: png("portrait_linmo.png") || svg("portrait_linmo.svg"), bust: png("portrait_linmo_bust.png") || svg("portrait_linmo_bust.svg"), danlu: png("art_danlu.png") || svg("art_danlu.svg") };

const CSS = `
.cv-root { position: fixed; inset: 0; z-index: 32; pointer-events: none; font-family: var(--f-kai); color: var(--ink); --k: 1; }
.cv-root.hidden { display: none; }
.cv-root * { box-sizing: border-box; }
/* 1280×720 设计稿，按屏幕等比缩放 */
.cv-box { position: absolute; left: 50%; top: 50%; width: 1280px; height: 720px; transform: translate(-50%, -50%) scale(var(--k)); pointer-events: none; }
.cv-box > * { pointer-events: auto; }
.cv-box .cv-pass { pointer-events: none; }
.abs { position: absolute; }

/* ================= 洞府画面上的界面（cave.png） ================= */
.cv-side { left: 46px; top: 40px; display: flex; gap: 14px; pointer-events: none; }
.cv-side .t { writing-mode: vertical-rl; font-size: 66px; color: var(--ink); text-shadow: 0 0 18px rgba(236,230,214,.95), 0 0 6px rgba(236,230,214,.9); }
.cv-side .ink-tiba { margin-top: 12px; text-shadow: 0 0 6px var(--paper-hi); }
.cv-side .ink-seal { display: inline-flex; margin-top: 10px; }
.cv-res { left: 46px; top: 392px; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
.cv-res .c { display: flex; align-items: center; gap: 10px; }
.cv-res .c .n { font-family: var(--f-display); font-size: 24px; color: var(--ink); line-height: 1; text-shadow: 0 0 8px var(--paper-hi), 0 0 3px var(--paper-hi); }
.cv-res .c .n small { font-family: var(--f-ui); font-size: 11px; color: var(--ink-zhong); margin-left: 4px; }
.cv-today { left: 250px; top: 560px; width: 560px; padding: 16px 26px 16px; }
.cv-today .ink-h { font-size: 18px; margin-bottom: 2px; display: flex; justify-content: space-between; }
.cv-today .ink-h small { font-family: var(--f-ui); font-size: 11px; color: var(--ink-dan); letter-spacing: 0; }
.cv-today .cols { display: grid; grid-template-columns: 1fr 1fr; column-gap: 30px; }
.cv-today .ink-row { font-size: 14px; padding: 5px 2px; cursor: pointer; }
.cv-today .ink-row .v { font-family: var(--f-kai); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 190px; }
.cv-today .ink-row:hover .k, .cv-today .ink-row.hot .k { color: var(--zhu); }
.cv-today .ink-row.hot::after { content: ""; position: absolute; left: -12px; top: 50%; width: 7px; height: 7px; margin-top: -3px; border-radius: 50%; background: var(--zhu); }
.cv-today .none { font-size: 14px; color: var(--ink-dan); padding: 6px 2px; }
.cv-go { right: 58px; bottom: 40px; display: flex; align-items: center; gap: 22px; }
.cv-go .ink-btn { text-shadow: 0 0 8px var(--paper-hi); }
.cv-hint { left: 640px; bottom: 182px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 9px 34px 11px 26px; color: var(--paper-hi); white-space: nowrap;
  font-family: var(--f-display); font-size: 19px; letter-spacing: .12em; pointer-events: none; transition: opacity .2s; isolation: isolate; }
.cv-hint::before { content: ""; position: absolute; inset: 0 -10px 0 -6px; z-index: -1; background: var(--ink-nong); -webkit-mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; }
.cv-hint b { font-family: var(--f-ui); font-size: 12px; background: var(--paper-hi); color: var(--ink); border-radius: 3px; padding: 0 6px; }
.cv-hint small { font-family: var(--f-kai); font-size: 14px; opacity: .75; letter-spacing: .04em; }
.cv-hint.off { opacity: 0; }

/* 设施挂签：钉在 3D 画面里的竖排纸签（.ink-paper.slip.ink-tag），旁注一行可办 */
.cv-tags { position: absolute; inset: 0; pointer-events: none; }
.cv-tag { position: absolute; left: 0; top: 0; pointer-events: none; cursor: pointer; opacity: 0; transition: opacity .25s ease; }
.cv-tag.show { opacity: 1; pointer-events: auto; }
.cv-tag .ink-paper { padding: 14px 9px 12px; transition: transform .2s var(--ease-ink); }
.cv-tag:hover .ink-paper, .cv-tag.near .ink-paper { transform: translateY(-2px); }
.cv-tag.near .ink-paper > .ink-sheet::before, .cv-tag:hover .ink-paper > .ink-sheet::before { background: var(--ink-tex-paper), #fbf6e8; }
.cv-tag .ink-tag > s { animation: ink-breathe 2.4s ease-in-out infinite; }
.cv-tag .hint { position: absolute; left: 100%; top: 36px; margin-left: 4px; font-family: var(--f-ui); font-size: 11px; color: var(--ink-nong); white-space: nowrap; padding: 4px 14px;
  background: radial-gradient(ellipse at center, rgba(245,240,227,.96) 50%, rgba(245,240,227,0) 74%); }
.cv-tag .hint b { color: var(--zhu); font-weight: 700; }
.cv-tag .key { position: absolute; left: 50%; bottom: -24px; transform: translateX(-50%); font-family: var(--f-ui); font-size: 11px; font-weight: 700; color: var(--paper-hi); background: var(--ink-nong); border-radius: 3px; padding: 0 6px; opacity: 0; transition: opacity .2s; }
.cv-tag.near .key { opacity: 1; }
.cv-flash { animation: cv-flash .5s ease-in-out 2; }
@keyframes cv-flash { 0%, 100% { transform: none; filter: none; } 50% { transform: scale(1.1); filter: drop-shadow(0 0 6px rgba(184,41,26,.7)); } }

/* ================= 全屏设施页（场景退成一层薄宣纸） ================= */
.cv-page { position: absolute; inset: 0; pointer-events: auto; animation: cv-fade .22s ease-out both; will-change: opacity; contain: layout style; }
.cv-page > .cv-box { animation: cv-rise .3s var(--ease-ink) both; }
@keyframes cv-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cv-rise { from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)) scale(var(--k)); } to { opacity: 1; transform: translate(-50%, -50%) scale(var(--k)); } }
@keyframes cv-in-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.cv-page.keep, .cv-page.keep > .cv-box { animation: none; }
.cv-page::before { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 75% at 50% 50%, rgba(236,230,214,.86), rgba(236,230,214,.96)); }
.cv-page::after { content: ""; position: absolute; inset: 0; background: var(--ink-tex-paper), var(--ink-tex-fiber); opacity: .55; pointer-events: none; }
.cv-page .cv-box { z-index: 1; }
.pg-head { left: 54px; top: 30px; display: flex; align-items: center; gap: 16px; }
.pg-head .ink-title { font-size: 40px; }
.pg-head .ink-tabs { margin-left: 26px; }
.pg-head .ink-tab { cursor: pointer; }
.pg-go { right: 66px; bottom: 44px; display: flex; align-items: center; gap: 22px; }
.pg-note { font-family: var(--f-ui); font-size: 12px; color: var(--ink-dan); line-height: 1.6; }
.cv-ok { color: var(--shilv); } .cv-bad { color: var(--zhu); } .cv-gold { color: #7c5d1a; }
.cv-busy { pointer-events: none; }
.cv-busy .ink-seal-btn, .cv-busy .ink-btn { opacity: .55; }
.ink-seal-btn.is-disabled { pointer-events: none; }
.ink-seal-btn small { font-family: var(--f-ui); font-size: 11px; writing-mode: horizontal-tb; }
.cv-up { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 14px; }
.cv-up .cost span { margin-right: 10px; }
.cv-up .cost b { font-family: var(--f-ui); font-size: 11px; font-weight: 700; margin-left: 2px; }

/* ---- 灵泉·静室：册页两开（realm.png） ---- */
.album { left: 46px; top: 34px; width: 1188px; height: 652px; padding: 16px; }
.album .ink-mount-in { display: flex; height: 100%; }
.album .fold { position: absolute; left: 50%; top: 16px; bottom: 16px; width: 18px; margin-left: -9px; background: linear-gradient(90deg, transparent, rgba(90,70,40,.16) 45%, rgba(255,255,255,.35) 55%, transparent); z-index: 2; }
.album .page { position: relative; flex: 1; }
.album .qi { position: absolute; left: 90px; top: 40px; width: 400px; height: 400px; background: var(--shiqing); opacity: .2; -webkit-mask: var(--ink-wash-round) center / 100% 100% no-repeat; mask: var(--ink-wash-round) center / 100% 100% no-repeat; transition: opacity .6s; }
.album .enso { position: absolute; left: 120px; top: 64px; width: 340px; height: 340px; background: var(--shiqing); opacity: .55; -webkit-mask: var(--ink-enso-3) center / 100% 100% no-repeat; mask: var(--ink-enso-3) center / 100% 100% no-repeat; }
.album .fig { position: absolute; left: 186px; top: 46px; width: 300px; height: 500px; background: 0 0 / 100% 100% no-repeat; }
.album.medit .enso { animation: cv-spin 2.4s linear infinite; opacity: .85; }
.album.medit .qi { opacity: .5; animation: cv-breath 1.2s ease-in-out infinite; }
.lp-title { position: absolute; left: 36px; top: 36px; display: flex; gap: 12px; }
.lp-title .t { writing-mode: vertical-rl; font-size: 58px; color: var(--ink); }
.lp-title .ink-tiba { margin-top: 10px; }
.lp-foot { position: absolute; left: 40px; right: 40px; bottom: 30px; }
.lp-foot .r { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--f-display); font-size: 18px; letter-spacing: .1em; }
.lp-foot .r small { font-family: var(--f-ui); font-size: 12px; color: var(--ink-zhong); letter-spacing: 0; }
.lp-foot .ink-bar { margin-top: 6px; }
.lp-foot .ink-note { margin-top: 6px; }
.lp-mirror { position: absolute; left: 40px; bottom: 150px; }
.ladder { position: absolute; right: 36px; top: 30px; display: flex; flex-direction: row-reverse; gap: 2px; }
.ladder .lv { writing-mode: vertical-rl; font-family: var(--f-display); font-size: 25px; letter-spacing: .3em; color: var(--ink-dan); padding: 12px 8px; position: relative; }
.ladder .lv.done { color: var(--ink-zhong); }
.ladder .lv.now { color: var(--ink); font-size: 32px; }
.ladder .lv.now::after { content: ""; position: absolute; left: -3px; right: -3px; bottom: -14px; height: 10px; background: var(--zhu); -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; }
.ladder .lv.big { font-size: 34px; color: var(--ink-qing); border-right: 1px dashed var(--ink-qing); margin-right: 8px; }
.ladder .lv.big.now { color: var(--ink); }
.ladder-note { position: absolute; left: 44px; top: 40px; writing-mode: vertical-rl; letter-spacing: .2em; line-height: 2; max-height: 190px; }
.rp { position: absolute; left: 40px; right: 40px; top: 200px; display: grid; grid-template-columns: 1fr 1fr; column-gap: 34px; }
.rp .ink-h { font-size: 18px; margin-bottom: 4px; }
.rp .ink-row { font-size: 14px; padding: 3px 2px; }
.rp .ink-row .v.kai.ul { font-size: 12px; line-height: 1.4; max-width: 190px; }
.rp .ink-row .v { font-size: 17px; }
.rp .ink-row .v .up { font-family: var(--f-ui); font-size: 12px; color: var(--shilv); margin-left: 6px; }
.rp .ink-row .v.miss { color: var(--zhu); font-family: var(--f-kai); font-size: 14px; }
.rp .ink-row .v.kai { font-family: var(--f-kai); font-size: 14px; }
.refine { position: absolute; left: 40px; right: 40px; top: 376px; }
.refine .ink-h { font-size: 18px; display: flex; align-items: baseline; gap: 12px; }
.refine .ink-h small { font-family: var(--f-ui); font-size: 11px; color: var(--ink-dan); letter-spacing: 0; }
.refine .sl { display: flex; align-items: center; gap: 12px; margin: 4px 0 2px; }
.refine .sl .ink-num { min-width: 7.5em; text-align: right; font-size: 16px; }
.refine .chipw { position: relative; margin: 0 -6px; }
.refine .chips { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; padding: 4px 20px 4px; scrollbar-width: none; scroll-snap-type: x proximity;
  -webkit-mask: linear-gradient(90deg, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%); mask: linear-gradient(90deg, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%); }
.refine .chips::-webkit-scrollbar { display: none; }
.refine .chip { scroll-snap-align: start; }
.refine .ar { position: absolute; top: 14px; z-index: 2; width: 22px; height: 40px; border: 0; padding: 0; cursor: pointer; font: 400 26px/40px var(--f-display); color: var(--ink-nong);
  background: radial-gradient(ellipse, rgba(245,240,227,.95) 45%, rgba(245,240,227,0) 72%); opacity: 0; pointer-events: none; transition: opacity .2s; }
.refine .ar.on { opacity: 1; pointer-events: auto; }
.refine .ar:hover { color: var(--zhu); }
.refine .ar.l { left: -6px; } .refine .ar.r { right: -6px; }
.refine .chip { display: flex; flex-direction: column; align-items: center; cursor: pointer; flex: none; width: 58px; }
.refine .chip .ink-slot { --z: 46px; font-size: 20px; }
.refine .chip small { font-family: var(--f-ui); font-size: 10px; color: var(--ink-zhong); white-space: nowrap; margin-top: 2px; }
.refine .chip small b { color: #7c5d1a; }
.refine .chip.cmp { width: 92px; }
.refine .chip.cmp small { display: flex; align-items: center; gap: 2px; line-height: 1.35; }
.refine .chip.cmp small.nm { font-family: var(--f-kai); font-size: 12px; color: var(--ink-nong); }
.cv-yi { --s: 15px; font-size: 10px; margin-right: 2px; }
.cv-st { --s: 18px; font-size: 10px; margin: 0 2px; vertical-align: -3px; }
.cv-q { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; font-family: var(--f-ui); font-size: 10px; color: var(--ink-zhong); box-shadow: inset 0 0 0 1px var(--ink-dan); cursor: help; position: relative; vertical-align: 1px; }
.cv-q:hover::after { content: attr(data-tip); position: absolute; left: 20px; top: -6px; width: 210px; padding: 8px 12px; font-family: var(--f-kai); font-size: 13px; line-height: 1.6; color: var(--ink-nong); background: #f7f2e6; box-shadow: 0 3px 10px rgba(40,32,20,.25); border-radius: 2px 8px 3px 9px; z-index: 5; white-space: normal; }
.cv-hl-note { margin-top: 8px; line-height: 1.6; }
/* 灵气充盈：预览、当前增益、演出 */
.refine .buffpv { font-family: var(--f-kai); font-size: 12.5px; color: var(--ink-nong); margin: 0 0 2px; height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.refine .buffpv b { color: var(--shiqing); font-weight: 400; font-family: var(--f-display); }
.lp-buff { position: absolute; left: 40px; right: 40px; bottom: 196px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-nong); }
.lp-buff b { color: var(--shiqing); font-weight: 400; font-family: var(--f-display); font-size: 16px; }
.lp-buff small { display: block; font-family: var(--f-ui); font-size: 11px; color: var(--ink-dan); }
.lp-foot .lb { margin-top: 2px; font-family: var(--f-kai); font-size: 13px; color: var(--shilv); }
.cv-buff-fx { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 16; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 6px; animation: cv-buff 1.9s var(--ease-ink) forwards; }
.cv-buff-fx .ring { position: absolute; left: 50%; top: 50%; width: 360px; height: 360px; margin: -180px; background: var(--shiqing); opacity: .45; -webkit-mask: var(--ink-enso-full) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-full) 0 0 / 100% 100% no-repeat; animation: cv-buff-ring 1.9s var(--ease-ink) forwards; }
.cv-buff-fx .t { font-size: 64px; color: #245f7f; text-shadow: 0 0 14px var(--paper-hi), 0 0 6px var(--paper-hi); }
.cv-buff-fx .e { font-family: var(--f-kai); font-size: 17px; color: var(--ink-nong); text-shadow: 0 0 8px var(--paper-hi), 0 0 4px var(--paper-hi); }
@keyframes cv-buff { 0% { opacity: 0; transform: translate(-50%, -46%) scale(.94); } 15% { opacity: 1; transform: translate(-50%, -50%); } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -56%); } }
@keyframes cv-buff-ring { 0% { transform: scale(.4) rotate(-40deg); opacity: 0; } 25% { opacity: .5; } 100% { transform: scale(1.25) rotate(20deg); opacity: 0; } }
.gd-harvest { right: 66px; bottom: 40px; display: flex; align-items: center; gap: 18px; z-index: 6; }
.cv-float { position: absolute; transform: translate(-50%, -100%); font-family: var(--f-display); font-size: 26px; letter-spacing: .06em; white-space: nowrap; pointer-events: none;
  text-shadow: 0 0 2px var(--paper-hi), 0 0 6px var(--paper-hi), 0 0 12px var(--paper-hi), 0 0 12px var(--paper-hi); filter: saturate(1.3) brightness(.85); animation: cv-float 1.4s var(--ease-ink) forwards; z-index: 6; }
@keyframes cv-float { 0% { opacity: 0; transform: translate(-50%, -80%); } 15% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -260%); } }
/* 物品格里的图集图标 */
.cv-root .ink-slot > .mk-ico { --ih: 72%; }
.cv-toasts .ink-toast.has-act { pointer-events: auto; }
.cv-toast-act { color: var(--paper-hi) !important; font-size: 16px !important; padding: 2px 10px 6px !important; margin-left: 10px; }
.cv-toast-act::after { background: rgba(245,240,227,.6) !important; }
.cv-toast-ico { position: relative; display: inline-block; width: 30px; height: 30px; margin-right: 4px; vertical-align: middle; }
.cv-toast-ico .mk-ico { --ih: 100%; }
.cv-enso-empty, .cv-skill-ico { position: relative; display: inline-block; width: 30px; height: 30px; }
.cv-enso-empty { background: rgba(245,240,227,.7); -webkit-mask: var(--ink-enso-2) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-2) 0 0 / 100% 100% no-repeat; }
.cv-skill-ico .mk-ico { --ih: 100%; }
/* ---- 仓库 · 博古架（docs/ui/v2/储物袋_v2_落地说明_局外.md §2） ---- */
.bg-plaque { left: 40px; top: 26px; width: 600px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.bg-plaque .board { position: relative; isolation: isolate; padding: 4px 30px 8px 28px; font: 38px/1.1 var(--f-splash); color: var(--paper-hi); letter-spacing: .1em; }
.bg-plaque .board::before { content: ""; position: absolute; inset: 0 -6px; z-index: -1; background: #4a3220; -webkit-mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; }
.bg-plaque .worth .lbl { font-family: var(--f-kai); font-size: 13px; color: var(--ink-zhong); letter-spacing: .3em; }
.bg-plaque .worth .n { font-family: var(--f-display); font-size: 34px; line-height: 1; color: #7c5d1a; }
.bg-plaque .ink-tabs { flex-basis: 100%; margin-top: 2px; }
.bg-plaque .ink-tab { cursor: pointer; }
.bg-shelf { left: 56px; top: 140px; width: 530px; height: 520px; }
.bg-shelf::before { content: ""; position: absolute; inset: 4px 4px 60px; background: rgba(154,106,50,.13); -webkit-mask: var(--ink-wash-1) 0 0 / 100% 100% no-repeat; mask: var(--ink-wash-1) 0 0 / 100% 100% no-repeat; pointer-events: none; }
.bg-scroll { position: absolute; left: 0; top: 0; width: 530px; height: 440px; overflow-y: auto; overflow-x: hidden; padding: 18px 0 18px 18px; scrollbar-width: thin; scrollbar-color: rgba(92,60,30,.5) transparent; }
.bg-grid { position: relative; }
.bg-grid.tidy .bg-tok { animation: cv-fade .25s ease both; }
.bg-grid .niche { position: absolute; background: linear-gradient(rgba(60,38,18,.22), rgba(60,38,18,.07) 30%, rgba(154,106,50,.05) 70%), rgba(245,240,227,.35); }
.bg-grid .niche::after { content: ""; position: absolute; left: 12%; right: 12%; bottom: 2px; height: 22%; max-height: 16px; border-radius: 50%; background: radial-gradient(closest-side, rgba(21,24,27,.2), transparent); }
.bg-grid .niche.sel { background: linear-gradient(rgba(60,38,18,.2), rgba(60,38,18,.06) 30%, rgba(184,41,26,.07) 70%), rgba(250,246,236,.6); }
.bg-grid .bd { position: absolute; background: var(--wc, rgba(92,60,30,.86)); pointer-events: none; }
.bg-grid .bd.h { height: 9px; -webkit-mask: var(--ink-stroke-bar) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-bar) 0 0 / 100% 100% no-repeat; }
.bg-grid .bd.v { width: 8px; -webkit-mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; }
.bg-grid .bd.frame { --wc: rgba(52,34,18,.92); }
.bg-grid .bd.h.frame { height: 15px; }
.bg-grid .bd.v.frame { width: 13px; }
.bg-grid .bg-tok { position: absolute; cursor: pointer; }
.bg-grid .bg-tok.drop-before::before { content: ""; position: absolute; left: -7px; top: 6%; bottom: 6%; width: 4px; z-index: 3; background: var(--zhu); -webkit-mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; }
.bg-grid .bg-empty { position: absolute; left: 40%; top: 40%; }
.bg-cap { position: absolute; left: 0; right: 0; bottom: 8px; display: flex; justify-content: space-between; align-items: baseline; font-family: var(--f-ui); font-size: 12px; color: var(--ink-zhong); }
/* 身上：立绘在上、四个装备位在下，紧挨多宝阁；详情卡常驻在立绘右侧，撑满右栏 */
.cv-root .equip { left: 612px; top: 96px; width: 240px; display: flex; flex-direction: column; align-items: center; }
.cv-root .equip .bust { position: relative; left: auto; top: auto; width: 230px; height: 278px; opacity: .92; margin-bottom: 4px; }
.cv-root .equip .ink-h { align-self: flex-start; margin-left: 18px; }
.cv-root .equip .slots { width: 220px; gap: 24px 10px; }
.cv-root .st-detail { left: 872px; top: 64px; width: 360px; min-height: 560px; }
.cv-root .st-detail .empty { margin-top: 40px; text-align: center; }
.cv-loading { position: absolute; inset: 0; z-index: 40; pointer-events: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: var(--ink-tex-paper), var(--paper); transition: opacity .3s ease; }
.cv-loading .ink-splash { font-size: 72px; color: var(--ink-nong); }
.cv-loading.out { opacity: 0; pointer-events: none; }
.ink-btn.is-disabled[data-act=hualing-key] { pointer-events: auto; cursor: not-allowed; }
.cv-acts { display: flex; align-items: center; gap: 12px; }
.cv-guide { left: 50%; bottom: 22px; transform: translateX(-50%); width: 640px; z-index: 6; align-items: flex-end; }
.cv-guide .ink-tip { max-width: 560px; font-size: 15px; }
.cv-guide .ink-tip .line { line-height: 1.85; }
.cv-guide .cv-acts { justify-content: flex-end; margin-top: 2px; }
.cv-guide .who { color: var(--ink-nong); }
.cv-range { flex: 1; -webkit-appearance: none; appearance: none; height: 18px; background: transparent; cursor: pointer; }
.cv-range::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: linear-gradient(90deg, var(--nijin) var(--p, 0%), var(--ink-qing) var(--p, 0%)); }
.cv-range::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px; border-radius: 50%; background: var(--ink-jiao); box-shadow: 0 0 0 3px var(--paper-hi); }
.album .go { position: absolute; right: 40px; bottom: 24px; display: flex; align-items: center; gap: 18px; }
.album .go .ink-tip { max-width: 230px; font-size: 13px; }
.album .go .ink-seal-btn { --s: 84px; }
.album .esc { position: absolute; right: 26px; top: 22px; }
.album .upw { position: absolute; left: 40px; bottom: 22px; width: 300px; }
.album .upw .cv-up { row-gap: 2px; }
.album .upw .cv-up { font-size: 13px; }
.album .upw .ink-label { font-size: 13px; }

/* ---- 丹器房（alchemy.png） ---- */
.ws-left { left: 40px; top: 104px; }
.ws-left .ink-slips { justify-content: flex-start; }
.ws-left .ink-slip { height: 300px; cursor: pointer; }
.ws-left .ink-slip small { display: inline; }
.ws-left .ink-vtabs { position: absolute; left: -2px; top: 10px; }
.ws-left .ink-vtab { cursor: pointer; }
.ws-left.vt { left: 30px; }
.ws-left.vt .ink-slips { margin-left: 48px; }
.ws-left .note { margin-top: 14px; width: 360px; }
.stove { left: 452px; top: 92px; width: 380px; height: 420px; }
.stove .art { position: absolute; inset: 0; background: 0 0 / 100% 100% no-repeat; }
.stove .glow { position: absolute; left: 110px; top: 300px; width: 160px; height: 90px; border-radius: 50%; background: radial-gradient(ellipse, rgba(232,110,50,.75), rgba(210,60,30,.3) 45%, transparent 70%); opacity: .35; transition: opacity .1s; }
.stove .steam { position: absolute; left: 150px; top: 40px; width: 80px; height: 90px; opacity: 0; background: radial-gradient(ellipse at 50% 80%, rgba(120,120,115,.35), transparent 65%); animation: cv-steam 2.2s ease-out infinite; }
.stove.lit .steam { opacity: 1; }
@keyframes cv-steam { 0% { transform: translateY(20px) scale(.6); opacity: 0; } 30% { opacity: .9; } 100% { transform: translateY(-40px) scale(1.4); opacity: 0; } }
.stove .seal { position: absolute; left: 173px; top: 252px; }
.stove .res { position: absolute; left: 50%; top: 210px; transform: translateX(-50%); }
.stove .big { position: absolute; inset: 40px 30px 60px; display: flex; align-items: center; justify-content: center; font-size: 210px; color: var(--ink-nong); }
.stove .big.broken { color: var(--ink-qing); }
.stove .big .ring { position: absolute; inset: 10px; background: var(--ink-zhong); opacity: .5; -webkit-mask: var(--ink-enso-full) center / 100% 100% no-repeat; mask: var(--ink-enso-full) center / 100% 100% no-repeat; }
.mat { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.mat .ink-label { font-size: 13px; letter-spacing: .3em; }
.mat .ink-note { font-size: 11px; }
.mat .ok { color: var(--shilv); } .mat .no { color: var(--zhu); }
.fire { left: 470px; top: 548px; width: 344px; }
.fire .r { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--f-display); font-size: 17px; letter-spacing: .1em; margin-bottom: 6px; }
.fire .r small { font-family: var(--f-ui); font-size: 11px; color: var(--ink-dan); letter-spacing: 0; }
.fire .track { position: relative; }
.fire .ink-bar { --bc: linear-gradient(90deg, #d9b45e, #b8291a); }
.fire .zone { position: absolute; top: -6px; bottom: -6px; left: 58%; width: 15%; background: var(--zhu-wash); border-radius: 40% 50% 45% 50%; transition: background .15s; }
.fire .zone.in { background: rgba(184, 41, 26, .28); }
.fire .zone::before, .fire .zone::after { content: ""; position: absolute; top: 2px; bottom: 2px; width: 2px; background: var(--zhu); opacity: .5; }
.fire .zone::before { left: 0; } .fire .zone::after { right: 0; }
.fire .needle { position: absolute; top: -12px; left: 64%; width: 12px; height: 40px; margin-left: -6px; }
.fire .needle::before { content: ""; position: absolute; left: 5px; top: 8px; width: 2px; height: 28px; background: var(--ink); }
.fire .needle::after { content: ""; position: absolute; left: 0; top: 0; width: 12px; height: 12px; background: var(--zhu); -webkit-mask: var(--ink-splash-1) center / 170% 170%; mask: var(--ink-splash-1) center / 170% 170%; }
.fire .ends { display: flex; justify-content: space-between; font-family: var(--f-kai); font-size: 13px; color: var(--ink-dan); margin-top: 8px; }
.fire .live { display: flex; justify-content: space-between; font-family: var(--f-ui); font-size: 12px; color: var(--ink-zhong); margin-top: 6px; }
.fire .live b { font-family: var(--f-display); font-size: 18px; color: var(--ink); font-weight: 400; }
.detail { left: 880px; top: 70px; width: 330px; padding: 26px 30px; max-height: 470px; }
.detail .name { display: flex; align-items: center; gap: 12px; font-family: var(--f-display); font-size: 30px; letter-spacing: .12em; }
.detail .grade { font-family: var(--f-kai); font-size: 14px; margin: 4px 0 10px; }
.detail .desc { font-size: 14px; line-height: 1.75; color: var(--ink-nong); margin: 0 0 6px; }
.detail .ink-row { font-size: 14px; padding: 5px 2px; }
.detail .ink-row .v { font-family: var(--f-kai); font-size: 15px; }
.detail .rate { display: flex; align-items: center; gap: 16px; margin-top: 10px; }
.detail .rate .ink-ring { width: 70px; height: 70px; flex: none; }
.detail .rate .pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--f-display); font-size: 20px; color: var(--ink); }
.detail .rate p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--ink-zhong); }
.detail .batch { display: flex; align-items: baseline; gap: 4px; margin-top: 6px; }
.detail .batch .ink-btn { font-size: 17px; padding: 2px 8px 8px; }
.detail .batch .ink-btn.on { color: var(--zhu); }
.detail .cv-up { margin-top: 10px; }
.plots { left: 440px; top: 120px; width: 400px; height: 400px; display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: 30px 26px; }
.plots::before { content: "园"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--f-splash); font-size: 260px; color: var(--ink-mist); pointer-events: none; }
.plots .p { position: relative; width: 112px; }
.plots .p { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
.plots .p .ink-slot { --z: 88px; font-size: 38px; }
.plots .p small { font-family: var(--f-ui); font-size: 11px; color: var(--ink-zhong); text-align: center; line-height: 1.5; }
.plots.many { gap: 18px 14px; }
.plots.many .p .ink-slot { --z: 72px; font-size: 32px; }
.plots .ink-slot.ripe::before { animation: ink-breathe 2.4s ease-in-out infinite; }
.cv-uses { font-family: var(--f-kai); font-size: 13px !important; text-align: right; max-width: 200px; line-height: 1.5; }
.rf-list .ink-row.on .k, .rf-list .ink-row.on .v { color: var(--zhu); }
.rf-list .ink-row.off { opacity: .5; }
.seed-row { flex-wrap: wrap; row-gap: 0; }
.seed-row .ink-btn { font-size: 16px; padding: 2px 8px 8px; }
.rf-list .ink-row:hover .k { color: var(--ink); }
.rf-reveal { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 400px; padding: 22px 26px 18px; text-align: center; z-index: 3;
  background: radial-gradient(ellipse, rgba(245,240,227,.97) 55%, rgba(245,240,227,.85) 70%, rgba(245,240,227,0) 80%); }
.rf-reveal .old, .rf-reveal .neo { display: flex; justify-content: center; gap: 14px; font-family: var(--f-display); font-size: 24px; letter-spacing: .08em; position: relative; }
.rf-reveal .old { color: var(--ink-dan); }
.rf-reveal .old::after { content: ""; position: absolute; left: 18%; right: 18%; top: 52%; height: 3px; background: var(--zhu); transform-origin: left; animation: rf-strike .35s var(--ease-ink) .15s both; }
.rf-reveal .neo { margin-top: 12px; font-size: 30px; animation: rf-ink .8s var(--ease-ink) .45s both; }
.rf-reveal .stamp { position: absolute; right: -6px; top: -18px; animation-delay: .9s; }
.rf-reveal .acts .ink-btn { white-space: nowrap; font-size: 18px; }
.rf-reveal .acts { display: flex; justify-content: center; gap: 14px; margin-top: 16px; opacity: 0; animation: cv-in-up .4s var(--ease-ink) 1.1s both; }
@keyframes rf-strike { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes rf-ink { from { opacity: 0; transform: translateY(6px) scale(.94); } to { opacity: 1; transform: none; } }

/* ---- 仓库（bag.png） ---- */
.st-side { left: 56px; top: 54px; display: flex; gap: 18px; }
.st-side .t { writing-mode: vertical-rl; font-size: 64px; color: var(--ink); }
.st-side .col { display: flex; flex-direction: column; gap: 14px; padding-top: 10px; }
.worth .lbl { font-family: var(--f-kai); font-size: 14px; color: var(--ink-zhong); letter-spacing: .3em; }
.worth .n { font-family: var(--f-display); font-size: 50px; line-height: 1.05; color: #7c5d1a; }
.worth .s { font-family: var(--f-ui); font-size: 12px; color: var(--ink-dan); }
.equip { left: 54px; top: 330px; width: 240px; }
.equip .ink-h { font-size: 17px; margin-bottom: 8px; }
.equip .slots { display: grid; grid-template-columns: 1fr 1fr; gap: 26px 10px; justify-items: center; }
.equip .ink-slot { cursor: pointer; }
.equip .bust { position: absolute; left: 150px; top: -120px; width: 150px; height: 182px; opacity: .5; background: 0 0 / 100% 100% no-repeat; pointer-events: none; }
.keys { left: 60px; bottom: 34px; font-family: var(--f-ui); font-size: 12px; color: var(--ink-zhong); display: flex; gap: 16px; }
.keys b { font-weight: 700; color: var(--ink-nong); border-bottom: 1px solid var(--ink-dan); padding: 0 3px; margin-right: 4px; }
.bag { left: 312px; top: 40px; width: 500px; padding: 22px 26px 22px; }
.bag .ink-tabs { margin: 0 0 12px -6px; }
.bag .ink-tab { cursor: pointer; }
.bag .gw { max-height: 430px; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; }
.bag .ink-grid { --cell: 70px; --cols: 6; }
.bag .ink-grid > .it { font-size: 32px; cursor: pointer; }
.bag .ink-grid > .it.pick::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; box-shadow: inset 0 0 0 2px var(--zhu); }
.bag .ink-grid > .it.q-ji { --qw: rgba(210,50,30,.25); color: var(--zhu); }
.bag .cap { display: flex; justify-content: space-between; align-items: baseline; margin-top: 12px; font-family: var(--f-ui); font-size: 12px; color: var(--ink-zhong); }
.st-detail { left: 840px; top: 64px; width: 340px; padding: 26px 30px 26px; }
.st-detail .top { display: flex; gap: 18px; align-items: center; }
.st-detail .top .ink-slot { --z: 96px; font-size: 48px; }
.st-detail .name { font-family: var(--f-display); font-size: 28px; letter-spacing: .1em; display: flex; align-items: center; gap: 10px; }
.st-detail .grade { font-family: var(--f-kai); font-size: 14px; margin-top: 4px; }
.st-detail .desc { font-size: 14px; line-height: 1.8; color: var(--ink-nong); margin: 14px 0 8px; }
.st-detail .ink-row { font-size: 14px; padding: 5px 2px; }
.st-detail .ink-row .v { font-family: var(--f-kai); font-size: 15px; }
.st-detail .ink-row .v.gold { font-family: var(--f-display); font-size: 20px; color: #7c5d1a; }
.st-detail .aff .ink-row .v { color: var(--ink); }
.st-detail .acts { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; gap: 8px; flex-wrap: wrap; }
.st-detail .empty { font-size: 15px; color: var(--ink-dan); line-height: 1.8; }

/* ---- 出行台 ---- */
.dp-fig { left: 120px; top: 60px; width: 360px; height: 600px; background: 0 0 / 100% 100% no-repeat; opacity: .92; }
.dp-card { left: 560px; top: 120px; width: 420px; padding: 30px 34px; }
.dp-card .ink-row { font-size: 15px; }
.dp-card .reloc { margin-top: 18px; }

/* ================= 演出 ================= */
.cv-say { position: absolute; left: 40px; bottom: 178px; max-width: 520px; animation: cv-in-up .3s var(--ease-ink) both; cursor: pointer; pointer-events: auto; }
.cv-say .ink-tip { max-width: 440px; }
.cv-root.paging .cv-say { visibility: hidden; pointer-events: none; }
.cv-say .more { font-family: var(--f-ui); font-size: 11px; color: var(--ink-dan); margin-top: 4px; text-align: right; }
.cv-toasts { position: absolute; left: 50%; top: 13%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; z-index: 20; }
.cv-toasts .ink-toast { animation: cv-toast var(--d, 2.4s) var(--ease-ink) forwards; white-space: nowrap; }
@keyframes cv-toast { 0% { opacity: 0; clip-path: inset(0 100% 0 0); } 12% { opacity: 1; clip-path: inset(0 0 0 0); } 80% { opacity: 1; } 100% { opacity: 0; } }
.cv-modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(21,24,27,.35); z-index: 18; pointer-events: auto; }
.cv-modal .ink-paper { width: 460px; animation: cv-in-up .25s var(--ease-ink) both; }
.cv-modal p { font-size: 16px; line-height: 1.8; margin: 10px 0 6px; color: var(--ink-nong); }
.cv-modal .acts { display: flex; justify-content: flex-end; align-items: center; gap: 20px; margin-top: 8px; }
.cv-modal .ink-seal-btn { --s: 74px; }

/* 突破：墨色漩涡 + 天机镜 */
.cv-break { position: absolute; inset: 0; z-index: 19; display: flex; align-items: center; justify-content: center; gap: 6vw; overflow: hidden; color: var(--paper-hi); pointer-events: auto; }
.cv-break .vortex { position: absolute; left: 50%; top: 50%; width: 180vmax; height: 180vmax; margin: -90vmax 0 0 -90vmax; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(10,12,14,.92) 0 9deg, rgba(28,30,34,.78) 9deg 15deg, rgba(10,12,14,.92) 15deg 24deg);
  -webkit-mask: radial-gradient(circle, transparent 0, #000 9%, #000 100%); mask: radial-gradient(circle, transparent 0, #000 9%, #000 100%);
  animation: cv-spin 6s linear infinite, cv-in 1s var(--ease-ink) both; }
.cv-break .vortex.gold { background: repeating-conic-gradient(from 0deg, rgba(14,12,8,.94) 0 9deg, rgba(60,46,20,.8) 9deg 15deg, rgba(14,12,8,.94) 15deg 24deg); }
.cv-break .core { position: absolute; left: 50%; top: 50%; width: 30vmin; height: 30vmin; margin: -15vmin; border-radius: 50%; background: radial-gradient(circle, rgba(245,240,227,.9), rgba(217,180,94,.35) 40%, transparent 70%); animation: cv-breath 2.2s ease-in-out infinite; }
@keyframes cv-spin { to { transform: rotate(360deg); } }
@keyframes cv-in { from { opacity: 0; transform: scale(1.4) rotate(-40deg); } to { opacity: 1; } }
@keyframes cv-breath { 0%, 100% { opacity: .55; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.08); } }
.cv-break .main { position: relative; text-align: center; z-index: 2; min-width: 360px; }
.cv-break .from { font-family: var(--f-display); font-size: 26px; opacity: .65; letter-spacing: .2em; }
.cv-break .to { font-family: var(--f-splash); font-size: 104px; line-height: 1.05; color: var(--paper-hi); text-shadow: 0 0 30px rgba(217,180,94,.6); margin: 6px 0 10px; }
.cv-break .unl { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 19px; margin-top: 10px; }
.cv-break .unl > div { display: flex; align-items: center; gap: 10px; opacity: 0; animation: cv-in-up .45s var(--ease-ink) forwards; }
.cv-break .xjz { margin-top: 18px; font-family: var(--f-kai); font-size: 18px; color: rgba(245,240,227,.85); opacity: 0; animation: cv-in-up .5s var(--ease-ink) forwards; }
.cv-break .go { margin-top: 26px; opacity: 0; animation: cv-in-up .45s var(--ease-ink) forwards; }
.cv-break .go .ink-btn { color: var(--paper-hi); }
.cv-break .go .ink-btn::after { background: rgba(245,240,227,.5); }
.cv-mirror { position: relative; z-index: 2; width: 250px; height: 470px; border-radius: 34px; padding: 18px 16px; background: linear-gradient(160deg, #1c2226, #0d1012);
  box-shadow: 0 0 0 3px #3b4247, 0 0 0 5px #15181b, 0 0 40px rgba(127,200,220,.35); opacity: 0; animation: cv-in-up .7s var(--ease-ink) .5s forwards; flex: none; }
.cv-mirror .scr { position: relative; height: 100%; border-radius: 22px; overflow: hidden; padding: 30px 18px; background: radial-gradient(ellipse at 50% 30%, rgba(90,150,170,.32), rgba(15,22,26,.9) 70%); }
.cv-mirror .crack { position: absolute; inset: 0; pointer-events: none; opacity: .55; width: 100%; height: 100%; }
.cv-mirror .ttl { font-family: var(--f-ui); font-size: 11px; letter-spacing: .3em; color: rgba(190,230,240,.7); }
.cv-mirror .big { font-family: var(--f-display); font-size: 26px; color: #dff3f6; margin: 6px 0 14px; letter-spacing: .1em; text-shadow: 0 0 12px rgba(127,200,220,.7); }
.cv-mirror .ln { font-family: var(--f-ui); font-size: 14px; line-height: 1.75; color: #d4e8ec; margin-bottom: 10px; opacity: 0; animation: cv-light 1.2s ease forwards; }
.cv-mirror.clue { box-shadow: 0 0 0 3px #6b5a33, 0 0 0 5px #15181b, 0 0 60px rgba(217,180,94,.55); }
@keyframes cv-light { from { opacity: 0; filter: blur(4px); } to { opacity: 1; filter: none; } }
.cv-surge { position: absolute; inset: 0; z-index: 17; pointer-events: none; background: radial-gradient(circle at 50% 50%, rgba(217,180,94,.6), rgba(217,180,94,.22) 30%, rgba(60,46,20,.18) 48%, transparent 70%); animation: cv-surge 1.4s var(--ease-ink) forwards; }
.cv-surge.ji { background: radial-gradient(circle at 50% 50%, rgba(210,50,30,.55), rgba(210,50,30,.2) 30%, rgba(60,20,14,.18) 48%, transparent 70%); }
.st-detail .stamp { position: absolute; right: 26px; top: 20px; }
@keyframes cv-surge { 0% { opacity: 0; transform: scale(.4); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.6); } }
.cv-trial { position: absolute; left: 50%; top: 26px; transform: translateX(-50%); width: 520px; text-align: center; pointer-events: none; color: var(--ink-jiao); }
.cv-trial .ttl { font-family: var(--f-splash); font-size: 40px; text-shadow: 0 0 10px var(--paper-hi); }
.cv-trial .ink-bar { height: 22px; margin-top: 4px; }
.cv-trial .sub { font-family: var(--f-kai); font-size: 14px; color: var(--ink-zhong); text-shadow: 0 0 6px var(--paper-hi); }
.cv-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 55%, transparent 40%, rgba(21,24,27,.55) 85%, rgba(21,24,27,.8)); animation: cv-fade 1s ease both; }
.cv-banner { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); font-family: var(--f-splash); font-size: 120px; color: var(--ink-jiao); text-shadow: 0 0 30px var(--paper-hi); pointer-events: none; animation: cv-banner 2.2s var(--ease-ink) forwards; white-space: nowrap; }
@keyframes cv-banner { 0% { opacity: 0; letter-spacing: .6em; filter: blur(8px); } 25% { opacity: 1; letter-spacing: .1em; filter: none; } 80% { opacity: 1; } 100% { opacity: 0; } }
.cv-wipe { position: absolute; inset: 0; z-index: 21; background: var(--ink-tex-paper), var(--paper); background-blend-mode: multiply; display: flex; align-items: center; justify-content: center; animation: cv-wipe 2.6s var(--ease-ink) forwards; pointer-events: auto; }
.cv-wipe .ink-splash { font-size: 64px; color: var(--ink-jiao); }
@keyframes cv-wipe { 0% { clip-path: inset(0 0 0 100%); } 30% { clip-path: inset(0 0 0 0); } 70% { clip-path: inset(0 0 0 0); } 100% { clip-path: inset(0 100% 0 0); } }
`;

let done = null;
export function caveStyle() {
  if (done) return done;
  const st = document.createElement("style");
  st.id = "cave-ui-style";
  st.textContent = CSS;
  document.head.appendChild(st);
  bakeInkTextures(); // 纸纹墨晕改指离线 PNG（只设 CSS 变量 + 后台解码）
  // 套件样式异步注入在后面；加载完把洞府样式挪到最后，保证布局规则覆盖套件的同级规则
  done = loadKit().then(() => {
    document.head.appendChild(st);
    // 预烘焙：纸纹墨晕（全局 CSS 变量）与立绘；空闲时做，不挡首帧
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    return new Promise((res) =>
      idle(async () => {
        const t0 = performance.now();
        await bakeInkTextures();
        await bakeArt({ ...ART }); // 只是后台解码
        console.log(`[cave] 纹理与立绘解码 ${Math.round(performance.now() - t0)}ms`);
        res();
      }),
    );
  });
  return done;
}
// 水墨套件：优先 src/ui/ink/（流程模块的拷贝），否则用本目录的兜底副本
async function loadKit() {
  const keys = Object.keys(KIT);
  const has = (n) => keys.find((k) => k.endsWith("/" + n));
  try {
    if (has("ink-ui.css")) {
      for (const k of keys) await KIT[k]();
    } else console.warn("[cave] 没找到 src/ui/ink/ 水墨套件");
    const js = Object.values(KIT_JS)[0];
    if (js) await js();
  } catch (e) {
    console.error("[cave] 水墨套件加载失败", e);
  }
  // SVG 滤镜（ink-ui.js 的同款）：套件 js 没加载时自己补
  if (!document.getElementById("ink-rough"))
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="ink-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter><filter id="ink-bleed" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="9"/><feGaussianBlur stdDeviation=".6"/></filter></defs></svg>`,
    );
}

// 洞府模块一被加载（流程模块在启动时懒加载它）就注入样式、改指纸纹位图：样式重算与纹理解码落在启动阶段，不落在第一次进洞府
if (typeof document !== "undefined") document.readyState === "loading" ? addEventListener("DOMContentLoaded", () => caveStyle()) : caveStyle();
