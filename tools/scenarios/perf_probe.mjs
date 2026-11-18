// 性能探针：出行局各场景的 CPU 主循环耗时、GPU 耗时、各模块拆分、尖峰原因、GC（堆增长率）。
// 用法：node tools/run.mjs perf_probe "scene=run&region=r1&slot=3"（r2 同理）
//   环境变量（tools/run.mjs）：IGPU=1（请求低功耗GPU，实际以ENV为准）、DPR=1.25（系统缩放）；本场景：W/H（视口）、HEADED=1（有头）、STAGES=open,veg,combat,boss,night,bag,map,switch,weapon,garden（选跑；weapon/garden见perf_current_features.mjs；boss = 青牙首领战，需 region=r1，默认不跑；bossfirst = 首领战首次绘制成本，单独跑）、
//            SEC=5（每段采样秒数）、ABLATE=1（渲染消融：关阴影 / 降分辨率 / 关 MSAA / 关后期，静止画面测 GPU）、
//            CPU=4（CDP 降速 CPU）、QUALITY=high|medium|low（先切画质档位再测）、OUT=work/perf/xxx.json（结果另存）
// 输出：每段 p50 / p95 / max（cpu = 主循环一帧的 JS 耗时，gpu = 一帧的 GPU 耗时，raf = 帧间隔），模块均值，最慢 3 帧的模块拆分。
import fs from "node:fs";
import path from "node:path";

