// UI-only sketch. No profile, save API, storage adapter, game scene, or facility actions.
// Shared names/colors and garden constants are read-only imports from the project.
import { RARITY } from '../../../../src/core/items.js';
import { inkReadable } from '../../../../src/fx/rarity_tint.js';
import { GARDEN, FACILITIES } from '../../../../src/data/recipes.js';

const LAYOUT = document.body.dataset.layout;
const ROOT = document.getElementById('garden-root');
const STAGE = document.getElementById('garden-stage');
const DIALOG = document.getElementById('garden-dialog');
const NOTICE = document.getElementById('garden-notice');
const PAGE_SIZE = LAYOUT === 'a' ? 2 : 4;
const NUM = ['一', '二', '三', '四', '五'];
const NAMES = {
  seed_qingling: '青灵草苗', seed_ninglu: '凝露花苗', seed_hanlu: '寒露草苗',
  seed_ziteng: '紫藤苗', seed_chiyan: '赤炎果苗', qingling_cao: '青灵草',
  ninglu_hua: '凝露花', hanlu_cao: '寒露草', zi_teng: '紫藤', chiyan_guo: '赤炎果',
  ling_tu: '灵土', spirit_stone: '灵石',
};
const PRESETS = [
  ['full', '满级已搬迁 · 五畦混合'], ['lv0', 'Lv0 · 一畦初开'],
  ['no-seeds', '无种子 · 空地'], ['many-seeds', '种子多页 · 五种年份'],
  ['soil-short', '施土不足 · 可取消施土'], ['upgrade-relocate', '扩建受阻 · 尚未搬迁'],
  ['upgrade-short', '扩建受阻 · 材料不足'], ['upgrade-ready', '扩建可行 · 材料齐备'],
  ['harvest', '成熟留地 · 单畦 / 全部采收'],
];
const TABS = [['overview', '巡园', '地块与生长'], ['plant', '移栽', '按年份寻种'], ['harvest', '采收', '成熟后收入仓库'], ['upgrade', '扩建', '园地与灵脉']];
const params = new URLSearchParams(location.hash.slice(1));
let atlas;
let state;
let dialogKind = '';
let dialogReturn = null;
let helpPage = 1;
let noticeTimer;

const label = (q) => `${GARDEN.years[q]} · ${RARITY[q].name}`;
const maxPlots = (lv = state.lv, moved = state.moved) => GARDEN.plots[lv] + (moved && lv > 0 ? GARDEN.relocateBonus : 0);
const need = (id, q, soil = false) => Math.max(1, Math.ceil(GARDEN.seeds[id].runs * GARDEN.yearRuns[q] / GARDEN.growth[state.lv] / (soil ? GARDEN.fertilize.mul : 1)));
const plotState = (plot) => {
  if (!plot) return { kind: 'empty', name: '空地待栽' };
  const n = need(plot.id, plot.q, plot.soil);
  const passed = state.runs - plot.at;
  const left = Math.max(0, n - passed);
  return { kind: left === 0 ? 'ripe' : 'growing', name: left === 0 ? '成熟待收' : passed / n < .34 ? '萌芽' : passed / n < .67 ? '抽叶' : '成株', n, passed, left };
};
const ripeIndices = () => state.plots.flatMap((p, i) => plotState(p).kind === 'ripe' ? [i] : []);
const seedRows = () => state.seeds.filter((seed) => seed.q === state.year && seed.n > 0);
const selectedSeed = () => state.seeds.find((seed) => seed.key === state.seed && seed.n > 0);
const soilCount = (seed) => seed ? GARDEN.fertilize.n[seed.q] : 0;
const color = (q) => `style="color:${inkReadable(q)}"`;
const attr = (yes) => yes ? ' disabled' : '';
const button = (text, action, extra = '', disabled = false, attrs = '') => `<button type="button" class="gy-button ${extra}" data-action="${action}"${attr(disabled)} ${attrs}>${text}</button>`;

function icon(id, size = 54) {
  const rect = atlas.main.rects[id];
  if (!rect) return `<span class="gy-icon" aria-hidden="true" style="--icon-size:${size}px"></span>`;
  const [x, y, w, h] = rect;
  const scale = size / Math.max(w, h);
  return `<span class="gy-icon" aria-hidden="true" style="--icon-size:${size}px;background-image:url('../../../../src/ui/icons/items.webp');background-size:${atlas.main.W * scale}px ${atlas.main.H * scale}px;background-position:${-x * scale}px ${-y * scale}px"></span>`;
}

