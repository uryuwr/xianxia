// 三张出行地图（?scene=run）：教学局 / 区域一 / 区域二。检查关卡点位接入（教学步骤、采集标签、灵光点、精英、夜潮、巡游）并截图。
// 用法：node tools/run.mjs loop_flow_levels scene=run
const ok = (cond, msg, extra) => {
  console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
  if (!cond) process.exitCode = 1;
  return cond;
};

export default async function (page, c) {
  await page.routeWebSocket(/./, () => {}); // 屏蔽 HMR，避免并行开发时整页刷新
  const base = new URL(page.url()).origin;
  for (const [region, slot] of [["tutorial", 1], ["r1", 2], ["r2", 3]]) {
    await page.goto(`${base}/?scene=run&region=${region}&slot=${slot}`, { waitUntil: "commit", timeout: 90000 });
    await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play", null, { timeout: 90000 });
    await c.wait(2500);
    const info = await c.ev(() => {
      const r = __game.run, P = r.map.points;
      const sw = r.pickups.list.find((p) => p.inst.id === "rust_sword");
      const step = (P.steps || []).find((q) => q.id === "sword");
      return {
        kind: r.map.kind,
        steps: (P.steps || []).length,
        swordAtStep: !!(sw && step && Math.hypot(sw.x - step.pos.x, sw.z - step.pos.z) < 1.5),
        gathers: r.marks.filter((m) => m.kind === "gather").map((m) => m.label),
        chests: r.marks.filter((m) => m.kind === "chest").length,
        extracts: r.extracts.map((x) => x.kind),
        enemies: __game.ctx.enemies.list.length,
        elites: __game.ctx.enemies.list.filter((e) => e.entity.tags.has("elite")).length,
        night: (P.night || []).length,
        patrols: (P.patrols || []).length,
        encounters: (P.encounters || []).length,
        relics: (P.relics || []).length,
      };
    });
    console.log(region, JSON.stringify(info));
    if (region === "tutorial") ok(info.kind === "level" && info.steps >= 15 && info.extracts.includes("cave") && (await c.ev(() => !!__game.run.pro && __game.run.pro.active)), "tutorial: prologue engine on level steps, cave extract", info);
    else {
      ok(info.kind === "level" && info.gathers.length > 0 && !info.gathers.every((l) => l === "灵草"), `${region}: gathers labelled from level data`, info.gathers.slice(0, 6));
      ok(info.elites > 0 && info.night > 0 && info.patrols >= 0, `${region}: elites spawned, night points loaded`, { elites: info.elites, night: info.night, patrols: info.patrols });
      // 开一个宝箱：关卡箱子模型应被藏起
      const ch = await c.ev(() => {
        const r = __game.run, m = r.marks.find((q) => q.kind === "chest");
        if (!m) return { none: !0 };
        __game.player.spawn(m.pos.x, m.pos.z);
        r.interact(m);
        return { hidden: !!(m.point && m.point.object && m.point.object.visible === !1) || !(m.point && m.point.object), drops: r.pickups.list.length };
      });
      ok(ch.none || ch.hidden, `${region}: opened chest consumed in level`, ch);
      await c.wait(500);
      const left = await c.ev(() => {
    return (() => {
    const hits = [];
    const seen = (el) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return !1;
        if (p.classList && p.classList.contains("mk-layer-loot")) return !1; // 格子窗标题属正常显示
      }
      return !0;
    };
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          if (/宝箱/.test(n.textContent) && n.parentElement && seen(n.parentElement)) hits.push(n.textContent.trim().slice(0, 40));
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(document.body);
    return hits.length ? hits.slice(0, 4) : null;
  })();
  });
      ok(!left, `${region}: no '宝箱' prompt on screen 0.5 s after opening`, left);
      // 午后巡游精英
      const pa = await c.ev(() => {
        const r = __game.run;
        r.t = r.R.phases[0] + 1;
        return null;
      });
      await c.wait(600);
      const pat = await c.ev(() => ({ n: (__game.run.patrols || []).length, want: (__game.run.map.points.patrols || []).length }));
      ok(pat.n >= Math.min(1, pat.want), `${region}: patrol elites spawned at noon`, pat);
      await c.ev(() => {
        const r = __game.run;
        __game.player.spawn(r.map.points.entries[0].x, r.map.points.entries[0].z);
        r.t = 5;
      });
      await c.wait(800);
    }
    await c.shot(region);
  }
  const errs = await c.ev(() => window.__errors);
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