export default async function (page, c) {
  const SEC = Number(process.env.SEC || 5);
  const STAGES = (process.env.STAGES || "open,veg,combat,night,bag,map,switch").split(",");
  const cdp = await page.context().newCDPSession(page);
  if (process.env.CPU) await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU) }); // 模拟笔记本 CPU（4 = 慢 4 倍）
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await page.mouse.move(700, 300);
  // QUALITY=orig：还原优化前的渲染配置（像素比 min(dpr, 2)、原始水墨着色器；4×MSAA / 4096 阴影 / 全植被同"高"）做对照
  const Q = process.env.QUALITY;
  if (Q) await c.ev((q) => __game.setQuality && __game.setQuality(q === "orig" ? "high" : q), Q);
  if (Q === "orig") {
    const orig = fs.readFileSync("work/perf_backup/ink_frag_orig.glsl", "utf8");
    await c.ev(async (orig) => {
      const { NOISE } = await import("/src/render/glsl.js");
      const m = __game.ink.mat;
      m.fragmentShader = orig.replace("//NOISE", NOISE);
      m.needsUpdate = !0;
      __game.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      dispatchEvent(new Event("resize"));
    }, orig);
  }
  // 固定入口（开阔地对比用）：第一个入口
  await c.ev(() => {
    const e = __game.run.map.points.entries[0];
    if (e) __game.player.spawn(e.x, e.z), __game.rig.update(1, !0);
  });
  await c.wait(1500);

  // ---------------- 页面内探针 ----------------
  const env = await c.ev(async () => {
    const G = __game, ctx = G.ctx, R = G.renderer, gl = R.getContext();
    const now = () => performance.now();
    const P = (window.__perf = { frames: [], cur: null, rec: !1, gpuMode: "none", q: [], free: [], seen: new Set(R.info.programs || []) });
    const wrapped = [];
    const wrap = (obj, name, label) => {
      if (!obj || typeof obj[name] !== "function") return;
      const f = obj[name];
      if (f.__pw) return;
      const w = function (...a) {
        const cur = P.cur;
        if (!cur) return f.apply(this, a);
        const t = now();
        try {
          return f.apply(this, a);
        } finally {
          cur.m[label] = (cur.m[label] || 0) + now() - t;
        }
      };
      w.__pw = 1;
      obj[name] = w;
      wrapped.push(label);
    };
    // 帧边界：input.update 是主循环第一步，input.endFrame 是最后一步
    const inp = ctx.input;
    const iu = inp.update, ie = inp.endFrame;
    let lastStart = 0;
    inp.update = function (...a) {
      const t = now();
      P.calls = 0; P.tris = 0;
      P.cur = { t0: t, raf: lastStart ? t - lastStart : 0, m: {}, rendered: false, heap: performance.memory ? performance.memory.usedJSHeapSize : null };
      lastStart = t;
      return iu.apply(this, a);
    };
    inp.endFrame = function (...a) {
      const r = ie.apply(this, a);
      const cur = P.cur;
      if (cur) {
        cur.cpu = now() - cur.t0 - (cur.finish || 0);
        cur.calls = P.calls;
        cur.tris = P.tris;
        cur.progs = R.info.programs ? R.info.programs.length : 0;
        // 新编译的着色器程序（尖峰原因）
        for (const pg of R.info.programs || [])
          if (!P.seen.has(pg)) {
            P.seen.add(pg);
            P.nNew = (P.nNew || 0) + 1;
            if (P.rec) (cur.newProgs ||= []).push(whoUses(pg));
          }
        cur.geos = R.info.memory.geometries;
        cur.texs = R.info.memory.textures;
        cur.nEnemies = ctx.enemies.list.length;
        if (P.rec) P.frames.push(cur);
        P.cur = null;
      }
      pollGpu();
      return r;
    };
    // 哪个网格的材质用了这个程序
    const whoUses = (pg) => {
      let hit = null;
      G.scene.traverse((o) => {
        if (hit || !o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const pp = R.properties.get(m);
          if (pp.currentProgram === pg || (pp.programs && [...pp.programs.values()].includes(pg))) {
            let a = o, path = [];
            while (a && a !== G.scene && path.length < 3) path.unshift(a.name || a.type), (a = a.parent);
            hit = path.join("/") + ":" + m.type + (m.name ? "(" + m.name + ")" : "");
            break;
          }
        }
      });
      return hit || "?" + (pg.name || "") + "#" + (pg.cacheKey || "").slice(0, 400).replace(/,/g, ";");
    };
    // 模块
    const S = ctx.skills, E = ctx.enemies, run = G.run;
    wrap(ctx.player, "update", "player");
    wrap(E, "update", "enemies");
    if (E.list[0]) {
      const EP = Object.getPrototypeOf(E.list[0]);
      wrap(EP, "update", "enemies.each");
    }
    wrap(E.nav, "flow", "nav.flow");
    wrap(E.bars, "update", "enemies.bars");
    wrap(E.fx, "update", "enemies.fx");
    wrap(E.proj, "update", "enemies.proj");
    wrap(S, "update", "skills");
    wrap(S.ui, "update", "skills.ui(bar)");
    wrap(S.fx, "update", "skills.fx");
    wrap(S.targeting, "update", "skills.targeting");
    wrap(S.targeting, "handleInput", "skills.targetInput");
    wrap(S.panel, "update", "skills.panel");
    wrap(ctx.shields, "update", "shields");
    wrap(ctx.vfx, "update", "vfx");
    wrap(ctx.feedback, "update", "feedback");
    wrap(G.flow, "update", "flow");
    wrap(G.flow.debug, "update", "flow.debug");
    wrap(run, "update", "run");
    wrap(run.map, "update", "run.map");
    wrap(run.map, "setTimeOfDay", "run.tod");
    wrap(run.pickups, "update", "run.pickups");
    if (run.quests) wrap(run.quests, "update", "run.quests");
    const RS = G.flow.scenes.run;
    wrap(RS.hudUI, "update", "hud(runhud)");
    if (RS.hudUI && RS.hudUI.gather) wrap(RS.hudUI.gather, "update", "hud.gather");
    wrap(RS.bagUI, "update", "bagui");
    wrap(RS.proUI, "update", "proUI");
    wrap(G.rig, "update", "camera");
    wrap(ctx.world, "step", "world.step");
    wrap(ctx.world, "query", "world.query");
    wrap(G.ink, "render", "render");
    wrap(R.shadowMap, "render", "render.shadow");
    // 其他每帧的 HUD（hud.js / momentum / cursor 自己挂 rAF 的话不在主循环里，单独计时）
    for (const k of Object.keys(ctx)) {
      const o = ctx[k];
      if (o && typeof o === "object" && typeof o.update === "function" && !["player", "enemies", "skills", "shields", "vfx", "feedback", "flow", "rig", "input", "world"].includes(k)) wrap(o, "update", "ctx." + k);
    }
    // 渲染统计：主场景那一次 render 后的 info
    const rr = R.render;
    R.render = function (scene, cam) {
      const r = rr.call(this, scene, cam);
      if (P.cur && scene === G.scene) {
        P.cur.rendered = true;
        P.calls += R.info.render.calls;
        P.tris += R.info.render.triangles;
      } // 主场景含阴影，不含水墨全屏pass；hold3d帧为0，禁止沿用上帧。
      return r;
    };
    // GPU：仅有效timer query可报告GPU时间；无扩展不插入同步等待。
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const ir = G.ink.render;
    if (ext) {
      P.gpuMode = "timer";
      G.ink.render = function (...a) {
        const q = P.free.pop() || gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        try {
          return ir.apply(this, a);
        } finally {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          P.q.push({ q, f: P.cur });
        }
      };
    } else {
      P.gpuMode = "unsupported";
    }
    // GPU 基准：同一帧背靠背渲染 K 次（让 GPU 保持高频，计时稳定），返回每帧 GPU 时间与提交耗时
    P.bench = async (K = 30) => {
      const sc = G.scene, cam = G.camera, t = G.ink.mat.uniforms.uTime.value;
      const one = () => ir.call(G.ink, sc, cam, t);
      for (let i = 0; i < 6; i++) one();
      gl.finish();
      const qs = [];
      const t0 = now();
      for (let i = 0; i < K; i++) {
        const q = ext ? gl.createQuery() : null;
        if (ext) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        one();
        if (ext) gl.endQuery(ext.TIME_ELAPSED_EXT), qs.push(q);
      }
      const submit = (now() - t0) / K;
      gl.finish();
      const wall = (now() - t0) / K;
      let gpu = null;
      if (ext) {
        for (let k = 0; k < 40 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE); k++) await new Promise((r) => setTimeout(r, 25));
        if (qs.every(q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          const v = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((a, b) => a - b);
          gpu = v[v.length >> 1];
        }
        qs.forEach((q) => gl.deleteQuery(q));
      }
      return { gpu: gpu && +gpu.toFixed(2), wall: +wall.toFixed(2), submit: +submit.toFixed(2) };
    };
    // 场景统计：可见网格按名字 / 类型归类的三角形数、绘制数、投影数
    P.sceneStats = () => {
      const groups = new Map();
      let casters = 0, casterTris = 0, meshes = 0;
      const mats = new Set();
      G.scene.traverseVisible((o) => {
        if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
        meshes++;
        const g = o.geometry, idx = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
        const n = o.isInstancedMesh ? o.count : 1;
        const tris = (o.isMesh ? idx / 3 : 0) * n;
        let a = o, path = [];
        while (a && a !== G.scene && path.length < 3) path.unshift(a.name || a.type), (a = a.parent);
        const key = (o.isInstancedMesh ? "I:" : "") + (o.name || (o.parent && o.parent.name) || g.type) + "|" + (Array.isArray(o.material) ? "multi" : o.material.type);
        const r = groups.get(key) || { draws: 0, tris: 0, path: path.join("/") };
        r.draws++;
        r.tris += tris;
        groups.set(key, r);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
        if (o.castShadow) (casters++, (casterTris += tris));
      });
      const top = [...groups.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, 14).map(([k, v]) => `${k} d${v.draws} t${Math.round(v.tris / 1000)}k`);
      return { meshes, materials: mats.size, casters, casterTrisK: Math.round(casterTris / 1000), top };
    };
    P.sun = () => {
      let L = null;
      G.scene.traverseVisible((o) => o.isDirectionalLight && o.castShadow && !L && (L = o));
      return L || ctx.sun;
    };
    function pollGpu() {
      if (!ext) return;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const it of P.q) gl.deleteQuery(it.q);
        P.q.length = 0;
        return;
      }
      while (P.q.length) {
        const it = P.q[0];
        if (!gl.getQueryParameter(it.q, gl.QUERY_RESULT_AVAILABLE)) break;
        const dis = gl.getParameter(ext.GPU_DISJOINT_EXT);
        const ns = gl.getQueryParameter(it.q, gl.QUERY_RESULT);
        if (it.f && !dis) it.f.gpu = ns / 1e6;
        P.q.shift();
        P.free.push(it.q);
      }
    }
    // 长任务（主线程 > 50ms，包括主循环外的 DOM / GC / shader 编译）
    P.long = [];
    P.longSupported = PerformanceObserver.supportedEntryTypes?.includes("longtask") || false;
    if (P.longSupported) {
      P.longObserver = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) P.long.push({ start: e.startTime, duration: e.duration });
      });
      P.longObserver.observe({ type: "longtask", buffered: !1 });
    }
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?",
      gpuMode: P.gpuMode,
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      longTaskSupported: P.longSupported,
      heapSupported: !!performance.memory,
      heapMethod: "performance.memory positive sampled deltas; approximate, may be quantized; not exact allocation or GC count",
      drawMethod: "actual main scene render, including shadow, excluding ink fullscreen pass; no render=0",
      dpr: devicePixelRatio,
      pixelRatio: R.getPixelRatio(),
      canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      rt: [G.ink.rt.width, G.ink.rt.height, G.ink.rt.samples],
      shadow: P.sun().shadow.mapSize.x,
      colliders: ctx.colliders.length,
      wrapped,
      quality: G.quality || null,
    };
  });
  c.log("ENV", JSON.stringify(env));

  const results = { env: { ...env, browser: page.context().browser().version(), requested: { seconds: SEC, stages: STAGES, quality: Q, IGPU: process.env.IGPU || null, bench: process.env.BENCH !== "0" }, measuredAt: new Date().toISOString() }, stages: {} };
  const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);
  const summarize = (name, fr, extra = {}) => {
    const st = (k) => {
      const v = fr.map((f) => f[k]).filter(Number.isFinite).sort((a, b) => a - b);
      return v.length ? { p50: +pct(v, 0.5).toFixed(2), p95: +pct(v, 0.95).toFixed(2), max: +v[v.length - 1].toFixed(2), n: v.length } : null;
    };
    const mods = {};
    for (const f of fr) for (const [k, v] of Object.entries(f.m)) mods[k] = (mods[k] || 0) + v;
    for (const k of Object.keys(mods)) mods[k] = +(mods[k] / Math.max(1, fr.length)).toFixed(3);
    const sortedMods = Object.fromEntries(Object.entries(mods).sort((a, b) => b[1] - a[1]));
    const worst = [...fr].sort((a, b) => b.cpu - a.cpu).slice(0, 3).map((f) => ({
      cpu: +f.cpu.toFixed(1), gpu: f.gpu !== undefined ? +f.gpu.toFixed(1) : null, progs: f.progs, newProgs: f.newProgs,
      top: Object.entries(f.m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(" "),
    }));
    // 堆增长率（MB/s，GC 前的分配速率近似）与 GC 次数（堆下降）
    let grow = 0, gcs = 0, dur = 0;
    for (let i = 1; i < fr.length; i++) {
      const d = fr[i].heap - fr[i - 1].heap;
      if (d >= 0) grow += d;
      else if (d < -256 * 1024) gcs++;
      dur += fr[i].raf;
    }
    const last = fr[fr.length - 1] || {};
    // 帧间隔最长的 3 帧：at = 距本段第一帧的毫秒数（首次绘制类的尖峰紧跟在动作之后；显卡被别的进程占用时随机出现）
    const rafTop = [...fr].sort((a, b) => b.raf - a.raf).slice(0, 3).map((f) => ({ raf: +f.raf.toFixed(0), at: fr.length ? Math.round(f.t0 - fr[0].t0) : 0, cpu: +f.cpu.toFixed(1) }));
    const compiles = fr.filter((f) => f.newProgs).map((f) => `${f.cpu.toFixed(0)}ms:${f.newProgs.join(",")}`);
    const r = {
      frames: fr.length, cpu: st("cpu"), gpu: st("gpu"), raf: st("raf"), calls: st("calls"), tris: st("tris"),
      allocMBs: env.heapSupported && dur ? +((grow / 1048576) / (dur / 1000)).toFixed(2) : null, gcs: env.heapSupported ? gcs : null,
      renderedFrames: fr.filter(f => f.rendered).length,
      unrenderedFrames: fr.filter(f => !f.rendered).length,
      rawFrames: process.env.RAW_FRAMES === "1" ? fr : undefined,
      progs: last.progs, compiles, rafTop, geos: last.geos, texs: last.texs, enemies: last.nEnemies, mods: sortedMods, worst, ...extra,
    };
    results.stages[name] = r;
    c.log(`STAGE ${name}: cpu ${JSON.stringify(r.cpu)} gpu ${JSON.stringify(r.gpu)} raf ${JSON.stringify(r.raf)} calls ${r.calls && r.calls.p50} tris ${r.tris && r.tris.p50} alloc ${r.allocMBs}MB/s gcs ${gcs} progs ${r.progs} enemies ${r.enemies}`);
    c.log(`  mods ${JSON.stringify(sortedMods)}`);
    c.log(`  worst ${JSON.stringify(worst)}`);
    if (compiles.length) c.log(`  compiles ${JSON.stringify(compiles)}`);
    c.log(`  rafTop ${JSON.stringify(rafTop)}`);
    if (extra && Object.keys(extra).length) c.log(`  extra ${JSON.stringify(extra)}`);
    return r;
  };
  // CPU 采样（PROFILE=1）：按函数自身耗时排行
  const prof = { on: !!process.env.PROFILE };
  if (prof.on) await cdp.send("Profiler.enable"), await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  const profStop = async (name) => {
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const tot = dt.reduce((a, b) => a + b, 0);
    for (let i = 0; i < profile.samples.length; i++) {
      const n = byId.get(profile.samples[i]), cf = n.callFrame;
      const k = `${cf.functionName || "(anon)"} ${(cf.url || "").replace(/^.*\/(src|node_modules)\//, "$1/").replace(/\?.*$/, "")}:${cf.lineNumber + 1}`;
      self.set(k, (self.get(k) || 0) + (dt[i] || 0));
    }
    const top = [...self.entries()].filter(([k]) => !/^\(idle\)|^\(program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${((v / tot) * 100).toFixed(1)}% ${k}`);
    const gc = self.get("(garbage collector) :0") || 0;
    c.log(`PROFILE ${name} (gc ${((gc / tot) * 100).toFixed(1)}%, idle ${(((self.get("(idle) :0") || 0) / tot) * 100).toFixed(0)}%):\n    ` + top.join("\n    "));
    results.stages[name].profile = top;
  };
  const record = async (name, sec = SEC, during, extra) => {
    if (prof.on) await cdp.send("Profiler.start");
    const started = await c.ev(() => ((__perf.frames = []), (__perf.long = []), (__perf.rec = !0), performance.now()));
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < sec * 1000) {
      if (during) await during(k++);
      await c.wait(250);
    }
    const stopped = await c.ev(() => ((__perf.rec = !1), performance.now()));
    await c.wait(100); // 给longtask observer与异步GPU查询交付时间，采样区间不延长。
    const fr = await c.ev(() => __perf.frames.splice(0));
    const long = await c.ev(([start, end]) => __perf.long.splice(0).filter(e => e.start < end && e.start + e.duration > start), [started, stopped]);
    const hold3d = await c.ev(() => !!__game.ctx.hold3d);
    const bench = process.env.BENCH !== "0" && !hold3d ? await c.ev(() => __perf.bench(20)) : undefined;
    const r = summarize(name, fr, { requestedSeconds: sec, sampledMs: +(stopped - started).toFixed(2), longTasks: env.longTaskSupported ? long : null, bench, hold3d, ...(extra || {}) });
    if (!fr.length) throw new Error(`性能段无主循环样本: ${name}`);
    if (prof.on) await profStop(name);
    return r;
  };
  // 走动：WASD 轮流按（镜头跟随，覆盖视锥变化）
  const KEYS = ["KeyW", "KeyD", "KeyS", "KeyA"];
  let held = null;
  const walk = async (k) => {
    if (k % 4 !== 0) return;
    if (held) await page.keyboard.up(held);
    held = KEYS[(k / 4) % 4];
    await page.keyboard.down(held);
  };
  const stopWalk = async () => held && (await page.keyboard.up(held), (held = null));
  const tp = (x, z) => c.ev(([x, z]) => {
    const p = __game.player;
    p.spawn(x, z);
    __game.rig.update(1, !0);
  }, [x, z]);

  const region = await c.ev(() => __game.run.region);
  await c.ev(() => (__game.player.debug.god = !0));
  const entry = await c.ev(() => __game.player.pos.toArray());

  // 1) 开阔地：入口处走动
  if (STAGES.includes("open")) {
    await record("open", SEC, walk);
    await stopWalk();
  }
  const ablate = async () => {
    await c.ev(() => (__game.flow.paused = !0));
    c.log("SCENE", JSON.stringify(await c.ev(() => __perf.sceneStats())));
    const abl = async (name, on, off) => {
      await c.ev(on);
      await c.wait(300);
      const b = await c.ev(() => __perf.bench(30));
      await c.ev(off);
      await c.wait(200);
      results.stages["ablate_" + name] = b;
      c.log(`ABLATE ${name}: ${JSON.stringify(b)}`);
    };
    if (process.env.ABL_PR) await c.ev((p) => { __game.renderer.setPixelRatio(p); dispatchEvent(new Event("resize")); }, Number(process.env.ABL_PR)); // 放大分辨率让 GPU 成为瓶颈，比较逐像素开销
    const pr0 = await c.ev(() => __game.renderer.getPixelRatio());
    c.log("ABLATE pixelRatio", pr0, JSON.stringify(await c.ev(() => [__game.ink.rt.width, __game.ink.rt.height])));
    await abl("base", () => 0, () => 0);
    await abl("noShadowUpdate", () => (__game.renderer.shadowMap.autoUpdate = !1), () => (__game.renderer.shadowMap.autoUpdate = !0));
    await abl("noShadow", () => ((__perf.__s = __perf.sun()).castShadow = !1), () => (__perf.__s.castShadow = !0));
    await abl("shadow2048", () => { const s = __perf.sun().shadow; s.mapSize.set(2048, 2048); s.map && (s.map.dispose(), (s.map = null)); }, () => { const s = __perf.sun().shadow; s.mapSize.set(4096, 4096); s.map && (s.map.dispose(), (s.map = null)); });
    await abl("shadowBasic", () => { __game.renderer.shadowMap.type = __game.THREE.PCFShadowMap; __game.renderer.shadowMap.needsUpdate = !0; __game.scene.traverse((o) => o.material && (o.material.needsUpdate = !0)); }, () => { __game.renderer.shadowMap.type = __game.THREE.PCFSoftShadowMap; __game.scene.traverse((o) => o.material && (o.material.needsUpdate = !0)); });
    await abl("postCopy", () => { const m = __game.ink.mat; m.userData.fs = m.fragmentShader; m.fragmentShader = "uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); }"; m.needsUpdate = !0; }, () => { const m = __game.ink.mat; m.fragmentShader = m.userData.fs; m.needsUpdate = !0; });
    await abl("noMSAA", () => { const rt = __game.ink.rt; rt.samples = 0; rt.dispose(); }, () => { const rt = __game.ink.rt; rt.samples = 4; rt.dispose(); });
    await abl("msaa2", () => { const rt = __game.ink.rt; rt.samples = 2; rt.dispose(); }, () => { const rt = __game.ink.rt; rt.samples = 4; rt.dispose(); });
    await abl("rgba8", () => { const rt = __game.ink.rt; rt.texture.type = __game.THREE.UnsignedByteType; rt.dispose(); }, () => { const rt = __game.ink.rt; rt.texture.type = __game.THREE.HalfFloatType; rt.dispose(); });
    await abl("noGrass", () => __game.scene.traverse((o) => o.isInstancedMesh && o.visible && o.material.alphaTest > 0 && !o.castShadow && ((o.visible = !1), (o.userData.__hid = 1))), () => __game.scene.traverse((o) => o.userData.__hid && ((o.visible = !0), delete o.userData.__hid)));
    await abl("noVegShadow", () => __game.scene.traverse((o) => o.isInstancedMesh && o.castShadow && ((o.castShadow = !1), (o.userData.__cs = 1))), () => __game.scene.traverse((o) => o.userData.__cs && ((o.castShadow = !0), delete o.userData.__cs)));
    await abl("noVeg", () => __game.scene.traverse((o) => o.isInstancedMesh && o.visible && ((o.visible = !1), (o.userData.__hid = 1))), () => __game.scene.traverse((o) => o.userData.__hid && ((o.visible = !0), delete o.userData.__hid)));
    await c.ev((p) => { __game.renderer.setPixelRatio(p * 0.75); dispatchEvent(new Event("resize")); }, pr0);
    await abl("pr0.75", () => 0, () => 0);
    await c.ev((p) => { __game.renderer.setPixelRatio(p * 0.5); dispatchEvent(new Event("resize")); }, pr0);
    await abl("pr0.5", () => 0, () => 0);
    await c.ev((p) => { __game.renderer.setPixelRatio(p); dispatchEvent(new Event("resize")); }, pr0);
    await c.ev(() => (__game.flow.paused = !1));
  };
  if (process.env.ABLATE) await ablate();
  // 2) 植被密集处：按实例矩阵统计 10 米格内的植被数，取最密且可站立的位置
  if (STAGES.includes("veg")) {
    const spot = await c.ev(() => {
      const G = __game, T = G.THREE, m = new T.Matrix4(), v = new T.Vector3(), cnt = new Map();
      G.scene.traverse((o) => {
        if (!o.isInstancedMesh || !o.visible) return;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
          const k = Math.floor(v.x / 12) + "," + Math.floor(v.z / 12);
          cnt.set(k, (cnt.get(k) || 0) + 1);
        }
      });
      const P = G.player;
      const best = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
      for (const [k, n] of best.slice(0, 40)) {
        const [i, j] = k.split(",").map(Number);
        for (let t = 0; t < 30; t++) {
          const x = (i + Math.random()) * 12, z = (j + Math.random()) * 12;
          const h = G.ctx.terrain.height(x, z);
          if (h > -0.5 && P.canStand(x, z, h)) return { x, z, n };
        }
      }
      return null;
    });
    if (spot) {
      await tp(spot.x, spot.z);
      await c.wait(600);
      await record("veg", SEC, walk, { spot });
      await stopWalk();
      await c.shot(`${region}_veg`);
    }
    await tp(entry[0], entry[2]);
    await c.wait(500);
  }
  // 3) 战斗：刷 8 只怪 + 循环放技能 / 法宝 / 阵法 / 普攻
  const combat = async (name) => {
    await c.ev(() => {
      const E = __game.ctx.enemies;
      const out = [...E.spawnPack(4, !1), ...E.spawnPack(4, !0)];
      for (const e of out) e.setAggro && e.setAggro("wave");
      __game.ctx.skills.debugAction("power");
      window.__castN = 0;
    });
    const r = await record(name, SEC, async (k) => {
      await c.ev((k) => {
        const G = __game, S = G.ctx.skills, h = S.hero, E = G.ctx.enemies;
        h.hp = h.stats.get("hp");
        h.mp = h.stats.get("mp");
        S.cd = {};
        const tgt = E.list.find((e) => e.alive);
        S.aimOverride = tgt ? tgt.pos.clone() : null;
        G.ctx.input.mouse.left = k % 2 === 0;
        const i = k % 5;
        if (i < 3) S.castSpell(i);
        else if (i === 3) S.useArtifact();
        else S.placeFormation();
        // 打死的怪补上，保持 6–10 只
        if (E.list.filter((e) => e.alive).length < 6) for (const e of E.spawnPack(3, !1)) e.setAggro && e.setAggro("wave");
      }, k);
    });
    await c.ev(() => ((__game.ctx.input.mouse.left = !1), (__game.ctx.skills.aimOverride = null)));
    return r;
  };
  if (STAGES.includes("combat")) {
    await combat("combat");
    await c.shot(`${region}_combat`);
    await c.ev(() => __game.run.clearEnemies());
  }
  // 3.4) 首领战"首次绘制"成本（STAGES=bossfirst，单独跑，不和 boss 同跑）：暂停主循环，自己画帧并 gl.finish 计墙钟时间；
  //      每个新画面先画第 1 帧（readPixels 1 像素同步）、紧接着再画 2 帧，first − 重复帧较小值 = 首次绘制成本（纹理上传 + ANGLE 生成着色器 + 程序编译）。
  //      显卡被别的进程占用时两帧一起变慢，差值仍可比。画面：进谷跟随视角 → 首领生成 → 处决低机位 4 个朝向。配 ?prewarmBoss=0 做 A/B。
  if (STAGES.includes("bossfirst")) {
    const r = await c.ev(async () => {
      const G = __game, R = G.renderer, gl = R.getContext(), ink = G.ink, cam = G.camera, E = G.ctx.enemies;
      const { activeLevel } = await import("/src/world/terrain.js");
      const L = activeLevel();
      G.run.clearEnemies();
      E.auto = !1;
      G.profile.flags.unlockAll = !0;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const px = new Uint8Array(4);
      const one = () => {
        const t = performance.now();
        ink.render(G.scene, cam, 1);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // 读回 1 像素 = 等 GPU 做完（本机 gl.finish 不等）
        return performance.now() - t;
      };
      const shot = () => {
        const a = one(), b = one(), c2 = one();
        const rep = Math.min(b, c2);
        return { first: +a.toFixed(1), rep: +rep.toFixed(1), extra: +(a - rep).toFixed(1) };
      };
      const out = {};
      // 主循环先停 3D（不让它抢先画新画面），玩法暂停
      G.flow.paused = !0;
      G.ctx.hold3d = !0;
      await sleep(300);
      out.entry = shot();
      // 进谷：瞬移 + 镜头 + 关卡更新一次（阴影跟随主角）
      G.run.bossSpawned = !0;
      G.player.spawn(38, -26);
      G.rig.update(1, !0);
      L && L.update && L.update(0);
      out.valley = shot();
      // 首领生成（沉睡）
      G.run.bossSpawned = !1;
      G.run.bossSpawn();
      const q = E.list.find((e) => e.type === "qingya");
      if (q) E.updateView && E.updateView();
      out.spawn = shot();
      // 处决低机位 4 个朝向（俯角 25°、距 10 米，对着首领）
      if (q) {
        const T = G.THREE, tgt = new T.Vector3(q.pos.x, q.pos.y + 1.6, q.pos.z);
        const cp = cam.position.clone(), cq = cam.quaternion.clone();
        for (let k = 0; k < 4; k++) {
          const yaw = (k * Math.PI) / 2 + 0.4, pit = (25 * Math.PI) / 180, d = 10;
          cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pit) * d, tgt.y + Math.sin(pit) * d, tgt.z + Math.cos(yaw) * Math.cos(pit) * d);
          cam.lookAt(tgt);
          cam.updateMatrixWorld();
          out["exec" + k] = shot();
        }
        cam.position.copy(cp);
        cam.quaternion.copy(cq);
      }
      G.ctx.hold3d = !1;
      G.flow.paused = !1;
      let sum = 0;
      for (const v of Object.values(out)) sum += Math.max(0, v.extra);
      out.sumExtra = +sum.toFixed(1);
      return out;
    });
    results.stages.bossfirst = r;
    c.log("BOSSFIRST", JSON.stringify(r));
  }
  // 3.5) 首领战（青牙 v2，region=r1；STAGES 含 boss）：生成 → 入场 → 一阶段 → 转阶段（遮月、月光斑、骨甲崩裂、土盾）→ 二阶段 →
  //      威折处决 → 终结处决（留白、化墨、掉落、出口光柱）。验收 boss_青牙_v2 §11.1 第 15 条：各段 compiles 为空、无 longtask；
  //      BOSS progs = 整段首领战新建的着色器程序数（应为 0）；BOSSDRAW = 首领外观 / 环境新增的常驻 draw call（应 ≤ 10）。
  //      BOSS_SHOTS=1：处决中截图（work/shots/perf_probe_boss_*_<QUALITY>.png），看留白 / 去饱和 / 暗幕在各画质下的样子
  if (STAGES.includes("boss")) {
    const has = await c.ev(() => !!(__game.run.map.points.boss && __game.ctx.enemies.templates.qingya));
    if (!has) c.log("BOSS: 本关没有青牙（用 region=r1）");
    else {
      const qTag = process.env.QUALITY || "default";
      const shots = !!process.env.BOSS_SHOTS;
      const p0 = await c.ev(() => {
        const G = __game, E = G.ctx.enemies;
        G.run.clearEnemies();
        window.__bossKeep = { auto: E.auto, ua: G.profile.flags.unlockAll };
        E.auto = !1;
        G.profile.flags.unlockAll = !0; // 境界门槛不拦（测试档）
        window.__q = () => E.list.find((e) => e.type === "qingya" && e.alive);
        window.__qHit = (base) => G.world.dealDamage(G.player.entity, __q().entity, { base, noCrit: !0 });
        window.__qClr = (q) => { for (const id of [...q.entity.statuses.keys()]) G.world.removeStatus(q.entity, id); };
        // 主角对着首领放技能 / 普攻（无敌）；keepHp：把首领气血保持在这一比例以上，不让它提前转阶段 / 气竭
        window.__qFight = (k, keepHp) => {
          const S = G.ctx.skills, h = S.hero, q = __q();
          h.hp = h.stats.get("hp");
          h.mp = h.stats.get("mp");
          if (!q) return;
          if (keepHp && q.entity.hp < q.entity.stats.get("hp") * keepHp) q.entity.hp = q.entity.stats.get("hp") * keepHp;
          if (q.ctrl.mode !== "fight") return;
          S.cd = {};
          S.aimOverride = q.pos.clone();
          G.ctx.input.mouse.left = k % 2 === 0;
          const i = k % 5;
          if (i < 3) S.castSpell(i);
          else if (i === 3) S.useArtifact();
          else S.placeFormation();
        };
        return __perf.nNew || 0;
      });
      const bossRec = (name, sec, during) => record(name, sec, during);
      // 先只走进谷里（首领先不生成：新区域首次进画面的开销单独一段），再生成首领（沉睡；离首领 12.6 米，触发圈外）
      await bossRec("boss_tp", 2.5, async (k) => {
        if (k === 0) await c.ev(() => ((__game.run.bossSpawned = !0), __game.player.spawn(38, -26), __game.rig.update(1, !0)));
      });
      await bossRec("boss_spawn", 3, async (k) => {
        if (k === 0) await c.ev(() => ((__game.run.bossSpawned = !1), __game.run.bossSpawn()));
      });
      // 入场 + 一阶段：走进 10 米触发圈 → 入场仪式（首次 4 秒）→ 开打
      await bossRec("boss_fight1", 9, async (k) => {
        if (k === 0) await c.ev(() => { const q = __q(); if (q) __game.player.spawn(q.pos.x, q.pos.z + q.entity.radius + 3); });
        await c.ev(([k]) => __qFight(k, 0.6), [k]);
      });
      // 转阶段（3.6 秒：骨甲崩裂、遮月、月光斑、土盾重生）+ 二阶段
      await bossRec("boss_phase2", 8, async (k) => {
        if (k === 0)
          await c.ev(() => {
            const q = __q();
            if (!q) return;
            if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
            __qClr(q);
            q.entity.hp = q.entity.stats.get("hp") * 0.49;
          });
        else await c.ev(([k]) => __qFight(k, 0.4), [k]);
        if (shots && k === 6) await c.shot(`boss_transition_${qTag}`);
      });
      if (shots) await c.shot(`boss_phase2_${qTag}`);
      // 常驻 draw call：暂停后把首领外观附件（描边壳、阵纹、眼焰）与狼谷环境（月光斑、墨雾门、谷沿雾、暗幕）藏起来对比
      const draw = await c.ev(async () => {
        const G = __game, q = __q(), BA = q && q.ctrl.arena;
        G.flow.paused = !0;
        const fr = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
        await fr();
        const all = __perf.calls;
        const hid = [];
        const hide = (o) => o && o.visible && ((o.visible = !1), hid.push(o));
        // 描边壳（boss_look 建的，userData.src = 本体网格）、阵纹（透明贴图面片）、眼焰（精灵）
        if (q) q.root.traverse((o) => (o.isSprite || o.userData.src || (o.isMesh && o.material && o.material.map && o.material.transparent && !o.material.depthWrite)) && hide(o));
        await fr();
        const noLook = __perf.calls;
        if (BA) {
          for (const mp of BA.moon || []) hide(mp.mesh);
          for (const g of Object.values(BA.gateObjs || {})) hide(g.object);
        }
        await fr();
        const noEnv = __perf.calls;
        hid.forEach((o) => (o.visible = !0));
        G.flow.paused = !1;
        return { all, look: all - noLook, env: noLook - noEnv, phase: q && q.ctrl.phase, mode: q && q.ctrl.mode, veil: BA && BA.veil, moonVis: BA && (BA.moon || []).map((m) => m.mesh.visible), hidden: hid.length };
      });
      results.stages.boss_draw = draw;
      c.log("BOSSDRAW", JSON.stringify(draw));
      // 威折处决（二阶段）：狼威打满 → F
      await c.ev(() => (__game.ctx.input.mouse.left = !1, (__game.ctx.skills.aimOverride = null)));
      await bossRec("boss_exec_break", 3.5, async (k) => {
        if (k === 0)
          await c.ev(() => {
            const q = __q(), C = q && q.ctrl, P = __game.player;
            if (!q) return;
            q.atk && q.endAttack(!0);
            C.moonLeap = null;
            C.moonCd = 999;
            q.state = "chase";
            __qClr(q);
            if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
            __qClr(q);
            q.entity.stats.removeSource("shieldBreak");
            q.entity.hp = q.entity.stats.get("hp") * 0.4;
            P.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2);
            C.poise = C.poiseMax - 1;
            __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
          });
        if (k === 1) await c.ev(() => __q() && (__q().ctrl.fReq = !0));
        if (shots && k === 5) await c.shot(`boss_exec_break_${qTag}`);
      });
      // 终结处决：致死一击 → 气竭伏地 → F（首次完整 4 秒）→ 化墨、掉落、出口
      await c.ev(async () => { for (let i = 0; i < 40 && __q() && __q().ctrl.broken; i++) await new Promise((r) => setTimeout(r, 100)); });
      await bossRec("boss_exec_final", 8, async (k) => {
        if (k === 0)
          await c.ev(() => {
            const q = __q(), C = q && q.ctrl;
            if (!q) return;
            q.atk && q.endAttack(!0);
            C.moonLeap = null;
            C.moonCd = 999;
            q.state = "chase";
            __qClr(q);
            if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
            __qClr(q);
            q.entity.stats.removeSource("shieldBreak");
            __qHit(q.entity.hp * 3 + 2000);
          });
        if (k === 1) await c.ev(() => { const q = __q(); if (q) (__game.player.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2), (q.ctrl.fReq = !0)); });
        if (shots && k === 7) await c.shot(`boss_exec_final_${qTag}`);
      });
      const end = await c.ev((p0) => {
        const G = __game, E = G.ctx.enemies, k = window.__bossKeep;
        E.auto = k.auto;
        G.profile.flags.unlockAll = k.ua;
        return { progsNew: (__perf.nNew || 0) - p0, defeated: !__q() };
      }, p0);
      results.stages.boss_summary = end;
      c.log("BOSS progs", JSON.stringify(end));
      await c.ev(() => __game.run.clearEnemies());
    }
  }
  // 4) 入夜：跳到夜晚（妖潮、夜明宝箱、巡游精英），走动 + 夜战
  if (STAGES.includes("night")) {
    await c.ev(() => (__game.run.t = __game.run.R.phases[2] + 62));
    await c.wait(800);
    await record("night", SEC, walk);
    await stopWalk();
    await combat("night_combat");
    await c.shot(`${region}_night`);
    await c.ev(() => __game.run.clearEnemies());
  }
  // 5) 储物袋 / 天机镜：打开那一帧 + 开着的几秒
  const ui = async (name, open, close) => {
    await c.ev(() => ((__perf.frames = []), (__perf.rec = !0)));
    const tOpen = await c.ev(open);
    await c.wait(300);
    const fr0 = await c.ev(() => __perf.frames.splice(0));
    const openMax = Math.max(0, ...fr0.map((f) => f.cpu));
    await c.ev(() => (__perf.rec = !1));
    await record(name, Math.min(SEC, 3), null, { openCallMs: +tOpen.toFixed(1), openFrameMax: +openMax.toFixed(1) });
    await c.ev(close);
  };
  if (STAGES.includes("bag")) await ui("bag", () => { const t = performance.now(); __game.flow.scenes.run.bagUI.toggle(!0); return performance.now() - t; }, () => __game.flow.scenes.run.bagUI.toggle(!1));
  if (STAGES.includes("map")) await ui("map", () => { const t = performance.now(); __game.flow.scenes.run.hudUI.toggleMap(!0); return performance.now() - t; }, () => __game.flow.scenes.run.hudUI.toggleMap(!1));

  // 6) 渲染消融（静止画面，暂停玩法）：各项对 GPU 的贡献
  // 每段之后跑一次 GPU 基准（BENCH=1）
  // 6.5) 新特效 / 新界面（FEATURES=1 或 STAGES 含 features）：天机镜绘制、留尸 30 具、搜取窗口、灵田
  if (STAGES.includes("features")) {
    await c.ev(() => __game.run.clearEnemies());
    await tp(entry[0], entry[2]);
    await c.wait(400);
    const mm = await c.ev(() => {
      const H = __game.flow.scenes.run.hudUI, mm = H.mm, out = {};
      const t = (fn, n) => { fn(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return +((performance.now() - t0) / n).toFixed(2); };
      out.drawMirrorMs = t(() => mm.drawMirror(H.cv), 20);
      H.toggleMap(!0);
      out.drawBigMs = t(() => mm.drawBig(), 10);
      H.toggleMap(!1);
      // 着墨揭示（探索格变化时才重画）
      const E = mm.E;
      out.revealMs = t(() => ((E.stamp = (E.stamp || 0) + 1), mm.updateReveal()), 5);
      out.base = mm.base ? [mm.base.width, mm.base.height] : null;
      out.mirrorEvery = "0.15s";
      return out;
    });
    results.stages.feat_mirror = mm;
    c.log("FEAT mirror", JSON.stringify(mm));
    // 留尸 30 具：在入口附近刷 30 只、全部击杀并留尸（有掉落才留尸，这里直接给每只一件灵石）
    const nC = await c.ev(async () => {
      const G = __game, E = G.ctx.enemies, w = G.world, C = G.run.containers;
      const { makeItem } = await import("/src/core/items.js");
      const out = [];
      for (let k = 0; k < 6; k++) out.push(...E.spawnPack(5, !1));
      for (const e of out) {
        e.noLoot = !0;
        w.dealDamage(G.player.entity, e.entity, { base: 1e7, noCrit: !0 });
        if (!C.list.some((q) => q.enemy === e)) C.corpse(e, [makeItem("spirit_stone", { n: 1 })], e.pos);
      }
      return out.length;
    });
    await c.wait(2500);
    const cs = await c.ev(() => ({ corpses: __game.run.containers.list.filter((q) => q.kind === "corpse" && q.body).length, frozen: __game.run.containers.list.filter((q) => q.body && q.body.matrixWorldAutoUpdate === !1).length }));
    c.log("FEAT corpses", JSON.stringify(cs));
    await record("feat_corpses_near", 3, null, cs);
    // 走远（尸体在画面外）：剔除 vs 不剔除
    await tp(entry[0] + 45, entry[2]);
    await c.wait(600);
    await record("feat_corpses_away", 3);
    await c.ev(() => { const E = __game.ctx.enemies; E.__inView = E.inView; E.inView = () => !0; });
    await c.wait(300);
    await record("feat_corpses_away_nocull", 3);
    await c.ev(() => { const E = __game.ctx.enemies; E.inView = E.__inView; });
    await tp(entry[0], entry[2]);
    await c.wait(600);
    // 搜取窗口：打开最近的尸体，探查动画进行中
    await c.ev(() => {
      const C = __game.run.containers, p = __game.player.pos;
      const q = C.list.filter((x) => x.kind === "corpse").sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
      if (q) {
        for (let i = 0; i < 5; i++) C.addSlot(q, { ...q.slots[0].inst, uid: "perf" + i, rarity: i % 5 });
        __game.player.spawn(q.pos.x + 1, q.pos.z);
        C.open(q);
      }
    });
    await record("feat_lootwin", 2.5, null, { open: await c.ev(() => !!__game.run.containers.openC) });
    await c.ev(() => __game.run.containers.close && __game.run.containers.close("esc"));
    // 灵田（本局有的话）
    const lt = await c.ev(() => {
      const Q = __game.run.quests, enc = Q && (Q.encs || []).find((e) => e.field || (e.def && e.def.field));
      return enc ? enc.pos.toArray() : null;
    });
    if (lt) {
      await tp(lt[0] + 3, lt[2] + 3);
      await c.wait(600);
      await record("feat_lingtian", 3, null, { at: lt });
    } else c.log("FEAT lingtian: 本局没有灵田奇遇");
  }
  // 7) 界面切换：出行局 → 结算 → 洞府 → 出行准备 → 出行局（切换调用耗时 + 之后 1.5 秒内的最长帧 / 长任务）
  if (STAGES.includes("switch")) {
    const sw = async (name, fn) => {
      await c.ev(() => ((__perf.frames = []), (__perf.long = []), (__perf.rec = !0)));
      const ms = await c.ev(fn);
      await c.wait(1500);
      const fr = await c.ev(() => ((__perf.rec = !1), __perf.frames.splice(0)));
      const long = await c.ev(() => __perf.long.splice(0));
      const mx = Math.max(0, ...fr.map((f) => f.cpu));
      const gpuFrames = fr.map(f => f.gpu).filter(Number.isFinite);
      const mg = gpuFrames.length ? +Math.max(...gpuFrames).toFixed(1) : null;
      const r = { goMs: +ms.toFixed(1), maxFrameCpu: +mx.toFixed(1), maxFrameGpu: mg, longTasks: env.longTaskSupported ? long : null, progs: fr.length ? fr[fr.length - 1].progs : null };
      results.stages["switch_" + name] = r;
      c.log(`SWITCH ${name}: ${JSON.stringify(r)}`);
    };
    await sw("result", async () => { const t = performance.now(); const r = __game.run.finish("extract"); await __game.flow.go("result", { result: r, region: __game.run.region }); return performance.now() - t; });
    await sw("cave", async () => { const t = performance.now(); await __game.flow.go("cave"); return performance.now() - t; });
    await sw("prep", async () => { const t = performance.now(); await __game.flow.go("prep"); return performance.now() - t; });
    await sw("run", async () => { const t = performance.now(); await __game.flow.go("run", { region: new URLSearchParams(location.search).get("region") || "r1" }); return performance.now() - t; });
  }

  if (STAGES.some(s => s === "weapon" || s === "garden")) {
    try {
      const { currentFeatures } = await import("./perf_current_features.mjs");
      await currentFeatures(page, c, { record, results, stages: STAGES, seconds: SEC });
    } catch (e) {
      results.featureError = String(e.stack || e);
      c.log("FAIL 性能专项执行异常", results.featureError);
    }
  }
  const errs = await c.ev(() => window.__errors.length);
  c.log("errors in page:", errs);
  const out = process.env.OUT || `work/perf/${region}_${process.env.TAG || "run"}.json`;
  fs.mkdirSync(path.dirname(out), { recursive: !0 });
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  c.log("saved", out);
}
