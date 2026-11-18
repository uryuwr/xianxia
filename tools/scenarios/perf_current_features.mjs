// 当前版本专项，由 perf_probe 的 STAGES=weapon,garden 调用；不修改生产逻辑。
// 真实合法法剑 + Playwright左右键；固定高血量测试靶、强制暴击仅用于保证样本。
// off/on是当前版本装备配对，不是历史基线。药园走正式流程，不使用dev页替代主循环。
export async function currentFeatures(page, c, { record, results, stages, seconds }) {
  const checks = results.featureChecks = [];
  const check = (name, ok, info) => {
    checks.push({ name, ok: !!ok, info });
    c.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(info));
  };
  if (stages.includes('weapon')) {
    const rounds = Number(process.env.ROUNDS || 3);
    await page.mouse.move(640, 220);
    await c.ev(async () => {
      const G = __game, P = G.player, S = G.ctx.skills, h = P.entity;
      const { makeItem } = await import('/src/core/items.js');
      const { WEAPON_EFFECTS } = await import('/src/data/items.js');
      const A = window.__pfWeapon = { targets: [], counts: {}, samples: [], saved: {
        equip: G.profile.equip, build: G.profile.build, realm: G.profile.realm,
        loadout: { ...S.loadout, xinfa: [...S.loadout.xinfa] }, auto: G.ctx.enemies.auto, god: P.debug.god,
      } };
      G.run.clearEnemies(); G.ctx.enemies.auto = false; P.debug.god = true;
      G.profile.realm = { stage: 2, layer: 1 };
      G.profile.build = { ...G.profile.build, xinfa: [] };
      S.setLoadout({ artifact: { id: 'none', level: 1 }, xinfa: [] });
      A.cleanTargets = () => {
        for (const e of A.targets) {
          for (const id of [...e.statuses.keys()]) G.world.removeStatus(e, id);
          e.alive = false; G.world.remove(e);
        }
        A.targets.length = 0;
      };
      A.prepare = (effect, on) => {
        A.cleanTargets();
        G.profile.equip = { sword: makeItem('sword_qingfeng', { rarity: 3, identified: true,
          affixes: on ? [{ stat: 'special', type: 'flag', value: WEAPON_EFFECTS[effect].name, effect }] : [] }), robe: null, jade: null, artifact: null };
        G.ctx.applyProfileStats(G.profile);
        h.stats.removeSource('perfWeapon');
        h.stats.addAll([{ stat: 'crit', type: 'flat', value: 2 }, { stat: 'mom_wave', type: 'flat', value: 1 }], 'perfWeapon');
        const d = P.aimDir(new G.THREE.Vector3());
        for (const dist of [2, 7.3]) {
          const e = G.world.add({ id: 980000 + dist, team: 'enemy', pos: P.pos.clone().addScaledVector(d, dist), radius: .5, height: 1.5,
            alive: true, statuses: new Map(), tags: new Set(), hp: 1e7, owner: { flash() {} } });
          e.stats.setBase('hp', 1e7); A.targets.push(e);
        }
        P.momentum = 100;
        A.counts = { direct: 0, basic: 0, charge: 0, burn: 0, poison: 0, thunder: 0, burnStatus: 0, poisonStatus: 0, paralysis: 0 };
        A.samples = [];
        return { effect, on, rarity: G.profile.equip.sword.rarity, item: G.profile.equip.sword.id, marker: h.stats.get('wx_' + effect), targets: A.targets.length };
      };
      A.offDamage = G.world.events.on('damage', info => {
        if (info.attacker !== h || !A.targets.includes(info.target) || info.amount <= 0) return;
        const t = info.tags, n = A.counts;
        if (t.includes('basic') && !t.includes('dot') && !t.includes('weapon_proc')) {
          n.direct++; if (t.includes('charge')) n.charge++; else n.basic++;
        }
        if (t.includes('burn') && t.includes('dot')) n.burn++;
        if (t.includes('poison') && t.includes('weapon_proc')) n.poison++;
        if (t.includes('thunder') && t.includes('weapon_proc')) n.thunder++;
        if (A.samples.length < 8 && (t.includes('dot') || t.includes('weapon_proc'))) A.samples.push({ amount: info.amount, tags: [...t] });
      });
      A.offStatus = G.world.events.on('status', ({ target, status }) => {
        if (!A.targets.includes(target)) return;
        if (status.id === 'burn') A.counts.burnStatus++;
        if (status.id === 'weapon_poison') A.counts.poisonStatus++;
        if (status.id === 'stun' && status.data.weaponParalysis) A.counts.paralysis++;
      });
    });
    results.weaponMethod = { rounds, secondsPerArm: seconds, controls: '同版本同底材法剑，无奇效/单奇效；每轮交替顺序；两只固定高血量无模型测试靶；测试强制暴击；真实右键满势及左键；非历史基线、非完整怪物压力测试', pairs: [] };
    try {
      for (const effect of ['weapon_burn', 'weapon_poison', 'weapon_thunder']) {
        for (let round = 1; round <= rounds; round++) {
          const pair = { effect, round, stages: {} };
          for (const on of (round % 2 ? [false, true] : [true, false])) {
            await page.mouse.up({ button: 'left' });
            await page.waitForFunction(() => __game.player.state === 'move' && !__game.player.waves.length, null, { timeout: 15000 });
            await c.ev(() => __pfWeapon.cleanTargets());
            await c.wait(1000); // 排空上一臂短命粒子，不混入下一臂。
            const setup = await c.ev(([effect, on]) => __pfWeapon.prepare(effect, on), [effect, on]);
            const name = `${effect}_${on ? 'on' : 'off'}_${round}`;
            pair.stages[on ? 'on' : 'off'] = name;
            const r = await record(name, seconds, async k => {
              if (k === 0) await page.mouse.click(640, 220, { button: 'right' });
              if (k === 6) await page.mouse.down({ button: 'left' });
            }, { fixture: setup });
            await page.mouse.up({ button: 'left' });
            const observed = await c.ev(() => ({ counts: __pfWeapon.counts, samples: __pfWeapon.samples }));
            r.events = observed;
            const n = observed.counts;
            const nonempty = n.basic > 0 && n.charge > 0;
            const valid = !on ? n.burn + n.poison + n.thunder === 0 : effect === 'weapon_burn' ? n.burn > 0 && n.burnStatus > 0 : effect === 'weapon_poison' ? n.poison > 0 && n.poisonStatus > 0 : n.thunder > 0 && n.paralysis > 0;
            check(`${name}真实装备/左右键/非空奇效事件`, setup.targets === 2 && setup.marker === (on ? 1 : 0) && nonempty && valid, { setup, ...observed });
          }
          const a = results.stages[pair.stages.on], b = results.stages[pair.stages.off];
          pair.currentOnMinusOff = { cpuP95: +(a.cpu.p95 - b.cpu.p95).toFixed(3), drawP50: a.calls.p50 - b.calls.p50, drawMax: a.calls.max - b.calls.max,
            approximateAllocMBs: a.allocMBs === null || b.allocMBs === null ? null : +(a.allocMBs - b.allocMBs).toFixed(3) };
          results.weaponMethod.pairs.push(pair);
        }
      }
    } finally {
      await page.mouse.up({ button: 'left' });
      await c.ev(() => {
        const G = __game, A = __pfWeapon;
        A.offDamage(); A.offStatus(); A.cleanTargets();
        G.player.entity.stats.removeSource('perfWeapon');
        Object.assign(G.profile, { equip: A.saved.equip, build: A.saved.build, realm: A.saved.realm });
        G.ctx.applyProfileStats(G.profile); G.ctx.skills.setLoadout(A.saved.loadout);
        G.ctx.enemies.auto = A.saved.auto; G.player.debug.god = A.saved.god;
        delete window.__pfWeapon;
      });
    }
  }
  if (stages.includes('garden')) {
    await c.ev(async () => { __game.run.clearEnemies(); __game.profile.flags.tutorialDone = true; await __game.flow.go('cave'); });
    await page.waitForFunction(() => window.__cave?.active && !document.querySelector('.cv-loading'), null, { timeout: 120000 });
    const fixture = await c.ev(async () => {
      const cv = __cave, p = cv.p, F = cv.F;
      const { makeItem } = await import('/src/core/items.js');
      const { itemId } = await import('/src/game/cave/data.js');
      cv.ui.speech.clear();
      p.cave.facilities.garden = 3; p.cave.region = 'r2'; p.cave.garden.fill(null);
      for (const it of [...F.seeds(p)]) p.storage.remove(it.uid);
      for (const name of ['青灵草苗', '紫藤苗', '赤炎果苗']) p.storage.add(makeItem(itemId(name), { n: 12, rarity: 2 }));
      for (let i = 0; i < 3; i++) if (!F.plant(p, i, F.seeds(p)[0].uid)) throw new Error('成熟样本种植失败');
      p.stats.runs += Math.max(...p.cave.garden.slice(0, 3).map(pl => F.plotState(p, pl).left));
      if (!F.plant(p, 3, F.seeds(p)[0].uid)) throw new Error('生长样本种植失败');
      cv.changed();
      return { plots: F.gardenPlots(p).length, ripe: F.ripePlots(p).length, seeds: F.seeds(p).length };
    });
    check('药园非空五畦样本', fixture.plots === 5 && fixture.ripe === 3 && fixture.seeds === 3, fixture);
    await c.wait(2000);
    await record('garden_closed', seconds);
    await record('garden_open', seconds, async k => {
      if (k !== 0) return;
      const started = Date.now();
      await c.ev(() => { __cave.ui.speech.clear(); __cave.open('garden'); });
      await page.waitForSelector('.gy2-sheet [data-act="close"]');
      if (await page.locator('[data-act="guide-ok"]').count()) await page.locator('[data-act="guide-ok"]').click();
      results.gardenOpenWallMs = Date.now() - started; // 包含自动化往返，不当成纯JS耗时。
    });
    await c.ev(() => {
      const view = __cave.ui.gardenView;
      const A = window.__pfGarden = { renderMs: [], clickMs: [] };
      for (const [name, key] of [['render', 'renderMs'], ['onClick', 'clickMs']]) {
        const old = view[name];
        view[name] = function (...args) {
          const start = performance.now();
          try { return old.apply(this, args); }
          finally { A[key].push(performance.now() - start); }
        };
      }
    });
    await record('garden_stable', seconds);
    const stable = await c.ev(async () => {
      const ui = __cave.ui, root = ui.page, sheet = ui.gardenView.sheet;
      let mutations = 0, writes = 0, reads = 0;
      const observer = new MutationObserver(ms => mutations += ms.length);
      observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      const html = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML'), rect = Element.prototype.getBoundingClientRect;
      Object.defineProperty(Element.prototype, 'innerHTML', { ...html, set(v) { if (root.contains(this)) writes++; return html.set.call(this, v); } });
      Element.prototype.getBoundingClientRect = function () { if (root.contains(this)) reads++; return rect.call(this); };
      const start = performance.now();
      try { for (let i = 0; i < 120; i++) ui.render(); await Promise.resolve(); }
      finally { Object.defineProperty(Element.prototype, 'innerHTML', html); Element.prototype.getBoundingClientRect = rect; observer.disconnect(); }
      return { calls: 120, totalMs: performance.now() - start, mutations, writes, reads, same: root.querySelector('.gy2-sheet') === sheet, plots: root.querySelectorAll('.gy2-plot').length };
    });
    results.gardenStableRefresh = stable;
    check('药园120次非空稳定刷新零DOM写/重建/rect读取', stable.plots === 5 && stable.same && !stable.mutations && !stable.writes && !stable.reads, stable);
    await record('garden_interactions', Math.max(seconds, 14), async k => {
      if (k === 0) await page.locator('[data-plot="0"]').click();
      if (k === 1) await page.locator('[data-act="harvest"]').click();
      if (k === 2) {
        const got = await c.ev(() => __cave.ui.gardenView.receipt);
        check('药园真实采收非空回执', got?.length === 1 && got[0].items.length > 0 && got[0].items.every(i => i.n > 0), got);
        await page.keyboard.press('Escape');
      }
      if (k === 3) await page.locator('[data-plot="4"]').click();
      if (k === 4) await page.locator('[data-year="2"]').click();
      if (k === 5) await page.locator('[data-seed]').first().click();
      if (k === 6) await page.locator('[data-act="plant"]').click();
      if (k === 7) {
        const planted = await c.ev(() => !!__cave.p.cave.garden[4]);
        check('药园真实点击移栽', planted, { planted });
      }
      if (k === 8) await page.locator('[data-act="garden-help"]').click();
      if (k === 9) await page.locator('[data-help-page="next"]').click();
      if (k === 10) await page.keyboard.press('Escape');
    });
    results.gardenMethodTimings = await c.ev(() => __pfGarden);
    await c.ev(() => { window.__pfOldGarden = __cave.ui.gardenView; });
    await record('garden_close', seconds, async k => { if (k === 0) await page.keyboard.press('Escape'); });
    const clean = await c.ev(async () => {
      const { escDepth } = await import('/src/ui/esc.js');
      return { oldAlive: __pfOldGarden.alive, view: !!__cave.ui.gardenView, token: !!__cave.ui._gardenToken,
        dom: document.querySelectorAll('.gy2-sheet,.gy2-modal').length, esc: escDepth(), hold3d: !!__game.ctx.hold3d, locked: __cave.locked };
    });
    results.gardenCleanup = clean;
    check('药园关闭释放实例/DOM/Esc/3D暂停', !clean.oldAlive && !clean.view && !clean.token && !clean.dom && !clean.esc && !clean.hold3d && !clean.locked, clean);
    check('药园稳定段主循环实际零3D绘制', results.stages.garden_stable.renderedFrames === 0 && results.stages.garden_stable.calls.max === 0,
      { frames: results.stages.garden_stable.frames, rendered: results.stages.garden_stable.renderedFrames, calls: results.stages.garden_stable.calls });
    await c.ev(() => { delete window.__pfOldGarden; delete window.__pfGarden; });
  }
}
