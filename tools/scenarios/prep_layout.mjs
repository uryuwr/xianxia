// 已批准整装册四页签：只编写，主线程统一执行。
// node tools/run.mjs prep_layout "scene=cave&slot=3"
const ok = (cond, name, extra) => {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra === undefined ? "" : " " + JSON.stringify(extra)));
  if (!cond) process.exitCode = 1;
};
export default async function(page, c) {
  const caveHosts = () => c.ev(() => {
    const current = window.__cave?.ui.root, roots = [...document.querySelectorAll(".cv-root")];
    const describe = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el), host = el.closest(".cv-root");
      return { tag:el.tagName, cls:el.className, connected:el.isConnected,
        visible:el.checkVisibility ? el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) : r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden",
        display:s.display, visibility:s.visibility, opacity:s.opacity, rect:[r.x,r.y,r.width,r.height],
        hostIndex:roots.indexOf(host), currentHost:!!current && host === current, layer:el.closest(".mk-layer")?.className || null };
    };
    return { flow:window.__game?.flow.name, scene:document.body.dataset.scene, active:!!window.__cave?.active,
      currentRoot:describe(current), uniqueCurrent:roots.length === 1 && roots[0] === current,
      roots:roots.map(el=>({...describe(el),hudCount:el.querySelectorAll('[data-act="hud-loadout"]').length})),
      hud:[...document.querySelectorAll('[data-act="hud-loadout"]')].map(describe) };
  });
  const assertCaveHosts = async (label, expected) => {
    let ready = true;
    try {
      await page.waitForFunction(expected => {
        const cave = window.__cave, flow = window.__game?.flow, root = cave?.ui.root;
        return expected === 1
          ? flow?.name === "cave" && cave?.active && root?.isConnected && !root.querySelector(".cv-loading")
          : flow?.name === "prep" && !!flow.scenes.prep.root?.isConnected;
      }, expected, { timeout: expected === 1 ? 90000 : 15000, polling: 100 });
    } catch (e) {
      if (e.name !== "TimeoutError") throw e;
      ready = false;
    }
    const d = await caveHosts();
    const valid = ready && d.roots.length === expected && d.hud.length === expected && (expected === 1
      ? d.uniqueCurrent && d.hud[0].currentHost && d.currentRoot.connected
      : !d.active && !d.currentRoot?.connected);
    ok(valid, `${label}: 洞府宿主/HUD 数量 ${expected}，归属当前场景`, { ready, ...d });
    if (!valid) throw new Error(`${label}: 洞府宿主前提失败；保留残留 DOM，不继续用歧义定位器`);
  };
  // 量实际 img 而非仅量外框；等资源和有限入场动画结束后再截图。
  const portraitBounds = async (label) => {
    await page.waitForFunction(() => {
      const img = document.querySelector(".mk-prep .por img");
      return img?.complete && img.naturalWidth > 0;
    });
    const m = await c.ev(async () => {
      const root = document.querySelector(".mk-prep"), img = root.querySelector(".por img");
      await img.decode();
      await document.fonts.ready;
      await Promise.all(root.closest(".mk-layer").getAnimations({ subtree: true })
        .filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = el => { const r = el.getBoundingClientRect(); return { x:r.left, y:r.top, r:r.right, b:r.bottom, w:r.width, h:r.height }; };
      return { img:rect(img), por:rect(root.querySelector(".por")), left:rect(root.querySelector(".prep-left")), content:rect(root.querySelector(".prep-content")), footer:rect(root.querySelector(".footer")), viewport:[innerWidth,innerHeight], natural:[img.naturalWidth,img.naturalHeight], resultStyle:[...document.querySelectorAll("style")].some(s => s.textContent.includes(".mk-result .seg1")) };
    });
    const inside = (a,b) => a.x >= b.x-1 && a.y >= b.y-1 && a.r <= b.r+1 && a.b <= b.b+1;
    ok(!m.resultStyle && m.img.w > 0 && m.img.h > 0 && inside(m.img,m.por) && inside(m.img,m.left) && m.img.r < m.content.x && m.img.b < m.footer.y && inside(m.img,{x:0,y:0,r:m.viewport[0],b:m.viewport[1]}), `${label}: 未进结算的实际人物 img 不越左栏、不遮主区或底栏`, m);
    await c.shot(label + "_portrait");
  };
  await page.setViewportSize({ width: 1280, height: 720 });
  // 正常入口布局验收必须等当前洞府 enter 完成后才替换存档和离场。
  // 业务层“未 active 时 exit 不取消迟到 enter”的缺口未在本场景修复或验收。
  await assertCaveHosts("setup（首次 newGame 前）", 1);
  await c.ev(async () => {
    const { makeItem, ITEMS } = await import("/src/core/items.js");
    const P = __game.flow.newGame(3) || __game.profile;
    P.flags.tutorialDone = true; P.flags.unlockAll = true; P.stats.runs = 8;
    P.realm = { stage: 2, layer: 1 };
    Object.assign(P.unlocks, { spellSlots: 3, xinfaSlots: 2, artifactSlot: true, formationSlot: true, pillSlots: 2 });
    P.pack = { v: 1, q: {} };
    for (const id of ["huichun_dan", "huiqi_dan", "dundi_fu", "fu_metal", "fu_fire", "fu_water", "humai_dan", "ningshen_dan"])
      for (let rarity = 0; rarity < 3; rarity++) P.storage.add(makeItem(id, { n: 3, rarity }));
    const sword = Object.values(ITEMS).find(d => d.slot === "sword");
    for (let i = 0; i < 13; i++) P.storage.add(makeItem(sword.id, { rarity: i % 5, identified: true }));
    const artifact = Object.values(ITEMS).find(d => d.slot === "artifact");
    P.storage.add(makeItem(artifact.id, { identified: true }));
    await __game.flow.go("prep");
  });
  await page.waitForFunction(() => document.querySelector('[data-prep-tab="pack"]'));
  await assertCaveHosts("首次切 prep 后", 0);
  await portraitBounds("prep_1280x720");
  const pack = await c.ev(() => {
    const S = __game.flow.scenes.prep, all = new Set(), counts = [];
    const before = JSON.stringify(S.state.q);
    for (let i = 0; i < 20; i++) {
      const rows = [...S.root.querySelectorAll(".pack [data-item][data-q]")];
      rows.forEach(e => all.add(e.dataset.item + ":" + e.dataset.q));
      counts.push(S.root.querySelectorAll(".pack .prep-card").length);
      const b = S.root.querySelector('[data-id="pack-next"]');
      if (b.disabled || b.classList.contains("is-disabled")) break;
      b.click();
    }
    const grid = S.root.querySelector(".pack .prep-grid");
    return { count: all.size, nine: counts.every(n => n <= 9), pages: counts.length, kept: JSON.stringify(S.state.q) === before, noScroll: grid.scrollHeight <= grid.clientHeight + 2 && getComputedStyle(grid).overflowY !== "auto" };
  });
  ok(pack.count >= 24 && pack.pages >= 3 && pack.nine, "行囊完整库存按九格分页", pack);
  ok(pack.kept && pack.noScroll, "翻页不改预案、行囊无内部滚动", pack);

  for (const tab of ["pack", "gear", "gongfa", "quests"]) {
    await page.locator(`[data-prep-tab="${tab}"]`).click();
    const m = await c.ev(() => {
      const S = __game.flow.scenes.prep, root = S.root;
      const rect = sel => { const b = root.querySelector(sel).getBoundingClientRect(); return { x:b.left,y:b.top,r:b.right,b:b.bottom }; };
      const scroll = [...root.querySelectorAll(".prep-grid,.mk-ld-box .list")].some(e => e.scrollHeight > e.clientHeight + 2 || /auto|scroll/.test(getComputedStyle(e).overflowY));
      return { left:rect(".prep-left"),content:rect(".prep-content"),footer:rect(".footer"),viewport:[innerWidth,innerHeight],scroll };
    });
    ok(m.left.r < m.content.x && m.content.b < m.footer.y && m.footer.b <= m.viewport[1] && !m.scroll, `${tab}: 人物与底栏常驻且不遮主区、无列表滚动`, m);
  }
  const quests = await c.ev(() => {
    const S = __game.flow.scenes.prep;
    const rows = [...S.root.querySelectorAll("[data-quest]")];
    const ids = rows.slice(0,2).map(e=>e.dataset.quest);
    for (const id of ids) S.root.querySelector(`[data-quest="${id}"]`).click();
    const selected = [...S.state.quests]; S.setTab("pack"); S.setTab("quests");
    return { count:rows.length,selected,kept:JSON.stringify(selected)===JSON.stringify(S.state.quests) };
  });
  ok(quests.count === 3 && quests.selected.length === 2 && quests.kept, "三张委托可选两张，切签不丢选择", quests);

  const gear = await c.ev(() => {
    const S=__game.flow.scenes.prep, P=__game.profile;
    S.pickGear("sword");
    const expected=S.gearIn("sword").length+(P.equip.sword?1:0), ids=new Set();
    let last;
    for(let i=0;i<30;i++) {
      const cards=[...S.root.querySelectorAll("[data-gear-uid]")]; cards.forEach(e=>ids.add(e.dataset.gearUid)); last=cards.at(-1)?.dataset.gearUid;
      const next=S.root.querySelector('[data-id="gear-next"]'); if(next.disabled||next.classList.contains("is-disabled")) break; next.click();
    }
    const old=P.equip.sword?.uid;
    S.root.querySelector(`[data-gear-uid="${last}"] [data-id="gear-equip"]`).click();
    const equipped=P.equip.sword?.uid===last && !P.storage.items.some(e=>e.uid===last) && (!old || P.storage.items.some(e=>e.uid===old));
    S.pickGear("artifact");
    const targetArtifact=S.gearIn("artifact")[0].uid;
    S.root.querySelector(`[data-gear-uid="${targetArtifact}"] [data-id="gear-equip"]`).click();
    const artifact=P.equip.artifact?.uid;
    S.root.querySelector('[data-id="gear-off"]').click();
    return {all:ids.size===expected,expected,seen:ids.size,equipped,artifact:!!artifact&&!P.equip.artifact&&P.storage.items.some(e=>e.uid===artifact)};
  });
  ok(gear.all && gear.expected > 12 && gear.equipped, "法器六格分页包含尾页，换装真实进出仓库",gear);
  ok(gear.artifact,"法宝 V 入口可装备、卸下且回仓",gear);

  const pin = await c.ev(() => {
    const S=__game.flow.scenes.prep;
    S.setTab("gongfa"); S.lo.tab="spell";S.lo.renderBox();
    const entries=S.lo.entries(), target=entries.at(-1).id;
    S.lo.pinSource(target);
    const spell=!!S.lo.boxEl.querySelector(`[data-src-id="${target}"]`) && S.lo.pages.spell===Math.floor((entries.length-1)/6);
    const other=S.lo.entries("xinfa").at(-1).id; S.lo.pinSource(other);
    const cross=S.lo.tab==="xinfa" && !!S.lo.boxEl.querySelector(`[data-src-id="${other}"]`);
    const before=JSON.stringify(__game.profile.build); S.lo.hover={kind:"spell",id:"sword_qi"}; S.setTab("pack");
    dispatchEvent(new KeyboardEvent("keydown",{code:"KeyQ",bubbles:true}));
    return {spell,cross,hidden:!S.lo.active&&before===JSON.stringify(__game.profile.build)};
  });
  ok(pin.spell && pin.cross,"pinSource 跨功法类别与尾页定位",pin);
  ok(pin.hidden,"隐藏功法页不响应装配热键",pin);

  await page.locator('[data-id="prep-stats"]').click();
  ok(await c.ev(()=>!!document.querySelector(".prep-modal.stats-modal .mk-ss")),"属性按需打开，而非常驻");
  await page.locator('.prep-modal [data-stat="atk"]').click();
  await page.keyboard.press("Escape");
  ok(await c.ev(()=>!!document.querySelector(".prep-modal")&&!document.querySelector(".mk-ss-pop")),"Esc 只关属性明细");
  await page.keyboard.press("Escape");
  ok(await c.ev(()=>!document.querySelector(".prep-modal")&&__game.flow.name==="prep"),"再次 Esc 关属性，保留整装册");
  await c.ev(()=>__game.flow.scenes.prep.read("长说明键盘场景",Array.from({length:50},(_,i)=>`<p>第 ${i+1} 条说明。</p>`).join("")));
  await page.locator('.prep-modal input[type="range"]').focus();
  await page.keyboard.press("End");
  ok(await c.ev(()=>{const r=document.querySelector(".prep-modal .reader");return r.scrollTop>0&&r.scrollTop+r.clientHeight>=r.scrollHeight-2;}),"砚台 End 可到长说明末尾");
  await page.keyboard.press("Home");
  ok(await c.ev(()=>document.querySelector(".prep-modal .reader").scrollTop===0),"砚台 Home 回卷首");
  await page.keyboard.press("Escape");

  const pouch=await c.ev(()=>{
    const S=__game.flow.scenes.prep,P=__game.profile;
    S.pickPouch(); const count=document.querySelectorAll("[data-pouch-uid]").length;
    const btn=document.querySelector('[data-id="pouch-next"]'); const next=btn&&!btn.disabled&&!btn.classList.contains("is-disabled");
    if(next) btn.click();
    const uid=document.querySelector("[data-pouch-uid]")?.dataset.pouchUid, before=P.pouch.items.reduce((n,e)=>n+e.n,0);
    if(uid) document.querySelector(`[data-pouch-uid="${uid}"]`).click();
    return {count,next,moved:P.pouch.items.reduce((n,e)=>n+e.n,0)===before+1,closed:!document.querySelector(".prep-modal")};
  });
  ok(pouch.count===6&&pouch.next&&pouch.moved&&pouch.closed,"锦囊完整候选分页并真实移入",pouch);
  await c.shot("prep_tabs_final");
  await page.setViewportSize({ width: 960, height: 540 });
  await portraitBounds("prep_960x540");
  for (const tab of ["pack", "gear", "gongfa", "quests"]) {
    await page.locator(`[data-prep-tab="${tab}"]`).click();
    const bounds = await c.ev(() => {
      const root = __game.flow.scenes.prep.root;
      const clipped = [...root.querySelectorAll("button,.mk-ld-slot")].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1);
      }).map(el => el.textContent.slice(0, 30));
      const overflow = [...root.querySelectorAll(".prep-grid,.mk-ld-box .list")].some(el => el.scrollHeight > el.clientHeight + 2);
      return { clipped, overflow };
    });
    ok(!bounds.clipped.length && !bounds.overflow, `${tab}: 960×540 控件可见且列表不溢出`, bounds);
    await c.shot("low_" + tab);
  }
  const stable = await c.ev(async () => {
    const S = __game.flow.scenes.prep;
    const observer = new MutationObserver(() => {});
    observer.observe(S.root, { childList: true, attributes: true, subtree: true, characterData: true });
    const start = performance.now();
    for (let i = 0; i < 120; i++) S.render();
    const ms = performance.now() - start, changes = observer.takeRecords().length;
    observer.disconnect();
    return { changes, ms, calls: 120 };
  });
  ok(stable.changes === 0, "状态未变时重复 render 不写 DOM", stable);
  await page.setViewportSize({ width: 1280, height: 720 });
  // 同一轮始终不进入结算；从洞府真实 HUD 开内观，覆盖共享页的另一宿主。
  await page.locator('.mk-prep [data-id="back"]').click();
  await assertCaveHosts("返回 cave、开内观前", 1);
  await page.locator('[data-act="hud-loadout"]').click();
  await page.waitForFunction(() => !!document.querySelector(".mk-inner [data-prep-tab]") && !!__cave.ui.inner?.alive);
  await portraitBounds("inner_1280x720");
  await page.setViewportSize({ width: 960, height: 540 });
  await portraitBounds("inner_960x540");
  await page.locator('.mk-inner [data-id="back"]').click();
  await page.waitForFunction(() => !document.querySelector(".mk-inner") && !__cave.ui.cur);
  await page.setViewportSize({ width: 1280, height: 720 });
  await c.ev(() => __game.flow.go("prep"));
  await page.waitForFunction(() => __game.flow.name === "prep" && !!document.querySelector(".mk-prep:not(.mk-inner) [data-prep-tab]"));
  await assertCaveHosts("内观关闭后再切 prep", 0);
  const lifecycle=await c.ev(async()=>{
    const {makePrep}=await import("/src/ui/screens/prep.js");const flow=__game.flow;
    const late=makePrep(flow.ctx,{flow,inner:true}); const pending=late.enter(); late.exit(); await pending;
    const noLate=!document.querySelector(".mk-layer-inner .mk-prep");
    const S=flow.scenes.prep; S.state.region="r2"; __game.profile.flags.r2Confirmed=false;
    const before=__game.profile.storage.items.reduce((n,e)=>n+e.n,0);
    const depart=S.depart(); S.exit(); await depart;
    return {noLate,cancelled:flow.name==="prep"&&before===__game.profile.storage.items.reduce((n,e)=>n+e.n,0),modal:!document.querySelector(".prep-modal")};
  });
  ok(lifecycle.noLate&&lifecycle.cancelled&&lifecycle.modal,"迟到 enter 与待确认 depart 均在退出时取消",lifecycle);
}
