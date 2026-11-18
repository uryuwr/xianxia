// 药园 A：仅表现与选择。种植/扩建/采收一律交给既有业务，绝不保存草图状态。
import './garden_v2.css';
import * as F from '../../game/cave/facilities.js';
import { itemId, itemName } from '../../game/cave/data.js';
import { RARITY, defOf } from '../../core/items.js';
import { inkReadable } from '../../fx/rarity_tint.js';
import { iconEl } from '../icons.js';
import { pushEsc } from '../esc.js';
import { el } from './widgets.js';

const CN = ['一', '二', '三', '四', '五'];
const PAGE = 2;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const act = (label, id, disabled = false, cls = '') => `<button type="button" class="gy2-button ${cls}" data-act="${id}"${disabled ? ' disabled' : ''}>${label}</button>`;
const qstyle = q => `style="color:${inkReadable(q || 0)}"`;
const ico = (id, size) => `<span class="gy2-icon" data-icon="${esc(id)}" style="--gy2-icon:${size}px"></span>`;
const name = it => defOf(it)?.name || itemName(it.id);

export class GardenV2 {
  constructor(ui, box) {
    this.ui = ui;
    this.box = box;
    this.alive = true;
    this.signature = '';
    this.sheet = el('section', 'gy2-sheet');
    box.classList.add('gy2-box');
    box.appendChild(this.sheet);
    this.click = e => this.onClick(e);
    this.change = e => {
      if (e.target.matches('[data-garden-soil]')) { ui.sel.fert = e.target.checked; this.render(); }
    };
    this.sheet.addEventListener('click', this.click);
    this.sheet.addEventListener('change', this.change);
  }
  read() {
    const p = this.ui.p, S = this.ui.sel;
    const plots = F.gardenPlots(p), seeds = F.seeds(p);
    S.plot = Math.max(0, Math.min(plots.length - 1, Number.isInteger(S.plot) ? S.plot : 0));
    if (!Number.isInteger(S.year) || S.year < 0 || S.year >= RARITY.length) S.year = seeds[0]?.rarity || 0;
    const rows = seeds.filter(it => (it.rarity || 0) === S.year);
    S.seedPage = Math.max(0, Math.min(Math.ceil(rows.length / PAGE) - 1, S.seedPage || 0));
    let seed = rows.find(it => it.uid === S.seed);
    if (!seed) { seed = rows[S.seedPage * PAGE]; S.seed = seed?.uid || null; }
    const fc = seed && F.fertCost(p, seed);
    if (!fc) S.fert = false;
    return { p, S, plots, seeds, rows, seed, fc, lv: F.facLevel(p, 'garden'), upgrade: F.upgradeInfo(p, 'garden') };
  }
  render() {
    if (!this.alive) return;
    const d = this.read(), {p, S, plots, rows, seed, fc, lv, upgrade} = d;
    // Explicit render calls only; stable calls perform no DOM writes or layout reads.
    const signature = JSON.stringify([S, plots, p.stats?.runs, lv, F.caveState(p).region,
      d.seeds.map(it => [it.uid, it.id, it.rarity, it.n]), fc, upgrade,
      F.costList(upgrade.cost).map(c => p.storage.count(c.id)), fc && p.storage.count(fc.id)]);
    if (signature === this.signature) return;
    this.signature = signature;
    const focus = document.activeElement;
    const focusKey = this.sheet.contains(focus) ? ['data-act','data-plot','data-year','data-seed','data-seed-page','data-garden-soil'].find(k => focus.hasAttribute(k)) : null;
    const focusValue = focusKey && focus.getAttribute(focusKey);
    const ripe = plots.filter(pl => F.plotState(p, pl)?.ripe).length;
    const pl = F.plotState(p, plots[S.plot]);
    this.sheet.innerHTML = `<header class="gy2-header"><div><small>墨途 · 洞府</small><h1>药园</h1></div><div class="gy2-subtitle">Lv${lv} · ${F.caveState(p).region === 'r1' ? '青岚山居' : '溪谷灵脉'} · 已开 ${plots.length} 畦<p>栽一株草，候几番归。成熟留地，采收归仓。</p></div><nav>${act('园务说明','garden-help')}${act(upgrade.max ? '园地已满级' : '扩建药园','up-garden')}${act('收起 · Esc','close')}</nav></header>
      <main class="gy2-main"><section class="gy2-overview"><div class="gy2-section-head"><h2>园圃总览</h2><small>点选一畦，查看或打理</small></div><div class="gy2-plots">${plots.map((raw,i) => {
        const s = F.plotState(p,raw);
        return `<button type="button" class="gy2-plot" data-plot="${i}" data-state="${!s ? 'empty' : s.ripe ? 'ripe' : 'growing'}" aria-pressed="${S.plot === i}"><span class="gy2-plot-number">第${CN[i]}畦</span><span class="gy2-plot-state">${!s ? '空地待栽' : s.ripe ? '成熟待收' : ['萌芽','抽叶','成株'][s.stage]}</span>${s ? ico(itemId(s.herb),65) : '<span class="gy2-soil-mark"></span>'}<strong ${s ? qstyle(s.rarity) : ''}>${s ? esc(s.herb) : '待一株新苗'}</strong><small>${s ? `${esc(s.year)} · ${s.ripe ? '已成熟 · 可采收' : `还需 ${s.left} 次出行`}` : '空地 · 选种后移栽'}</small></button>`;
      }).join('')}${plots.length === 1 ? '<div class="gy2-open-note"><h2>一畦，也是一座园。</h2><p>先从手中的草苗种起。<br>扩建能开更多地，满级搬迁后最多五畦。</p></div>' : ''}</div><p class="gy2-note">每次出行推进生长，成败均计。<br>成熟留在田中，不枯萎、不自动入仓。</p></section>
      <section class="gy2-detail" aria-label="选中地块操作"><div class="gy2-section-head"><div><small>第${CN[S.plot]}畦 · ${!pl ? '空地待栽' : pl.ripe ? '成熟待收' : '生长中'}</small><h2>${pl ? '候草知时' : '择苗入土'}</h2></div><span class="gy2-seal">${!pl ? '移栽' : pl.ripe ? '待收' : '养成'}</span></div>${pl ? this.grown(pl) : this.plantContent(d)}</section></main>
      <footer class="gy2-footer"><p>F 只打开药园，不直接采收 · Esc 收起<br>按出行次数生长，不按现实时间</p>${act(`全部采收${ripe ? ` · ${ripe} 畦` : ''}`,'harvest-all',!ripe,'gy2-primary')}</footer>`;
    this.icons(this.sheet);
    if (focusKey) [...this.sheet.querySelectorAll(`[${focusKey}]`)].find(e => e.getAttribute(focusKey) === focusValue)?.focus({preventScroll:true});
    if (this.modalKind === 'upgrade') this.fillModal();
  }
  icons(root) {
    root.querySelectorAll('[data-icon]').forEach(e => e.appendChild(iconEl(e.dataset.icon)));
  }
  grown(s) {
    return `<div class="gy2-grown">${ico(itemId(s.herb),104)}<h3 ${qstyle(s.rarity)}>${esc(s.herb)}</h3><p ${qstyle(s.rarity)}>${esc(s.year)}</p><p>${s.ripe ? '已经成熟 · 等你亲手采下' : `已历 ${s.passed} / ${s.need} 次出行 · 还需 ${s.left} 次`}</p><p>${s.fert ? '移栽时已施灵土' : '移栽时未施灵土'} · 预计 ${s.yield.join('–')} 份</p><p class="gy2-grown-note">${s.ripe ? '成熟后留在田中，不枯萎。采收归仓；品质及返种按实际收获结算。' : '每次出行推进生长，成败均计。等待现实时间不会长大；生长中不追加施土。'}</p>${act(s.ripe ? '采收此畦' : '未成熟 · 继续出行','harvest',!s.ripe,'gy2-primary')}</div>`;
  }
  plantContent({p,S,rows,seeds,seed,fc}) {
    const si = seed && F.seedInfo(seed), short = S.fert && !fc?.ok;
    const pages = Math.max(1,Math.ceil(rows.length/PAGE));
    return `<nav class="gy2-years" aria-label="种子年份">${F.YEAR.map((y,q) => `<button type="button" data-year="${q}" aria-pressed="${S.year === q}" title="${RARITY[q].name}">${y}</button>`).join('')}</nav>
      <div class="gy2-seeds">${rows.length ? rows.slice(S.seedPage*PAGE,(S.seedPage+1)*PAGE).map(it => `<button type="button" class="gy2-seed" data-seed="${esc(it.uid)}" aria-pressed="${S.seed === it.uid}">${ico(it.id,36)}<strong ${qstyle(it.rarity)}>${esc(name(it))}</strong><small>不施土 · ${F.runsNeeded(p,F.seedInfo(it).runs,it.rarity||0)} 次出行成熟</small><span>×${it.n || 1}</span></button>`).join('') : `<div class="gy2-no-seeds"><h3>${seeds.length ? '这一年份，尚无草苗' : '仓中暂无可种的草苗'}</h3><p>${seeds.length ? '可翻至其他年份。' : '出行采集灵草，有机会带回草苗。'}<br>普通灵草不能直接代替种子。</p></div>`}</div>
      <nav class="gy2-pager" aria-label="种子分页"><button type="button" data-seed-page="prev"${S.seedPage === 0 ? ' disabled' : ''}>上一页</button><span>第 ${S.seedPage+1} / ${pages} 页 · 每页两种</span><button type="button" data-seed-page="next"${S.seedPage+1 >= pages ? ' disabled' : ''}>下一页</button></nav>
      <div class="gy2-plant-summary">${seed ? `<strong ${qstyle(seed.rarity)}>${esc(name(seed))} · ${esc(F.yearLabel(seed.rarity))}</strong><br>移栽后需 ${F.runsNeeded(p,si.runs,seed.rarity||0,S.fert)} 次出行 · 预计 ${si.yield.join('–')} 份${esc(si.herb)}` : '先选一株草苗，再决定移栽。'}</div>
      <label class="gy2-soil"><input type="checkbox" data-garden-soil="true"${S.fert ? ' checked' : ''}${!fc ? ' disabled' : ''}><span>${fc ? `移栽时施${esc(fc.name)} ×${fc.n} · 仓中 ${p.storage.count(fc.id)} 份<br>${short ? `<b>缺 ${fc.n-p.storage.count(fc.id)} 份；取消施土仍可移栽。</b>` : `${F.runsNeeded(p,si.runs,seed.rarity||0)} → ${F.runsNeeded(p,si.runs,seed.rarity||0,true)} 次出行成熟`}` : seed ? '十年草苗不施灵土' : '暂无可施土的草苗'}</span></label>
      <div class="gy2-act-row"><p>${short ? '施土用料不足，不会替你扣料。' : seed ? `消耗一株草苗${S.fert ? `、${fc.n} 份${esc(fc.name)}` : '，不消耗灵土'}。` : '暂无可移栽的种子。'}</p>${act('移栽此畦','plant',!seed||short,'gy2-primary')}</div>`;
  }
  onClick(e) {
    const b = e.target.closest('button');
    if (!this.alive || !b || b.disabled || !this.sheet.contains(b) || this.modal) return;
    const S = this.ui.sel;
    if (b.hasAttribute('data-plot')) S.plot = Number(b.dataset.plot);
    else if (b.hasAttribute('data-year')) { S.year = Number(b.dataset.year); S.seedPage = 0; S.seed = null; }
    else if (b.hasAttribute('data-seed')) S.seed = b.dataset.seed;
    else if (b.hasAttribute('data-seed-page')) S.seedPage += b.dataset.seedPage === 'next' ? 1 : -1;
    else {
      const a = b.dataset.act;
      if (a === 'close') return this.ui.close();
      if (a === 'garden-help') return this.openModal('help');
      if (a === 'up-garden') return this.openModal('upgrade');
      if (a === 'plant') {
        const {p,seed,fc,plots} = this.read();
        if (!seed || plots[S.plot] || (S.fert && !fc?.ok) || !F.plant(p,S.plot,seed.uid,!!S.fert)) return this.ui.toast('草苗或灵土不足，请重新选苗。','zhu');
        this.ui.toast(`已移栽${name(seed)}，随出行成长。`);
        return this.ui.cave.changed();
      }
      if (a === 'harvest' || a === 'harvest-all') {
        const got = this.ui.cave.harvestGarden(a === 'harvest' ? [S.plot] : undefined);
        if (got.length && this.alive) {
          // Snapshot the returned instances, never predict quantities or give items again.
          this.receipt = got.map(r => ({plot:r.plot,items:[r.herb,r.seed].filter(Boolean).map(it => ({id:it.id,n:it.n,rarity:it.rarity||0}))}));
          this.openModal('receipt');
        }
        return;
      }
    }
    this.render();
  }
  flash(actName) { this.sheet.querySelector(`[data-act="${actName}"]`)?.classList.add('cv-flash'); }
  openModal(kind) {
    this.closeModal();
    this.modalKind = kind;
    this.helpPage = 1;
    this.returnFocus = this.sheet.contains(document.activeElement) ? document.activeElement : this.sheet.querySelector(`[data-plot="${this.ui.sel.plot}"]`);
    const m = this.modal = el('div','cv-modal gy2-modal');
    m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true'); m.setAttribute('aria-labelledby','gy2-modal-title');
    this.sheet.inert = true;
    this.box.appendChild(m);
    this.fillModal();
    this.popEsc = pushEsc(() => this.closeModal(),{el:m});
    m.addEventListener('click',e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'garden-modal-close') return this.closeModal();
      if (b.dataset.act === 'up-garden-go') {
        if (!this.alive || this.ui.cur !== 'garden' || !F.upgrade(this.ui.p,'garden')) { this.fillModal(); return this.ui.toast('扩建条件尚未满足。','zhu'); }
        this.closeModal(); this.ui.cave.fxPuff('garden'); this.ui.toast('药园扩建已成','gold'); this.ui.cave.changed();
      }
      if (b.dataset.helpPage) { this.helpPage = Math.max(1,Math.min(3,this.helpPage+(b.dataset.helpPage==='next'?1:-1))); this.fillModal(); m.querySelector('input')?.focus(); }
    });
    m.addEventListener('input',e => {
      if (!e.target.matches('[data-garden-reader]')) return;
      this.helpPage = Number(e.target.value);
      m.querySelector('.gy2-help-text').innerHTML = this.helpText();
      e.target.setAttribute('aria-valuetext',`第 ${this.helpPage} 页，共三页`);
      m.querySelector('[data-help-page="prev"]').disabled = this.helpPage === 1;
      m.querySelector('[data-help-page="next"]').disabled = this.helpPage === 3;
      m.querySelector('.gy2-help-count').textContent = `${this.helpPage} / 3`;
    });
    m.addEventListener('keydown',e => {
      if (e.key !== 'Tab') return;
      const nodes = [...m.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!m.contains(document.activeElement)){e.preventDefault();first?.focus();}
      else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    });
    m.querySelector('[data-act="garden-modal-close"]').focus({preventScroll:true});
  }
  helpText() {
    return [
      '<h3>草木不识钟表，只记你的归程。</h3><p>每次出行推进生长，成败均计。现实里等待不会让植株提前成熟。</p><p>升级药园与移栽时施灵土可以提速；生长中不追加施土。</p>',
      `<h3>年份是品级的另一种叫法。</h3><p>${F.YEAR.map((y,q)=>`${y} · ${RARITY[q].name}`).join('；')}。</p><p>先选一畦空地，再按年份寻苗。每页两种，翻页不会扣料。取消施土仍可按原生长时间移栽。</p>`,
      '<h3>成熟留地，手动采收归仓。</h3><p>成熟不枯萎、不自动入仓。可收当前一畦，或收全部成熟地块，生长中的不受影响。</p><p>收获数量、品质与返种以采收回执为准。满级搬迁后最多五畦；F 只打开药园，不执行采收。</p>'
    ][this.helpPage-1];
  }
  upgradeText() {
    const p=this.ui.p,u=F.upgradeInfo(p,'garden');
    if(u.max)return '<h3>园地已达满级</h3><p>满级基础四畦，搬迁且药园等级大于零另增一畦。</p><p>当前已开 '+F.gardenPlots(p).length+' 畦；成熟植株仍需手动采收。</p>';
    return `<h3>Lv${u.lv} → Lv${u.lv+1}</h3><div class="gy2-costs">${F.costList(u.cost).map(c=>{const have=p.storage.count(c.id);return `<div>${ico(c.id,42)}<span>${esc(c.name)} ×${c.n}<small>${have<c.n?'缺 '+(c.n-have):'足够'} · 仓中 ${have}</small></span></div>`;}).join('')}</div><p>${esc(u.blocked || (u.ok ? '扩建条件已满足。' : '费用不足，暂不能扩建。'))}</p><p>扩建不清空原有植株，已栽灵草也随园地升级提速。</p>${act('确认扩建','up-garden-go',!u.ok,'gy2-primary')}`;
  }
  fillModal() {
    if(!this.modal)return;
    const kind=this.modalKind;
    let content;
    if(kind==='help')content=`<div class="gy2-help-text">${this.helpText()}</div><div class="gy2-inkstone"><button type="button" data-help-page="prev"${this.helpPage===1?' disabled':''}>上一页</button><input data-garden-reader type="range" min="1" max="3" step="1" value="${this.helpPage}" aria-label="砚台翻页：园务说明" aria-valuetext="第 ${this.helpPage} 页，共三页"><button type="button" data-help-page="next"${this.helpPage===3?' disabled':''}>下一页</button></div><p>园务说明 <span class="gy2-help-count">${this.helpPage} / 3</span> · 方向键、Home / End 翻页</p>`;
    else if(kind==='upgrade')content=this.upgradeText();
    else content=`<p>本次采收 ${this.receipt.length} 畦，已空出的地块可以重新移栽。</p><div class="gy2-receipt">${this.receipt.map(r=>`<div class="gy2-receipt-plot">第${CN[r.plot]}畦${r.items.map(it=>`<div class="gy2-receipt-item" data-receipt-id="${esc(it.id)}" data-q="${it.rarity}" data-n="${it.n}">${ico(it.id,46)}<span ${qstyle(it.rarity)}>${esc(itemName(it.id))} ×${it.n}<small>${RARITY[it.rarity].name}${F.seedInfo(it)?' · 另得草苗':''}</small></span></div>`).join('')}</div>`).join('')}</div><p>去向：洞府仓库 · 以上为本次实际收获。</p>`;
    this.modal.innerHTML=`<section class="gy2-modal-sheet"><header><h2 id="gy2-modal-title">${kind==='help'?'园务小记':kind==='upgrade'?'扩建药园':'已收入仓库'}</h2>${act('合上 · Esc','garden-modal-close')}</header>${content}</section>`;
    this.icons(this.modal);
  }
  closeModal() {
    this.popEsc?.(); this.popEsc=null;
    this.modal?.remove(); this.modal=null; this.modalKind=null;
    this.sheet.inert=false;
    if(this.alive && this.returnFocus) (this.returnFocus.isConnected ? this.returnFocus : this.sheet.querySelector(`[data-plot="${this.ui.sel.plot}"]`))?.focus({preventScroll:true});
    this.returnFocus=null;
  }
  dispose() {
    this.alive=false;
    this.closeModal();
    this.sheet.removeEventListener('click',this.click);
    this.sheet.removeEventListener('change',this.change);
    this.sheet.remove();
    this.receipt=null;
  }
}
