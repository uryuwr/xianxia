// UI 体检 v1 落地验证（UI 设计，2026-11-18）
//   截图：局内 HUD 满血 / 受击 / 残血 / 残血受击、敌人头顶血条与境界标签（普通 / 精英；平 / 高一层 / 高一境）、地面预警（扇形 / 直线 / 圆形）
//   对比度：按体检的"三张裁片"法量关键元素（A 前景隐藏、B 前景品红、C 原样），裁片写 work/_tj_impl/<TAG>/ + meta.json，
//          再跑 docs/review/ui/.venv/Scripts/python docs/ui/v3/体检_v1/measure_impl.py <TAG> 出 P10 / 中位
//   运行：TAG=after node tools/run.mjs ui_hud_v1 "scene=run&region=r1&slot=3"（TAG=before 时只截图 + 量，不做新功能断言）
// 冻结画面：world.timeScale = 0（玩法停、渲染照常），三张裁片之间背景不变。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default async function (page, c) {
  const TAG = process.env.TAG || "after";
  const NEW = TAG !== "before";
  const MD = path.join(ROOT, "work", "_tj_impl", TAG);
  fs.rmSync(MD, { recursive: true, force: true });
  fs.mkdirSync(MD, { recursive: true });
  const meta = {};
  const ok = (cond, msg) => c.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  const shot = (n) => c.shot(`${TAG}_${n}`);

  await page.mouse.move(980, 560);
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies && __game.ctx.enemies.ready, null, { timeout: 120000 });
  const at0 = await c.ev((pos) => {
    const G = __game, r = G.run;
    r.clearEnemies();
    r.nextWave = 1e9;
    // 站到关卡里一处刷怪点（地面纹理更接近实战；出生点在地图边缘、一半是纸白）；POS=x,z 指定固定位置（改前 / 改后同一处）
    const S = (r.map && r.map.points && r.map.points.spawns) || [];
    const s = S[Math.floor(S.length / 2)];
    const q = pos ? { x: pos[0], z: pos[1] } : s && (s.pos || s);
    if (q) {
      G.player.spawn(q.x, q.z);
      G.rig && G.rig.update && G.rig.update(1, !0);
    }
    // 只让测试伤害打到主角（敌人照常出招、但不掉血）
    G.ctx.world.events.on("beforeDamage", (i) => i.target === G.player.entity && !(i.spec && i.spec.test) && (i.cancel = !0));
    document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    return [+G.player.pos.x.toFixed(2), +G.player.pos.z.toFixed(2)];
  }, process.env.POS ? process.env.POS.split(",").map(Number) : null);
  c.log("hero at", JSON.stringify(at0));
  await c.wait(1500);
  await page.addStyleTag({ content: `
    .__mA,.__mA *{color:transparent!important}
    .__mAb{visibility:hidden!important}
    .__mB,.__mB *{color:#ff00ff!important;text-shadow:none!important}
    .__mBb{background:#ff00ff!important;opacity:1!important;animation:none!important;transition:none!important}
    .__still,.__still *{animation:none!important;transition:none!important}` });

  const freeze = (on) => c.ev((on) => (__game.ctx.world.timeScale = on ? 0 : 1), on);
  // 主角状态：k = 气血比例；hit = 先多给一点再打一下真实伤害（走 damage 事件，触发受击表现）
  const setHero = (k, hit) =>
    c.ev(([k, hit]) => {
      const G = __game, e = G.player.entity, M = e.stats.get("hp");
      e.hp = Math.round(M * k) + (hit ? 18 : 0);
      e.mp = e.stats.get("mp") * (k < 0.5 ? 0.4 : 0.7);
      G.player.momentum = 38;
      if (hit) G.ctx.world.dealDamage(null, e, { base: 18, test: !0, noCrit: !0 });
      return { hp: e.hp, max: M };
    }, [k, hit]);

  // ---- 三张裁片（DOM）：items = [{ name, sel, kind: "text" | "bar", box }] ----
  async function crops(job, items) {
    const list = [];
    await c.ev(() => document.querySelectorAll("#hud, .jx-ebars, .mk-layer-runhud, .jx-bar").forEach((e) => e.classList.add("__still")));
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const info = await c.ev((s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(e).fontSize) };
      }, it.sel);
      if (!info || info.w < 1 || info.h < 1) {
        c.log("skip", it.name, it.sel);
        continue;
      }
      const clip = { x: Math.max(0, Math.floor(info.x) - 2), y: Math.max(0, Math.floor(info.y) - 2) };
      clip.width = Math.min(Math.ceil(info.w) + 4, 1280 - clip.x);
      clip.height = Math.min(Math.ceil(info.h) + 4, 720 - clip.y);
      const base = path.join(MD, `${job}_${i}`);
      // sel 可写 "a | b"：取第一个存在的（改后敌人血条 A 只藏条身 .bm、留纸色笔带；改前没有笔带，藏整条 .bg）
      const tog = (cls, sel) => c.ev(([cls, sel]) => sel.split("|").map((s) => document.querySelector(s.trim())).find(Boolean).classList.toggle(cls), [cls, sel]);
      const bar = it.kind === "bar";
      await page.screenshot({ path: base + "_C.png", clip });
      await tog(bar ? "__mAb" : "__mA", bar ? it.box : it.sel);
      await c.wait(60);
      await page.screenshot({ path: base + "_A.png", clip });
      await tog(bar ? "__mAb" : "__mA", bar ? it.box : it.sel);
      await tog(bar ? "__mBb" : "__mB", it.sel);
      await c.wait(60);
      await page.screenshot({ path: base + "_B.png", clip });
      await tog(bar ? "__mBb" : "__mB", it.sel);
      list.push({ name: it.name, kind: it.kind, fs: info.fs, file: `${job}_${i}` });
    }
    await c.ev(() => document.querySelectorAll(".__still").forEach((e) => e.classList.remove("__still")));
    meta[job] = (meta[job] || []).concat(list);
  }

  // ---------- 1. 局内 HUD ----------
  await setHero(1, !1);
  await c.wait(900);
  await shot("full");
  await setHero(0.62, !0);
  if (NEW) {
    const st = await c.ev(
      () =>
        new Promise((res) =>
          requestAnimationFrame(() => {
            const e = document.getElementById("mk-hurtedge");
            res({ has: !!e, op: e ? +getComputedStyle(e).opacity : -1, vis: e ? getComputedStyle(e).visibility : "" });
          }),
        ),
    );
    ok(st.has && st.op > 0.3 && st.vis === "visible", `受击瞬间四缘淡朱墨闪一下 ${JSON.stringify(st)}`);
  }
  await shot("hit");
  await c.wait(900);
  if (NEW) {
    const st = await c.ev(() => {
      const e = document.getElementById("mk-hurtedge");
      return { op: +getComputedStyle(e).opacity, vis: getComputedStyle(e).visibility, low: document.getElementById("hud").classList.contains("low") };
    });
    ok((st.op < 0.02 || st.vis === "hidden") && !st.low, `闪完回到无四缘（62% 气血不算残血）${JSON.stringify(st)}`);
  }
  // 对比度：HUD 在 62% 气血、静止时量
  await freeze(!0);
  await c.wait(200);
  await shot("hud_measure");
  await crops("hud", [
    { name: "气血条", sel: "#hud .hp .fill", kind: "bar", box: "#hud .hp .bar" },
    { name: "真气条", sel: "#hud .mp .fill", kind: "bar", box: "#hud .mp .bar" },
    { name: "气势条", sel: "#hud .mom .mb > i", kind: "bar", box: "#hud .mom .mb" },
    { name: "气血数值", sel: "#hud .hp .val", kind: "text" },
    { name: "天时小字", sel: ".mk-tod .sub", kind: "text" },
    { name: "估价大数", sel: ".mk-val .n", kind: "text" },
    { name: "储物袋小字", sel: ".mk-val .s", kind: "text" },
    { name: "镜下方位", sel: ".mk-mirror-w .cap", kind: "text" },
    { name: "机缘", sel: ".mk-quests .fo", kind: "text" },
    { name: "技能解锁字", sel: ".jx-slot.hud-skill > .ct small", kind: "text" },
    { name: "境界小字", sel: ".mk-realm .r small", kind: "text" },
    { name: "本局感悟", sel: ".mk-realm .n", kind: "text" },
  ]);
  if (NEW) {
    // 静止时 HUD 不写 DOM（性能规范 §7.5）
    const muts = await c.ev(
      () =>
        new Promise((res) => {
          let n = 0;
          const mo = new MutationObserver((l) => (n += l.length));
          for (const s of ["#hud", "#mk-hurtedge", ".mk-layer-runhud"]) {
            const e = document.querySelector(s);
            e && mo.observe(e, { attributes: !0, childList: !0, subtree: !0, characterData: !0 });
          }
          setTimeout(() => (mo.disconnect(), res(n)), 1500);
        }),
    );
    ok(muts === 0, `静止 1.5 秒 HUD / 四缘层 DOM 写入 = ${muts}`);
  }
  await freeze(!1);

  await setHero(0.24, !1);
  await c.wait(900);
  await shot("low");
  if (NEW) {
    const st = await c.ev(() => {
      const e = document.getElementById("mk-hurtedge"), h = document.getElementById("hud");
      return { low: h.classList.contains("low"), on: e.classList.contains("on"), op: +getComputedStyle(e).opacity, lbl: getComputedStyle(h.querySelector(".hp .lbl")).color };
    });
    ok(st.low && st.on && st.op > 0.5, `残血（24%）：#hud.low + 四缘常驻 ${JSON.stringify(st)}`);
  }
  await setHero(0.2, !0);
  await c.wait(70);
  await shot("low_hit");
  await c.wait(600);
  await setHero(1, !1);
  await c.wait(500);
  if (NEW) {
    const st = await c.ev(() => ({ low: document.getElementById("hud").classList.contains("low"), on: document.getElementById("mk-hurtedge").classList.contains("on") }));
    ok(!st.low && !st.on, `回满后残血状态解除 ${JSON.stringify(st)}`);
  }

  // ---------- 2. 敌人头顶血条 + 境界标签 ----------
  const sp = await c.ev(async () => {
    const G = __game, E = G.ctx.enemies, P = G.player, V = P.pos.constructor;
    // 境界标签三档要有"平 / 高一层 / 高一境"：把主角境界设成练气三层（只影响标签显示）
    if (G.profile) G.profile.realm = { stage: 1, layer: 3 };
    const me = G.profile.realm;
    const at = { w: [4.6, -0.6], el: [-4.6, -2.2], g: [0.6, 3.6] };
    const mk = (type, k, realm) => {
      const e = E.spawn(type, new V(P.pos.x + at[k][0], P.pos.y, P.pos.z + at[k][1]), { region: "r1", forceElite: !0 });
      for (const q in e.cool) e.cool[q] = 99;
      if (realm) e.realm = () => realm;
      return e;
    };
    const w = mk("wolf", "w", { stage: me.stage, layer: me.layer + 2 });
    const el = mk("wolf_elite", "el", { stage: me.stage + 1, layer: 1 });
    const g = mk("golem", "g", null);
    for (const e of [w, el, g]) e.setAggro && e.setAggro("wave");
    await new Promise((r) => setTimeout(r, 500));
    G.ctx.world.timeScale = 0; // 停住，摆回原位、面向主角
    const T = { w, el, g };
    for (const k in T) {
      const e = T[k];
      e.pos.x = P.pos.x + at[k][0];
      e.pos.z = P.pos.z + at[k][1];
      e.yaw = e.wantYaw = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
    }
    w.entity.hp = Math.round(w.entity.stats.get("hp") * 0.45);
    g.entity.hp = Math.round(g.entity.stats.get("hp") * 0.3);
    el.entity.hp = Math.round(el.entity.stats.get("hp") * 0.7);
    if (el.entity.shield) el.entity.shield.hp = el.entity.shield.max * 0.6;
    for (const e of [w, el, g]) E.bars.touch(e);
    window.__tj = { w, el, g };
    return { me, elite: !!el.entity.tags.has("elite"), shield: el.entity.shield && el.entity.shield.element };
  });
  c.log("spawn", JSON.stringify(sp));
  await c.wait(400);
  await freeze(!0);
  await c.wait(900); // 境界标签 0.5 秒刷新一次；余迹追上
  await shot("enemies");
  const eb = await c.ev(() =>
    [...document.querySelectorAll(".jx-ebar")].map((d) => ({ cls: d.className, op: d.style.opacity, rl: (d.querySelector(".rl") || {}).className, txt: d.textContent.trim() })),
  );
  c.log("bars", JSON.stringify(eb));
  // 给三条血条加专用 id，方便取裁片
  await c.ev(() => {
    const T = window.__tj, B = __game.ctx.enemies.bars.bars;
    for (const [k, e] of Object.entries(T)) {
      const b = B.get(e);
      if (b) b.d.id = "__eb_" + k;
    }
  });
  await crops("enemy", [
    { name: "敌人血条", sel: "#__eb_w .fill", kind: "bar", box: "#__eb_w .bm | #__eb_w .bg" },
    { name: "敌人血条·石傀", sel: "#__eb_g .fill", kind: "bar", box: "#__eb_g .bm | #__eb_g .bg" },
    { name: "精英血条", sel: "#__eb_el .fill", kind: "bar", box: "#__eb_el .bm | #__eb_el .bg" },
    { name: "境界标签·高一层", sel: "#__eb_w .rl", kind: "text" },
    { name: "境界标签·高一境", sel: "#__eb_el .rl", kind: "text" },
    { name: "敌名", sel: "#__eb_w .name", kind: "text" },
  ]);
  if (NEW) {
    const cs = await c.ev(() => {
      const f = document.querySelector("#__eb_el .fill"), seal = document.querySelector("#__eb_el .seal");
      return { fill: getComputedStyle(f).backgroundImage, seal: seal ? getComputedStyle(seal).display : "none" };
    });
    ok(!/138, 90, 184|90, 46, 134/.test(cs.fill) && cs.seal !== "none", `精英血条去掉紫色、带"精"印 ${JSON.stringify(cs)}`);
  }
  await freeze(!1);

  // ---------- 3. 地面预警 ----------
  const tl = await c.ev(async () => {
    const G = __game, P = G.player, T = window.__tj;
    // 三种预警朝外摊开（不叠在主角身上）：瞄准"从主角指向敌人"的方向 3 米处
    const go = (e, id) => {
      const a = e.def.attacks.find((x) => x.id === id);
      for (const k in e.cool) e.cool[k] = 0;
      const d = e.pos.clone().sub(P.pos).setY(0).normalize();
      e.startAttack(a, e.pos.clone().addScaledVector(d, 3));
      return a.windup;
    };
    G.ctx.world.timeScale = 1;
    const ws = [go(T.w, "claw"), go(T.el, "bite"), go(T.g, "slam")];
    await new Promise((r) => setTimeout(r, Math.min(...ws) * 600));
    G.ctx.world.timeScale = 0;
    return { ws, fx: G.ctx.enemies.fx.items.length, rings: G.ctx.vfx.items.filter((it) => it.mesh.material.uniforms && it.mesh.material.uniforms.uFill && it.mesh.material.uniforms.uFill.value > 0).length };
  });
  c.log("tele", JSON.stringify(tl));
  await c.wait(300);
  await shot("tele");
  // 3D 裁片：A = 外缘去掉（新：外缘改纸色 ≈ 只剩纸色外描；旧：整块预警隐藏），B = 外缘染品红，C = 原样
  await c.ev(() => {
    const G = __game, fx = G.ctx.enemies.fx.items.map((it) => it.mesh), rg = G.ctx.vfx.items.filter((it) => it.mesh.material.uniforms && it.mesh.material.uniforms.uFill && it.mesh.material.uniforms.uFill.value > 0).map((it) => it.mesh);
    const kind = (m) => (/uHalf/.test(m.material.fragmentShader) ? "扇形预警外缘" : /uFill/.test(m.material.fragmentShader) ? "圆形预警外缘" : "直线预警外缘");
    window.__tel = [...fx, ...rg].map((m) => ({ m, name: kind(m), col: m.material.uniforms.uColor.value.clone(), rim: m.material.uniforms.uRim && m.material.uniforms.uRim.value.clone() }));
    window.__telSet = (i, mode) => {
      // 新：外缘线色在 uRim（A 把外缘线涂成纸色 ≈ 只剩纸色外描；B 外缘线品红）；旧：A 整块隐藏、B 整块品红
      const t = window.__tel[i], u = t.m.material.uniforms, neo = !!u.uRim;
      t.m.visible = !0;
      u.uColor.value.copy(t.col);
      if (neo) u.uRim.value.copy(t.rim);
      const tgt = neo ? u.uRim.value : u.uColor.value;
      if (mode === "A") neo ? tgt.set(0xf5f0e3) : (t.m.visible = !1);
      if (mode === "B") tgt.setRGB(1, 0, 1);
    };
  });
  const tels = await c.ev(() => window.__tel.map((t) => t.name));
  c.log("tele items", JSON.stringify(tels));
  const tlist = [];
  for (let i = 0; i < tels.length; i++) {
    const base = path.join(MD, `tele_${i}`);
    for (const m of ["C", "A", "B"]) {
      await c.ev(([i, m]) => window.__telSet(i, m), [i, m]);
      await c.wait(120);
      await page.screenshot({ path: `${base}_${m}.png` });
    }
    await c.ev((i) => window.__telSet(i, "C"), i);
    tlist.push({ name: tels[i], kind: "bar", fs: 0, file: `tele_${i}` });
  }
  meta.tele = tlist;
  await freeze(!1);
  fs.writeFileSync(path.join(MD, "meta.json"), JSON.stringify(meta, null, 1));
  c.log("meta", path.join(MD, "meta.json"));
  const errs = await c.ev(() => (window.__errors || []).length);
  ok(errs === 0, "no runtime errors " + errs);
}
