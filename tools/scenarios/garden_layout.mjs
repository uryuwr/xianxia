// 药园 A 正式接入专项；仅通过 tools/run.mjs 的共享执行槽运行。
// 场景准备允许调用业务 API；被验收的移栽/采收/扩建均真实点击界面。
const check = (ok, name, info) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info === undefined ? '' : ' ' + JSON.stringify(info)}`);
export default async function (page, c) {
  const errors = [], consoleErrors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleErrors.push(m.text()); });
  const base = new URL(page.url()).origin;
  await page.goto(`${base}/src/game/cave/dev.html?preset=rich`, {waitUntil:'domcontentloaded', timeout:180000});
  await page.waitForFunction(() => window.__ready && window.__cave?.active && !document.querySelector('.cv-loading'), null, {timeout:120000});
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const click = selector => page.locator(selector).click();
  const open = async () => {
    await ev(() => { __cave.ui.speech.clear(); __cave.open('garden'); });
    await page.waitForSelector('.gy2-sheet [data-act="close"]');
    const guide = page.locator('[data-act="guide-ok"]');
    if (await guide.count()) await guide.click();
    await c.wait(350);
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !__cave.ui.cur && !__cave.locked && !__cave.ctx.hold3d);
  };
  const totals = () => ev(() => {
    const out = {};
    for (const it of __cave.p.storage.items) { const key = `${it.id}:${it.rarity || 0}`; out[key] = (out[key] || 0) + (it.n || 1); }
    return out;
  });
  const receipt = async (before, expectedPlots, label) => {
    const got = await ev(() => ({
      plots: [...document.querySelectorAll('.gy2-receipt-plot')].length,
      items: [...document.querySelectorAll('[data-receipt-id]')].map(e => ({id:e.dataset.receiptId, q:+e.dataset.q, n:+e.dataset.n})),
      actual: __cave.ui.gardenView.receipt,
    }));
    const after = await totals(), delta = {};
    for (const it of got.items) { const key = `${it.id}:${it.q}`; delta[key] = (delta[key] || 0) + it.n; }
    const keys = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(delta)]);
    const actual = got.actual.flatMap(r => r.items).map(it => ({id:it.id,q:it.rarity,n:it.n}));
    check(got.plots === expectedPlots && got.items.length >= expectedPlots && got.items.every(it => it.n > 0) &&
      JSON.stringify(actual) === JSON.stringify(got.items) && [...keys].every(k => (after[k] || 0) - (before[k] || 0) === (delta[k] || 0)),
      `${label}：非空回执逐项等于真实库存增量，品质及返种不预测`, got);
  };
  const bounds = async (label, kind = 'page') => {
    const r = await ev(kind => {
      const view = __cave.ui.gardenView, actualKind = view?.modalKind || 'page';
      const roots = document.querySelectorAll(kind === 'page' ? '.gy2-sheet' : '.gy2-modal');
      const root = roots[0], structure = [];
      if (roots.length !== 1 || actualKind !== kind) structure.push({roots:roots.length,expectedKind:kind,actualKind});
      if (!root) return {structure,n:0,bad:[],overflow:[],icons:0,iconBad:[]};
      const count = (selector, expected) => {
        const actual = [...root.querySelectorAll(selector)].filter(n => n.getClientRects().length).length;
        if (actual !== expected) structure.push({selector,expected,actual});
      };
      let expectedIcons = 0;
      if (kind === 'page') {
        const p = __cave.p, F = __cave.F, S = __cave.ui.sel, plots = F.gardenPlots(p);
        if (!plots.length || plots.length > 5) structure.push({plots:plots.length});
        count('.gy2-plot', plots.length);
        plots.forEach((_,i) => count(`.gy2-plot[data-plot="${i}"]`,1));
        for (const act of ['close','garden-help','up-garden','harvest-all']) count(`[data-act="${act}"]`,1);
        expectedIcons = plots.filter(Boolean).length;
        if (plots[S.plot]) {
          count('[data-act="harvest"]',1);
          expectedIcons++;
        } else {
          count('[data-act="plant"]',1);
          count('[data-garden-soil]',1);
          count('[data-year]',F.YEAR.length);
          F.YEAR.forEach((_,q) => count(`[data-year="${q}"]`,1));
          for (const dir of ['prev','next']) count(`[data-seed-page="${dir}"]`,1);
          const rows = F.seeds(p).filter(it => (it.rarity || 0) === S.year);
          const visible = rows.slice(S.seedPage*2,(S.seedPage+1)*2);
          count('[data-seed]',visible.length);
          visible.forEach(it => count(`[data-seed="${it.uid}"]`,1));
          count('.gy2-no-seeds',rows.length ? 0 : 1);
          expectedIcons += visible.length;
        }
      } else {
        count('.gy2-modal-sheet',1);
        count('#gy2-modal-title',1);
        count('[data-act="garden-modal-close"]',1);
        if (kind === 'help') {
          count('button',3); count('[data-garden-reader]',1);
          for (const dir of ['prev','next']) count(`[data-help-page="${dir}"]`,1);
          count('.gy2-help-text',1); count('.gy2-help-count',1);
        } else if (kind === 'receipt') {
          const receipt = view?.receipt || [];
          if (!receipt.length || receipt.some(r => !r.items.length)) structure.push({receipt:'必须有真实采收畦和物品'});
          count('button',1); count('input',0);
          count('.gy2-receipt-plot',receipt.length);
          expectedIcons = receipt.reduce((n,r) => n+r.items.length,0);
          count('[data-receipt-id]',expectedIcons);
        } else if (kind === 'upgrade') {
          const costs = __cave.F.costList(__cave.F.upgradeInfo(__cave.p,'garden').cost);
          if (!costs.length) structure.push({costs:'费用不足场景必须有真实费用条目'});
          count('button',2); count('input',0); count('[data-act="up-garden-go"]',1);
          count('.gy2-costs > div',costs.length);
          expectedIcons = costs.length;
        } else structure.push({unknownKind:kind});
      }
      const nodes = [root, ...root.querySelectorAll('button,input,.gy2-plot,.gy2-seed,.gy2-modal-sheet,.gy2-icon,.gy2-icon>.mk-ico,.gy2-receipt-item,.gy2-costs>div')].filter(n => n.getClientRects().length);
      const bad = nodes.filter(n => { const r=n.getBoundingClientRect(); return r.left < -1 || r.top < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1; }).map(n => n.className || n.tagName);
      const overflow = [...root.querySelectorAll('.gy2-detail,.gy2-modal-sheet,.gy2-seed')].filter(n => n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2).map(n => n.className);
      const icons = [...root.querySelectorAll('.gy2-icon')], iconBad = [];
      count('.gy2-icon',expectedIcons);
      for (const host of icons) {
        const children = host.querySelectorAll(':scope > .mk-ico'), box = host.getBoundingClientRect();
        const size = parseFloat(getComputedStyle(host).getPropertyValue('--gy2-icon')) * Math.min(innerWidth/1280,innerHeight/720);
        const image = children[0]?.getBoundingClientRect();
        if (children.length !== 1 || !Number.isFinite(size) || size <= 0 || Math.abs(box.width-size)>1 || Math.abs(box.height-size)>1 ||
          !image || image.width<=0 || image.height<=0 || image.left<box.left-1 || image.top<box.top-1 || image.right>box.right+1 || image.bottom>box.bottom+1) {
          iconBad.push({id:host.dataset.icon,children:children.length,size,box:box.toJSON(),image:image?.toJSON()});
        }
      }
      return {kind,n:nodes.length,structure,bad,overflow,icons:icons.length,expectedIcons,iconBad};
    },kind);
    check(!r.structure.length && !r.bad.length && !r.overflow.length && !r.iconBad.length, `${label}：必要控件完整、不越界、无内部溢出且图标限于自身容器`, r);
  };
  const shot = async name => {
    // 五畦返种最迟在400+4*140=960ms触发；不隐藏/删除原提示，等其真实生命周期结束。
    await c.wait(1100);
    try {
      await page.waitForFunction(() => !document.querySelector('.cv-toasts .ink-toast,.cv-float'), null, {timeout:10000});
    } catch (e) {
      const pending = await page.locator('.cv-toasts .ink-toast,.cv-float').allTextContents();
      await c.shot(`${name}_transient_timeout`);
      throw new Error(`静态截图等待提示自然消失超时：${name} ${JSON.stringify(pending)}`, {cause:e});
    }
    await c.shot(name);
  };

  // 首次异步 import 尚未挂载时立即关闭；待真实模块解析完成，再核对无复活。
  await ev(async () => {
    __cave.open('garden'); __cave.ui.close();
    await import('/src/ui/cave/garden_v2.js');
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  check(await ev(() => !__cave.ui.cur && !__cave.ui.gardenView && !__cave.ui._gardenToken && !document.querySelector('.gy2-sheet,.gy2-modal')), '首次懒加载迟到不复活已关闭页面');

  const fixture = await ev(() => {
    const cv=__cave,p=cv.p,F=cv.F;
    for (const it of [...F.seeds(p)]) p.storage.remove(it.uid);
    p.cave.facilities.garden=3; p.cave.region='r2'; p.cave.garden.fill(null);
    for (const n of ['青灵草苗','紫藤苗','赤炎果苗']) __cdev.give(p,n,12,{rarity:2});
    const first=F.seeds(p)[0];
    if (!first) throw new Error('药园专项缺真实草苗样本');
    if (!F.plant(p,0,first.uid) || !F.plant(p,1,F.seeds(p)[0].uid) || !F.plant(p,2,F.seeds(p)[0].uid)) throw new Error('药园成熟样本种植失败');
    p.stats.runs += Math.max(...p.cave.garden.slice(0,3).map(pl => F.plotState(p,pl).left));
    if (!F.plant(p,3,F.seeds(p)[0].uid)) throw new Error('药园生长样本种植失败');
    cv.changed();
    return {plots:F.gardenPlots(p).length,ripe:F.ripePlots(p).length,seeds:F.seeds(p).map(it=>it.uid),growing:JSON.stringify(p.cave.garden[3])};
  });
  check(fixture.plots === 5 && fixture.ripe === 3 && fixture.seeds.length > 2, '真实最多五畦，准备三成熟、一生长、一空地及非空跨页苗种', fixture);
  await open();
  check(await ev(() => document.querySelectorAll('.gy2-plot[data-state="ripe"]').length === 3 && document.querySelectorAll('.gy2-plot[data-state="growing"]').length === 1 && document.querySelectorAll('.gy2-plot[data-state="empty"]').length === 1), '成熟/生长/空田同时正确展示');
  await click('[data-plot="3"]');
  check(await page.locator('[data-act="harvest"]').isDisabled(), '未成熟禁用单畦采收');
  const waitState = await ev(() => JSON.stringify(__cave.p.cave.garden));
  await c.wait(600);
  check(await ev(s => JSON.stringify(__cave.p.cave.garden) === s, waitState), '现实等待不推进生长、不自动采收');

  for (const [w,h] of [[1280,720],[960,540]]) {
    await page.setViewportSize({width:w,height:h});
    await page.waitForFunction(() => Math.abs(Number(document.querySelector('.cv-root').style.getPropertyValue('--k')) - Math.min(innerWidth/1280,innerHeight/720)) < .0001);
    await click('[data-plot="4"]');
    await click('[data-year="2"]');
    const seen=[];
    while (true) {
      seen.push(...await page.locator('[data-seed]').evaluateAll(es=>es.map(e=>e.dataset.seed)));
      if (await page.locator('[data-seed-page="next"]').isDisabled()) break;
      await click('[data-seed-page="next"]');
      if (seen.length > fixture.seeds.length + 2) throw new Error('药园分页未终止');
    }
    check(seen.length > 2 && new Set(seen).size === fixture.seeds.length && fixture.seeds.every(uid=>seen.includes(uid)), `${w}×${h}：全部草苗真实分页可达，无空样本`);
    await bounds(`${w}×${h} 满级及分页`);
    await shot(`garden_A_${w}_many`);
    await click('[data-act="garden-help"]');
    await page.locator('[data-garden-reader]').focus();
    await page.keyboard.press('End');
    check(await page.locator('.gy2-help-count').textContent() === '3 / 3', `${w}×${h}：砚台键盘 End 到第三页`);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    check(await page.locator('.gy2-help-count').textContent() === '2 / 3', `${w}×${h}：Home及方向键翻页`);
    await bounds(`${w}×${h} 园务说明`, 'help');
    await shot(`garden_A_${w}_help`);
    await page.keyboard.press('Escape');
    check(await ev(() => __cave.ui.cur === 'garden' && !document.querySelector('.gy2-modal') && !document.querySelector('.gy2-sheet').inert), 'Esc只关说明并恢复药园交互');
  }

  await click('[data-plot="0"]');
  const oneBefore = await totals();
  await click('[data-act="harvest"]');
  await receipt(oneBefore,1,'单畦采收');
  check(await ev(s => !__cave.p.cave.garden[0] && __cave.F.ripePlots(__cave.p).length === 2 && JSON.stringify(__cave.p.cave.garden[3]) === s, fixture.growing), '单采只清所选成熟畦，其余成熟和生长地块不变');
  await bounds('960×540 单采回执', 'receipt');
  await shot('garden_A_960_receipt_one');
  await page.keyboard.press('Escape');
  check(await ev(() => __cave.ui.cur === 'garden' && !document.querySelector('.gy2-modal')), '第一次Esc仅关闭单采回执');
  const allBefore = await totals();
  await click('[data-act="harvest-all"]');
  await receipt(allBefore,2,'全部采收');
  check(await ev(s => __cave.F.ripePlots(__cave.p).length === 0 && JSON.stringify(__cave.p.cave.garden[3]) === s,fixture.growing), '全采仅清剩余成熟地块，生长中不受影响');
  await bounds('960×540 多畦采收回执', 'receipt');
  await shot('garden_A_960_receipt_all');
  await page.keyboard.press('Escape');

  // 缺灵土时可看缺额，但不得扣料；取消施土后仍能正常移栽。
  await ev(() => { const p=__cave.p; p.storage.consume('ling_tu',p.storage.count('ling_tu')); __cave.changed(); });
  await click('[data-plot="0"]');
  await click('[data-year="2"]');
  await page.locator('[data-seed]').first().click();
  await page.locator('[data-garden-soil]').check();
  check(await page.locator('[data-act="plant"]').isDisabled() && (await page.locator('.gy2-soil').textContent()).includes('缺 '), '施土不足显示缺额并禁用移栽');
  const plant0 = await ev(() => ({seed:__cave.ui.sel.seed,n:__cave.p.storage.items.find(it=>it.uid===__cave.ui.sel.seed).n,soil:__cave.p.storage.count('ling_tu')}));
  await page.locator('[data-garden-soil]').uncheck();
  await click('[data-act="plant"]');
  check(await ev(s => { const p=__cave.p,it=p.storage.items.find(it=>it.uid===s.seed); return !!p.cave.garden[0] && !p.cave.garden[0].fert && (it?.n||0) === s.n-1 && p.storage.count('ling_tu') === s.soil; },plant0), '取消施土真实移栽仅扣一株草苗，不扣灵土');
  await ev(() => { __cdev.give(__cave.p,'灵土',30); __cave.changed(); });
  await click('[data-plot="1"]');
  await click('[data-year="2"]');
  await page.locator('[data-seed]').first().click();
  await page.locator('[data-garden-soil]').check();
  const plant1 = await ev(() => { const p=__cave.p,F=__cave.F,it=p.storage.items.find(it=>it.uid===__cave.ui.sel.seed); return {uid:it.uid,n:it.n,soil:p.storage.count('ling_tu'),cost:F.fertCost(p,it).n,need:F.runsNeeded(p,F.seedInfo(it).runs,it.rarity,true)}; });
  await click('[data-act="plant"]');
  check(await ev(s => { const p=__cave.p,F=__cave.F,it=p.storage.items.find(it=>it.uid===s.uid),pl=p.cave.garden[1]; return pl?.fert && (it?.n||0)===s.n-1 && s.soil-p.storage.count('ling_tu')===s.cost && F.plotState(p,pl).need===s.need; },plant1), '施土移栽真实扣苗、按年份扣土并采用现有提速规则');

  // 满级不提供确认升级；未搬迁三阶门槛仍由真实 upgradeInfo 决定。
  await click('[data-act="up-garden"]');
  check((await page.locator('.gy2-modal').textContent()).includes('满级') && !(await page.locator('[data-act="up-garden-go"]').count()), '满级扩建说明不出现可扣费按钮');
  await page.keyboard.press('Escape');
  await ev(() => { const p=__cave.p; p.cave.region='r1'; p.cave.facilities.garden=2; __cave.changed(); });
  await click('[data-act="up-garden"]');
  check(await page.locator('[data-act="up-garden-go"]').isDisabled() && (await page.locator('.gy2-modal').textContent()).includes('搬迁'), '未搬迁保留三阶扩建门槛');
  await page.keyboard.press('Escape');
  await ev(() => {
    const p=__cave.p,F=__cave.F;
    p.cave.facilities.garden=0; p.cave.garden.fill(null);
    for(const it of [...F.seeds(p)])p.storage.remove(it.uid);
    for(const x of F.costList(F.upgradeInfo(p,'garden').cost))p.storage.consume(x.id,p.storage.count(x.id));
    __cave.changed();
  });
  for (const [w,h] of [[1280,720],[960,540]]) {
    await page.setViewportSize({width:w,height:h});
    await page.waitForFunction(() => Math.abs(Number(document.querySelector('.cv-root').style.getPropertyValue('--k'))-Math.min(innerWidth/1280,innerHeight/720))<.0001);
    check(await page.locator('.gy2-plot').count() === 1 && await page.locator('[data-act="plant"]').isDisabled() && (await page.locator('.gy2-no-seeds').textContent()).includes('暂无'), `${w}×${h}：零阶一畦、无苗空态`);
    await bounds(`${w}×${h} 零阶无苗`);
    await shot(`garden_A_${w}_lv0_empty`);
    await click('[data-act="up-garden"]');
    check(await page.locator('[data-act="up-garden-go"]').isDisabled() && (await page.locator('.gy2-costs').textContent()).includes('缺 '), '费用不足显示真实缺额且无法确认');
    await bounds(`${w}×${h} 扩建费用不足`, 'upgrade');
    await shot(`garden_A_${w}_upgrade_short`);
    await page.keyboard.press('Escape');
  }
  await ev(() => {
    const p=__cave.p,F=__cave.F;
    for(const x of F.costList(F.upgradeInfo(p,'garden').cost))__cdev.give(p,x.name,x.n);
    __cave.changed();
  });
  const upBefore = await totals();
  await click('[data-act="up-garden"]');
  check(await ev(() => __cave.p.cave.facilities.garden === 0), '点击扩建只打开确认，不即时扣费升级');
  await page.keyboard.press('Escape');
  check(JSON.stringify(await totals()) === JSON.stringify(upBefore), '取消扩建库存完全不变');
  const costs = await ev(() => __cave.F.costList(__cave.F.upgradeInfo(__cave.p,'garden').cost).map(x=>({id:x.id,n:x.n,before:__cave.p.storage.count(x.id)})));
  await click('[data-act="up-garden"]');
  await click('[data-act="up-garden-go"]');
  check(await ev(cs => cs.length > 0 && __cave.p.cave.facilities.garden===1 && __cave.F.gardenPlots(__cave.p).length===2 && cs.every(x=>x.before-__cave.p.storage.count(x.id)===x.n),costs), '确认扩建才扣真实全部费用并开第二畦');

  const stable = await ev(async () => {
    const ui=__cave.ui,root=ui.page,first=root.querySelector('.gy2-sheet');
    let mutations=0,writes=0,reads=0;
    const observer=new MutationObserver(ms=>mutations+=ms.length);
    observer.observe(root,{subtree:true,childList:true,attributes:true,characterData:true});
    const html=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    const rect=Element.prototype.getBoundingClientRect;
    Object.defineProperty(Element.prototype,'innerHTML',{...html,set(v){if(root.contains(this))writes++;return html.set.call(this,v);}});
    Element.prototype.getBoundingClientRect=function(){if(root.contains(this))reads++;return rect.call(this);};
    try {for(let i=0;i<120;i++)ui.render();await Promise.resolve();}
    finally {Object.defineProperty(Element.prototype,'innerHTML',html);Element.prototype.getBoundingClientRect=rect;observer.disconnect();}
    return {mutations,writes,reads,same:ui.page===root&&first===root.querySelector('.gy2-sheet'),plots:root.querySelectorAll('.gy2-plot').length};
  });
  check(stable.plots > 0 && stable.same && stable.mutations===0 && stable.writes===0 && stable.reads===0, '120次同状态render：非空页面不重建、零DOM变更/innerHTML写/布局读取',stable);
  await click('[data-act="garden-help"]');
  const disposed = await ev(async () => {
    const ui=__cave.ui,old=ui.gardenView;
    ui.open('storage');
    const {escDepth}=await import('/src/ui/esc.js');
    return {alive:old.alive,modal:!!document.querySelector('.gy2-modal'),sheet:!!document.querySelector('.gy2-sheet'),depth:escDepth(),token:!!ui._gardenToken};
  });
  check(!disposed.alive && !disposed.modal && !disposed.sheet && !disposed.token && disposed.depth===0, '跨设施切换清理药园实例、弹层、Esc栈和加载token',disposed);
  await close();
  for(let i=0;i<3;i++){await open();await close();}
  check(await ev(async () => {const {escDepth}=await import('/src/ui/esc.js');return !__cave.ui.gardenView&&!__cave.ui._gardenToken&&!document.querySelector('.gy2-sheet,.gy2-modal')&&escDepth()===0;}), '反复开关不残留页面、实例或Esc层');
  check(!errors.length && !consoleErrors.length, '药园专项无pageerror及console error/warning', {errors,consoleErrors});
}