function setPreset(key, initial = false) {
  if (!PRESETS.some(([id]) => id === key)) key = 'full';
  state = {
    preset: key, lv: 3, moved: true, runs: 12, plot: 0, year: 2, seed: '', page: 0,
    tab: 'overview', soil: false, closed: false, stones: 360, materials: { ling_tu: 12, hanlu_cao: 8 },
    seeds: GARDEN.years.flatMap((_, q) => Object.keys(GARDEN.seeds).map((id, i) => ({ key: `${id}:${q}`, id, q, n: 2 + i % 3 }))),
    plots: [null, { id: 'seed_ziteng', q: 4, at: 10, soil: false }, { id: 'seed_ninglu', q: 1, at: 8, soil: false }, { id: 'seed_hanlu', q: 2, at: 9, soil: true }, null],
    receipt: [],
  };
  if (key === 'lv0' || key === 'no-seeds') {
    state.lv = 0; state.moved = false; state.year = 0; state.runs = 0; state.stones = 60;
    state.materials = { ling_tu: 3, hanlu_cao: 0 }; state.plots = [null];
    state.seeds = key === 'no-seeds' ? [] : state.seeds.filter((s) => s.q === 0 && ['seed_qingling', 'seed_ninglu'].includes(s.id));
  }
  if (key === 'soil-short') {
    state.lv = 1; state.moved = false; state.year = 3; state.materials.ling_tu = 0;
    state.plots = [null, state.plots[1]]; state.soil = true;
  }
  if (key.startsWith('upgrade-')) {
    state.lv = key === 'upgrade-relocate' ? 2 : 1;
    state.moved = key !== 'upgrade-relocate';
    state.plots = [null, state.plots[1], state.plots[2]].slice(0, maxPlots());
    if (key === 'upgrade-short') { state.stones = 30; state.materials.ling_tu = 2; }
    if (LAYOUT === 'b') state.tab = 'upgrade';
  }
  if (key === 'many-seeds' && LAYOUT === 'b') state.tab = 'plant';
  if (key === 'soil-short' && LAYOUT === 'b') state.tab = 'plant';
  if (key === 'harvest') { state.plot = 2; if (LAYOUT === 'b') state.tab = 'harvest'; }
  if (initial) {
    if (TABS.some(([id]) => id === params.get('tab'))) state.tab = params.get('tab');
    const year = Number(params.get('year'));
    if (params.has('year') && Number.isInteger(year) && year >= 0 && year <= 4) state.year = year;
    const plot = Number(params.get('plot'));
    if (params.has('plot') && Number.isInteger(plot) && plot >= 0 && plot < state.plots.length) state.plot = plot;
    const page = Number(params.get('page'));
    if (params.has('page') && Number.isInteger(page) && page >= 0) state.page = page;
  }
  normalizeSeeds(true);
  closeDialog();
  NOTICE.textContent = '';
  render();
  if (LAYOUT === 'a' && key.startsWith('upgrade-')) openDialog('upgrade');
}

