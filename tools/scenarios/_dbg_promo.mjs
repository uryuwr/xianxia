// 临时调试（宣传视频岗）：打断长嚎 / 威折处决 F 的运行时细节
import * as A from "../trailer/qingya_act.mjs";
export default async function (page, c) {
  await page.routeWebSocket(/./, () => {});
  const base = new URL(page.url()).origin + "/";
  const R = {
    page, mouse: { x: 640, y: 360 }, marks: {}, ev: (f, a) => page.evaluate(f, a),
    async frame(each) { await page.waitForTimeout(33); if (each) await each(); },
    async frames(n, each) { for (let i = 0; i < n; i++) await R.frame(each && (() => each(i))); },
    sec: (s, each) => R.frames(Math.round(s * 30), each), skip: (n) => page.waitForTimeout(n * 33),
    async key(code, hold = 2) { await page.keyboard.down(code); await R.frames(hold); await page.keyboard.up(code); },
    down: (k) => page.keyboard.down(k), up: (k) => page.keyboard.up(k),
    mdown: (b = "left") => page.mouse.down({ button: b }), mup: (b = "left") => page.mouse.up({ button: b }),
    async moveRaw(x, y) { R.mouse = { x, y }; await page.mouse.move(x, y); },
    async go(q) { await page.goto(base + "?" + q, { waitUntil: "commit", timeout: 90000 }); await page.waitForFunction(() => window.__ready === !0, null, { timeout: 180000 }); },
    until: (fn, arg, { timeout = 60000 } = {}) => page.waitForFunction(fn, arg, { timeout, polling: 100 }), mark: (k) => (R.marks[k] = Date.now()),
  };
  await A.enter(R, { preset: "T3", tries: "6", god: "1", mp: "1", at: "fight" });
  await A.waitUntil(R, () => __q().ctrl.mode === "fight", null, { maxSec: 6 });
  await A.bossHold(R, !0);
  await A.stage(R, { phase2: !0, hp: 0.45, shield: 0, poise: 0 });
  const st = () => R.ev(() => ({ p: [+__game.player.pos.x.toFixed(1), +__game.player.pos.z.toFixed(1)], hs: __game.player.state, b: [+__q().pos.x.toFixed(1), +__q().pos.z.toFixed(1)], yaw: +__q().yaw.toFixed(2), bs: __q().state, mode: __q().ctrl.mode, brk: __q().ctrl.broken, spots: __q().ctrl.moonSpots().map((s) => [+s.x.toFixed(1), +s.z.toFixed(1)]), inMoon: __q().ctrl.inMoon(__game.player.pos), atk: __q().atk && __q().atk.a && __q().atk.a.id }));
  c.log("s0", JSON.stringify(await st()));
  const probe = () => R.ev(() => { const P = __game.player; return { st: P.state, pos: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)], cine: __game.rig.cineActive, live: __game.flow.live, paused: __game.flow.paused, root: [...P.entity.statuses.keys()], move: P.entity.stats.get("move"), keys: __game.ctx.input.keys ? [...__game.ctx.input.keys] : null }; });
  c.log("p0", JSON.stringify(await probe()));
  await R.down("KeyA"); await R.sec(1); c.log("p1", JSON.stringify(await probe())); await R.up("KeyA");
  await R.sec(0.5);
  c.log("p2", JSON.stringify(await probe()));
}