function normalizeSeeds(chooseVisible = false) {
  const rows = seedRows();
  state.page = Math.min(state.page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  if (chooseVisible || !rows.some((s) => s.key === state.seed)) state.seed = rows[state.page * PAGE_SIZE]?.key || '';
  if (!selectedSeed() || selectedSeed().q === 0) state.soil = false;
}

function demoBar() {
  return `<div class="gy-demo"><strong>${LAYOUT.toUpperCase()} · 交互草图</strong><label for="demo-preset">演示情境</label><select id="demo-preset">${PRESETS.map(([id, text]) => `<option value="${id}"${state.preset === id ? ' selected' : ''}>${text}</option>`).join('')}</select>${button('模拟出行 +1', 'advance')}${button('重置本情境', 'reset')}<span class="gy-demo-end">仅内存演示 · 不读写存档</span><a href="index.html" target="_top">方案对比</a></div>`;
}
function header() {
  return `<header class="gy-header"><div><div class="gy-kicker">墨途 · 洞府独立设施</div><h1>药园</h1></div><div class="gy-header-copy"><div>Lv${state.lv} · ${state.moved ? '溪谷灵脉' : '青岚山居'} · 已开 ${state.plots.length} 畦</div><p>栽一株草，候几番归。成熟留地，采收归仓。</p></div><div class="gy-header-actions">${button('园务说明', 'help')}${button(state.lv === 3 ? '园地已满级' : '扩建药园', 'upgrade')}${button('收起 · Esc', 'close', 'gy-close')}</div></header>`;
}
function footer() {
  return `<footer class="gy-footer"><p><kbd>F</kbd> 只打开药园，不直接采收 · <kbd>Esc</kbd> 收起</p><p>按出行次数生长，不按现实时间 · 场景方块田格与围栏不变</p>${button(`全部采收${ripeIndices().length ? ` · ${ripeIndices().length} 畦` : ''}`, 'harvest-all', 'gy-primary', ripeIndices().length === 0)}</footer>`;
}
function plotCard(plot, i) {
  const s = plotState(plot);
  const herb = plot ? GARDEN.seeds[plot.id].herb : null;
  const bottom = plot ? s.kind === 'ripe' ? '留在田中 · 手动采收' : `还需 ${s.left} 次出行` : '选种后移栽';
  return `<button type="button" class="gy-plot" data-plot="${i}" data-state="${s.kind}" aria-pressed="${state.plot === i}" aria-label="第${NUM[i]}畦，${plot ? `${NAMES[herb]}，${label(plot.q)}，` : ''}${s.name}，${bottom}"><span class="gy-plot-id">第${NUM[i]}畦</span><span class="gy-plot-status">${s.name}</span>${plot ? icon(herb, 65) : '<span class="gy-empty-soil" aria-hidden="true"></span>'}<span class="gy-plot-name" ${plot ? color(plot.q) : ''}>${plot ? NAMES[herb] : '待一株新苗'}</span><small>${plot ? label(plot.q) : '空地'} · ${bottom}</small></button>`;
}
function plots() {
  return `<div class="gy-plot-grid">${state.plots.map(plotCard).join('')}${state.plots.length === 1 ? '<div class="gy-open-note"><strong>一畦，也是一座园。</strong>先从手中的草苗种起。<br>扩建能开更多地，满级搬迁后最多五畦。</div>' : ''}</div>`;
}
function overview() {
  return `<section class="gy-overview"><div class="gy-section-head"><h2>${LAYOUT === 'a' ? '园圃总览' : '第一折 · 巡园'}</h2><p>点选一畦，查看或打理</p></div>${plots()}<div class="gy-plot-note">${state.lv === 3 ? '满级园地 4 畦 + 搬迁增地 1 畦，共 5 畦。' : `当前 ${state.plots.length} 畦；等级地块 1 / 2 / 3 / 4，搬迁且 Lv＞0 另增 1 畦。`}<br>这里是操作示意，不重做 3D 模型；模型插槽不代表可开地块。</div></section>`;
}
function years() {
  return `<nav class="gy-years" aria-label="种子年份">${GARDEN.years.map((name, q) => `<button type="button" class="gy-year" data-year="${q}" aria-pressed="${state.year === q}">${name}<small>${RARITY[q].name}</small></button>`).join('')}</nav>`;
}
function seeds() {
  const rows = seedRows();
  const visible = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  if (!rows.length) return `<div class="gy-no-seeds"><h3>${state.seeds.some((s) => s.n > 0) ? '这一年份，尚无草苗' : '仓中暂无可种的草苗'}</h3><p>${state.seeds.some((s) => s.n > 0) ? '可翻至其他年份。各年份独立分页，不藏在滚动条里。' : '出行采集灵草，有机会带回草苗；也可留意奇遇灵田。'}<br>普通灵草不能直接代替种子。</p></div>`;
  return `<div class="gy-seeds">${visible.map((seed) => `<button type="button" class="gy-seed" data-seed="${seed.key}" aria-pressed="${seed.key === state.seed}">${icon(seed.id, LAYOUT === 'a' ? 35 : 49)}<span><h3 ${color(seed.q)}>${NAMES[seed.id]}</h3><small>不施土 · ${need(seed.id, seed.q)} 次出行成熟</small></span><span class="gy-stock">×${seed.n}</span></button>`).join('')}</div>`;
}
function pager() {
  const n = Math.max(1, Math.ceil(seedRows().length / PAGE_SIZE));
  return `<div class="gy-pager" aria-label="种子分页"><button type="button" data-page="prev" aria-label="上一页种子"${attr(state.page === 0)}>上一页</button><span>第 ${state.page + 1} / ${n} 页 · 每页 ${PAGE_SIZE} 种</span><button type="button" data-page="next" aria-label="下一页种子"${attr(state.page + 1 >= n)}>下一页</button></div>`;
}
function plantAction() {
  const seed = selectedSeed();
  const cost = soilCount(seed);
  const short = state.soil && cost > state.materials.ling_tu;
  const occupied = !!state.plots[state.plot];
  const herb = seed ? GARDEN.seeds[seed.id].herb : null;
  return `<div class="gy-plant-summary">${seed ? `<strong ${color(seed.q)}>${NAMES[seed.id]} · ${label(seed.q)}</strong><br>移栽后需 ${need(seed.id, seed.q, state.soil)} 次出行 · 预计 ${GARDEN.seeds[seed.id].yield.join('–')} 份${NAMES[herb]}` : '<span class="gy-muted">先选一株草苗，再决定移栽。</span>'}</div><label class="gy-soil"><input id="use-soil" type="checkbox"${state.soil ? ' checked' : ''}${attr(!seed || seed.q === 0)}><span>${seed?.q === 0 ? '十年草苗不施灵土' : `移栽时施灵土 ×${cost || '—'} · 仓中 ${state.materials.ling_tu} 份`}${short ? `<br><span class="gy-red">缺灵土 ${cost - state.materials.ling_tu} 份；取消施土仍可移栽。</span>` : seed && seed.q > 0 ? `<br><span class="gy-muted">${need(seed.id, seed.q)} → ${need(seed.id, seed.q, true)} 次出行成熟</span>` : ''}</span></label><div class="gy-act-row"><p class="${short || occupied ? 'gy-red' : 'gy-muted'}">${occupied ? '此畦已有灵草，请另选空地。' : short ? '施土用料不足，不会替你扣料。' : seed ? `消耗 1 株草苗${state.soil ? `、${cost} 份灵土` : '，不消耗灵土'}。` : '暂无可移栽的种子。'}</p>${button('移栽此畦', 'plant', 'gy-primary', !seed || short || occupied)}</div>`;
}
function grownDetail(plot) {
  const s = plotState(plot);
  const herb = GARDEN.seeds[plot.id].herb;
  return `<div class="gy-grown">${icon(herb, 110)}<h3 ${color(plot.q)}>${NAMES[herb]}</h3><p ${color(plot.q)}>${label(plot.q)}</p><p>${s.kind === 'ripe' ? '<span class="gy-red">已经成熟 · 等你亲手采下</span>' : `已历 ${s.passed} / ${s.n} 次出行 · 还需 ${s.left} 次`}</p><p class="gy-muted">${plot.soil ? '移栽时已施灵土' : '移栽时未施灵土'} · 预计 ${GARDEN.seeds[plot.id].yield.join('–')} 份</p><div class="gy-grown-rule">${s.kind === 'ripe' ? '成熟后留在田中，不枯萎、不自动入仓。单畦采收不会影响其他田地。' : '每次出行推进生长，成败均计。等待现实时间不会长大；生长中不追加施土。'}</div><div class="gy-act-row">${button(s.kind === 'ripe' ? '采收此畦' : '未成熟 · 继续出行', 'harvest-one', 'gy-primary', s.kind !== 'ripe', `data-index="${state.plot}"`)}</div></div>`;
}
function detail() {
  const plot = state.plots[state.plot];
  return `<section class="gy-detail" aria-label="选中地块操作"><div class="gy-detail-heading"><div><p class="gy-eyebrow">第${NUM[state.plot]}畦 · ${plotState(plot).name}</p><h2>${plot ? '候草知时' : '择苗入土'}</h2></div><span class="gy-small-seal">${plot ? plotState(plot).kind === 'ripe' ? '待收' : '养成' : '移栽'}</span></div>${plot ? grownDetail(plot) : `${years()}${seeds()}${pager()}${plantAction()}`}</section>`;
}
function bookNav() {
  return `<nav class="gy-book-nav" aria-label="药圃册页">${TABS.map(([id, title, caption], i) => `<button type="button" data-tab="${id}" aria-pressed="${state.tab === id}"><span>${NUM[i]} · ${title}</span><small>${caption}</small></button>`).join('')}<p>一本园务册<br>一页只办一件事<br>不在小窗里翻滚</p></nav>`;
}
function bookPlant() {
  const seed = selectedSeed();
  return `<div class="gy-section-head"><h2>第二折 · 择苗移栽</h2><p>先选空地，再按年份选苗</p></div><div class="gy-plot-picker"><small>种在</small>${state.plots.map((p, i) => `<button type="button" data-plant-plot="${i}" aria-pressed="${state.plot === i}"${attr(!!p)}>第${NUM[i]}畦${p ? ' · 已栽' : ''}</button>`).join('')}</div><div class="gy-book-plant"><section>${years()}${seeds()}${pager()}<p class="gy-muted"><small>当前年份共 ${seedRows().length} 种。换页保留已选草苗；种植只消耗所选那一株。</small></p></section><aside><div class="gy-book-preview">${seed ? `${icon(seed.id, 91)}<h3 ${color(seed.q)}>${NAMES[seed.id]}</h3>` : '<h3>待一株新苗</h3>'}<small class="gy-muted">第${NUM[state.plot]}畦 · ${plotState(state.plots[state.plot]).name}</small></div>${plantAction()}</aside></div>`;
}
function bookHarvest() {
  const ids = ripeIndices();
  return `<div class="gy-section-head"><h2>第三折 · 成熟采收</h2><p>只收成熟地块，生长中的不受影响</p></div><div class="gy-harvest-list">${ids.length ? ids.map((i) => { const p = state.plots[i]; const herb = GARDEN.seeds[p.id].herb; return `<article class="gy-harvest-item">${icon(herb, 65)}<div><small>第${NUM[i]}畦 · 成熟</small><h3 ${color(p.q)}>${NAMES[herb]}</h3><p>${label(p.q)} · 预计 ${GARDEN.seeds[p.id].yield.join('–')} 份</p></div>${button('采此畦', 'harvest-one', '', false, `data-index="${i}"`)}</article>`; }).join('') : '<div class="gy-no-seeds"><h3>田中暂时没有成熟的灵草</h3><p>空地可移栽，生长中的草苗随出行成长。<br>不会把未成熟的植株一起收走。</p></div>'}</div><p class="gy-muted">成熟灵草会一直留在田中。采收直接进入洞府仓库，不进随身储物袋。</p><div class="gy-act-row"><p>本页可逐畦采收，也可用右下「全部采收」。</p>${button('回巡园', 'overview')}</div>`;
}
function upgradeInfo() {
  const cost = FACILITIES.garden.cost[state.lv];
  if (!cost) return { max: true, ok: false };
  const missing = [];
  if (state.stones < cost.stones) missing.push(`灵石 ${cost.stones - state.stones}`);
  for (const [id, n] of Object.entries(cost.items || {})) if ((state.materials[id] || 0) < n) missing.push(`${NAMES[id]} ${n - (state.materials[id] || 0)}`);
  const relocation = !!cost.relocate && !state.moved;
  return { cost, missing, relocation, ok: !relocation && !missing.length };
}
function upgradeContent() {
  const u = upgradeInfo();
  if (u.max) return `<div class="gy-upgrade-title"><span class="gy-script">五畦</span><div><h3>药园已达 Lv3</h3><p>满级基础四畦，搬迁灵脉另增一畦。</p></div></div><div class="gy-conditions"><p>当前已开 ${state.plots.length} 畦 · 最多可开 5 畦</p><p class="gy-muted">模型留有 8 个布置插槽，不等于能开 8 块地。<br>本草图不新增地块规则，也不重画田格与围栏。</p></div>`;
  const current = maxPlots(); const next = maxPlots(state.lv + 1);
  const materialList = [['spirit_stone', u.cost.stones, state.stones], ...Object.entries(u.cost.items).map(([id, n]) => [id, n, state.materials[id] || 0])];
  return `<div class="gy-upgrade-title"><span class="gy-script">拓土</span><div><h3>Lv${state.lv} → Lv${state.lv + 1}</h3><p>已开 ${current} 畦 → ${next} 畦 · 生长倍率 ×${GARDEN.growth[state.lv]} → ×${GARDEN.growth[state.lv + 1]}</p></div></div><div class="gy-costs">${materialList.map(([id, n, have]) => `<div class="gy-cost">${icon(id, 45)}<div><strong>${NAMES[id]} ×${n}</strong><small class="${have < n ? 'gy-red' : 'gy-muted'}">仓中 ${have}${have < n ? ` · 缺 ${n - have}` : ' · 足够'}</small></div></div>`).join('')}</div><div class="gy-conditions"><p class="${u.relocation ? 'gy-red' : 'gy-green'}">${u.relocation ? '尚未搬迁：升至 Lv3 前，需先搬迁到溪谷灵脉。' : u.cost.relocate ? '已搬迁 · 扩建条件已满足。' : '本次扩建无需先搬迁。'}</p>${u.missing.length ? `<p class="gy-red">仍缺 ${u.missing.join('、')}。</p>` : ''}<p class="gy-muted">灵土可于出行采集；寒露草可采集或在药园种植。<br>扩建不会清空原有植株，已栽灵草也随园地升级提速。</p></div><div class="gy-act-row"><p class="gy-muted">${u.relocation ? '搬迁属于洞府流程，本草图不执行搬迁。' : u.ok ? '仅演示扣料与开地，不影响真实存档。' : '用料不足，不会扣除任何材料。'}</p>${button('确认扩建', 'upgrade-confirm', 'gy-primary', !u.ok)}</div>`;
}
function book() {
  let content = overview();
  if (state.tab === 'plant') content = bookPlant();
  if (state.tab === 'harvest') content = bookHarvest();
  if (state.tab === 'upgrade') content = `<div class="gy-section-head"><h2>第四折 · 园地扩建</h2><p>地块上限五畦，不是八块</p></div><div class="gy-upgrade-page">${upgradeContent()}</div>`;
  return `<main class="gy-main-b">${bookNav()}<section class="gy-book-page" aria-label="${TABS.find(([id]) => id === state.tab)[1]}册页">${content}</section></main>`;
}
function render() {
  const focused = document.activeElement;
  const key = focusKey(focused);
  ROOT.innerHTML = demoBar() + (state.closed ? `<main class="gy-closed"><h1>药园已收起</h1><p>此处仅示意独立入口。场景中的方块田格、围栏不改。</p><div>${button('F · 打开药园', 'open', 'gy-primary')}</div><p>F 打开，不在场景直接采收。<br>这张草图不连接任何真实游戏存档。</p></main>` : header() + (LAYOUT === 'a' ? `<main class="gy-main-a">${overview()}${detail()}</main>` : book()) + footer());
  if (key) ROOT.querySelector(key)?.focus({ preventScroll: true });
  syncHash();
}
function focusKey(el) {
  if (!el || !ROOT.contains(el)) return null;
  if (el.id) return `#${el.id}`;
  for (const name of ['data-plot', 'data-seed', 'data-year', 'data-page', 'data-tab', 'data-plant-plot', 'data-action']) {
    if (el.hasAttribute(name)) return `[${name}="${el.getAttribute(name)}"]${el.hasAttribute('data-index') ? `[data-index="${el.dataset.index}"]` : ''}`;
  }
  return null;
}
function syncHash() {
  const h = new URLSearchParams({ preset: state.preset, tab: state.tab, plot: state.plot, year: state.year, page: state.page });
  // URL only records fixture + selection, never a game save or an inventory.
  try { history.replaceState(null, '', `#${h}`); } catch { /* restricted preview */ }
}
function announce(text) {
  clearTimeout(noticeTimer);
  NOTICE.textContent = text;
  noticeTimer = setTimeout(() => { NOTICE.textContent = ''; }, 4200);
}
function closeDialog() {
  if (DIALOG.open) DIALOG.close();
  dialogKind = '';
}
function openDialog(kind) {
  dialogReturn = document.activeElement;
  dialogKind = kind;
  helpPage = 1;
  renderDialog();
  if (!DIALOG.open) DIALOG.showModal();
  DIALOG.querySelector('[data-action="dialog-close"]')?.focus({ preventScroll: true });
}
function helpContent() {
  const pages = [
    `<h3>草木不识钟表，只记你的归程。</h3><p>生长按出行次数推进，出行成败均计。现实里等几分钟，不会让植株提前成熟。</p><p>年份就是品级的别名：${GARDEN.years.map((name, q) => `${name}对应${RARITY[q].name}`).join('，')}。</p><p>升级药园与移栽时施灵土是既有提速方式；不新增肥料，也不自动播种。</p>`,
    '<h3>成熟留地，手动采收归仓。</h3><p>成熟的灵草不会枯萎，也不会在回府时自动收走。可以只收当前一畦，或收取全部成熟地块。</p><p>收获进入洞府仓库，不占随身储物袋。本草图的收获数值只是固定示例；正式数量、品级及返种仍按既有规则结算。</p><p>F 统一打开药园。场景中不再用 F 直接采收；面板内也不把 F 当「全取」。</p>',
    '<h3>最多五畦，不把模型插槽当解锁格。</h3><p>Lv0 / Lv1 / Lv2 / Lv3 分别开放 1 / 2 / 3 / 4 畦。已经搬迁且药园等级大于零，再增加 1 畦。</p><p>升到 Lv3 要先搬迁到溪谷灵脉。扩建材料不足时，按钮不可用并写出缺口，不更改现有价格或门槛。</p><p>这次只比较打开药园后的 UI。3D 方块田格与围栏保持原状，游戏入口由主线程独立接线。</p>',
  ];
  return `<div class="gy-help-text">${pages[helpPage - 1]}</div><div class="gy-inkstone"><button type="button" class="gy-button" data-help-page="prev"${attr(helpPage === 1)}>上一页</button><input id="help-inkstone" type="range" min="1" max="3" step="1" value="${helpPage}" aria-label="砚台翻页：园务说明" aria-valuetext="第 ${helpPage} 页，共 3 页"><button type="button" class="gy-button" data-help-page="next"${attr(helpPage === 3)}>下一页</button></div><p class="gy-muted"><small>园务说明 ${helpPage} / 3 · 砚台翻页可用方向键、Home / End；无内层滚动。</small></p>`;
}
function renderDialog() {
  const title = dialogKind === 'help' ? '园务小记' : dialogKind === 'receipt' ? '已收入仓库 · 演示' : '扩建药园';
  const content = dialogKind === 'help' ? helpContent() : dialogKind === 'receipt' ? `<p>本次采收 ${state.receipt.length} 畦。地块已空出，可重新选苗。</p><div class="gy-receipt">${state.receipt.map((r) => `<div class="gy-receipt-item">${icon(r.herb, 58)}<div><strong ${color(r.q)}>${NAMES[r.herb]} ×${r.n}</strong><small>${RARITY[r.q].name} · 来自第${NUM[r.i]}畦</small></div></div>`).join('')}</div><p class="gy-muted">固定样例：取产量下限、同品级、本次未返种。<br>正式采收仍依既有随机规则，不以此草图改规则。</p><p class="gy-green">去向：洞府仓库（仅内存示意，未写真实仓库）。</p>` : upgradeContent();
  DIALOG.innerHTML = `<div class="gy-dialog-head"><h2 id="garden-dialog-title">${title}</h2>${button('合上 · Esc', 'dialog-close')}</div>${content}`;
}
function harvest(indices) {
  // Deterministic, explicitly disclosed receipt fixture, not a replacement gameplay rule.
  const valid = indices.filter((i) => plotState(state.plots[i]).kind === 'ripe');
  if (!valid.length) return announce('没有成熟地块可采收。');
  state.receipt = valid.map((i) => {
    const plot = state.plots[i]; const def = GARDEN.seeds[plot.id];
    state.plots[i] = null;
    return { i, herb: def.herb, n: def.yield[0], q: plot.q };
  });
  render();
  openDialog('receipt');
}
function execute(action, target) {
  if (action === 'reset') return setPreset(state.preset);
  if (action === 'advance') {
    state.runs++;
    render();
    return announce(`模拟第 ${state.runs} 次出行归来；成熟仍留在田中，未自动采收。`);
  }
  if (action === 'close') { state.closed = true; render(); ROOT.querySelector('[data-action="open"]')?.focus(); return; }
  if (action === 'open') { state.closed = false; render(); ROOT.querySelector('[data-action="close"]')?.focus(); return; }
  if (action === 'dialog-close') return closeDialog();
  if (action === 'help') return openDialog('help');
  if (action === 'upgrade') {
    if (LAYOUT === 'b') { state.tab = 'upgrade'; render(); } else openDialog('upgrade');
    return;
  }
  if (action === 'overview') { state.tab = 'overview'; render(); return; }
  if (action === 'harvest-all') return harvest(ripeIndices());
  if (action === 'harvest-one') return harvest([Number(target.dataset.index)]);
  if (action === 'plant') {
    const seed = selectedSeed();
    if (!seed || state.plots[state.plot]) return;
    const cost = soilCount(seed);
    if (state.soil && (seed.q === 0 || state.materials.ling_tu < cost)) return;
    state.plots[state.plot] = { id: seed.id, q: seed.q, at: state.runs, soil: state.soil };
    seed.n--;
    if (state.soil) state.materials.ling_tu -= cost;
    const planted = NAMES[seed.id];
    normalizeSeeds();
    if (LAYOUT === 'b') state.tab = 'overview';
    render();
    return announce(`第${NUM[state.plot]}畦已移栽${planted}。按出行次数成长，不会自动再种。`);
  }
  if (action === 'upgrade-confirm') {
    const u = upgradeInfo();
    if (!u.ok) return;
    state.stones -= u.cost.stones;
    for (const [id, n] of Object.entries(u.cost.items)) state.materials[id] -= n;
    state.lv++;
    while (state.plots.length < maxPlots()) state.plots.push(null);
    closeDialog(); render();
    announce(`药园升至 Lv${state.lv}，已开 ${state.plots.length} 畦；原有植株保留。`);
  }
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('button');
  if (!target || target.disabled || (!ROOT.contains(target) && !DIALOG.contains(target))) return;
  if (target.hasAttribute('data-help-page')) {
    helpPage = Math.max(1, Math.min(3, helpPage + (target.dataset.helpPage === 'next' ? 1 : -1)));
    renderDialog(); DIALOG.querySelector('#help-inkstone')?.focus(); return;
  }
  if (target.hasAttribute('data-action')) return execute(target.dataset.action, target);
  if (target.hasAttribute('data-plot')) {
    state.plot = Number(target.dataset.plot);
    if (LAYOUT === 'b') state.tab = state.plots[state.plot] ? 'overview' : 'plant';
    render();
    if (LAYOUT === 'b' && state.plots[state.plot]) openPlotNote();
    return;
  }
  if (target.hasAttribute('data-plant-plot')) { state.plot = Number(target.dataset.plantPlot); render(); return; }
  if (target.hasAttribute('data-tab')) {
    state.tab = target.dataset.tab;
    if (state.tab === 'plant' && state.plots[state.plot]) {
      const empty = state.plots.findIndex((p) => !p);
      if (empty >= 0) state.plot = empty;
    }
    render(); return;
  }
  if (target.hasAttribute('data-year')) { state.year = Number(target.dataset.year); state.page = 0; normalizeSeeds(true); render(); return; }
  if (target.hasAttribute('data-seed')) { state.seed = target.dataset.seed; render(); return; }
  if (target.hasAttribute('data-page')) {
    state.page += target.dataset.page === 'next' ? 1 : -1;
    normalizeSeeds(); render(); return;
  }
});
function openPlotNote() {
  // Folio dedicates its whole content region to the chosen task; growth details use a paper leaf.
  dialogReturn = document.activeElement;
  dialogKind = 'plot';
  const plot = state.plots[state.plot];
  DIALOG.innerHTML = `<div class="gy-dialog-head"><h2 id="garden-dialog-title">第${NUM[state.plot]}畦 · ${plotState(plot).name}</h2>${button('合上 · Esc', 'dialog-close')}</div>${grownDetail(plot)}`;
  if (!DIALOG.open) DIALOG.showModal();
  DIALOG.querySelector('[data-action="dialog-close"]')?.focus();
}
document.addEventListener('change', (e) => {
  if (e.target.id === 'demo-preset') setPreset(e.target.value);
  if (e.target.id === 'use-soil') { state.soil = e.target.checked; render(); }
});
DIALOG.addEventListener('input', (e) => {
  if (e.target.id !== 'help-inkstone') return;
  helpPage = Number(e.target.value);
  // Keep the range node focused and alive during drag / keyboard input.
  DIALOG.querySelector('.gy-help-text').innerHTML = helpContent().match(/<div class="gy-help-text">([\s\S]*?)<\/div>/)[1];
  e.target.setAttribute('aria-valuetext', `第 ${helpPage} 页，共 3 页`);
  DIALOG.querySelector('[data-help-page="prev"]').disabled = helpPage === 1;
  DIALOG.querySelector('[data-help-page="next"]').disabled = helpPage === 3;
  DIALOG.querySelector('.gy-inkstone + p small').textContent = `园务说明 ${helpPage} / 3 · 砚台翻页可用方向键、Home / End；无内层滚动。`;
});
DIALOG.addEventListener('close', () => {
  if (DIALOG.open) return; // A fixture switch may already have opened its new dialog.
  dialogKind = '';
  if (dialogReturn?.isConnected) dialogReturn.focus({ preventScroll: true });
  else ROOT.querySelector('[data-action="close"]')?.focus({ preventScroll: true });
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (DIALOG.open) return; // Native modal owns Escape and keyboard focus.
  if (e.key === 'Escape' && !state.closed) { e.preventDefault(); execute('close', e.target); return; }
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key.toLowerCase() === 'f') { e.preventDefault(); if (state.closed) execute('open', e.target); else announce('药园已打开。请点选地块操作；F 不执行采收。'); }
});
function resize() { STAGE.style.setProperty('--gy-scale', Math.min(innerWidth / 1280, innerHeight / 720)); }
window.addEventListener('resize', resize);
resize();
try {
  const response = await fetch(new URL('../../../../src/ui/icons/items.json', import.meta.url));
  if (!response.ok) throw new Error(`图集读取失败：${response.status}`);
  atlas = await response.json();
  setPreset(params.get('preset') || 'full', true);
  const atlasImage = new Image();
  atlasImage.src = new URL('../../../../src/ui/icons/items.webp', import.meta.url).href;
  await Promise.all([document.fonts.ready, atlasImage.decode()]);
  window.__ready = true;
  // Main thread may use these read-only notes / fixture switches for its later captures.
  window.__gardenSketch = { setPreset, get state() { return structuredClone(state); }, layout: LAYOUT };
  if (window.parent !== window) window.parent.postMessage({ type: 'garden-sketch-ready', layout: LAYOUT }, location.origin);
} catch (error) {
  ROOT.textContent = `草图资源未能载入：${error.message}。请通过项目开发服务器打开此 HTML。`;
}
