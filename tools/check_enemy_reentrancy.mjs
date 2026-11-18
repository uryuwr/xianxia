// 纯 Node 重入专项：node tools/check_enemy_reentrancy.mjs
// 复现原缺陷：node tools/check_enemy_reentrancy.mjs --repro
// 直接从当前源码提取真实方法，避免 Node 执行浏览器材质/import.meta.glob 初始化。
// --repro 仅在内存移除新增身份/状态保护，不写源码，也不冒充历史版本或真实碰撞场景。
// 碰撞/表现为桩；状态、攻击、QingyaCtrl 撞柱→威折链及 CombatWorld 伤害/事件均走真实方法。
import fs from "node:fs";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CombatWorld, makeEntity, Stats, STATUS } from "../src/core/combat.js";
import { ENEMY_TYPES } from "../src/data/enemies.js";
import { QINGYA as Q } from "../src/data/bosses/qingya.js";

const repro = process.argv.includes("--repro");
const enemySource = fs.readFileSync(new URL("../src/game/enemies/enemy.js", import.meta.url), "utf8");
const ctrlSource = fs.readFileSync(new URL("../src/game/enemies/bosses/qingya.js", import.meta.url), "utf8");
function method(source, name) {
  const start = source.indexOf("\n  " + name + "(");
  assert(start >= 0, "missing production method: " + name);
  const end = source.indexOf("\n  }", start);
  assert(end > start, "missing method boundary: " + name);
  return source.slice(start, end + 4);
}
function constant(name) {
  const start = enemySource.indexOf("export const " + name + " = ") + ("export const " + name + " = ").length;
  return new Function("return (" + enemySource.slice(start, enemySource.indexOf(";", start)) + ")")();
}
function methods(source, names, bindings) {
  let body = names.map((n) => method(source, n)).join(",");
  if (repro) body = body.split("\n").filter((line) => !line.includes('if (this.atk !== k || this.state !== "strike") return;')).join("\n");
  return new Function(...Object.keys(bindings), "return ({" + body + "})")(...Object.values(bindings));
}
const ep = methods(enemySource, ["update", "updateAttack", "strike", "hitHero", "inZone", "endAttack", "setState", "goHome", "onDeath"], {
  THREE, STATUS, AI: constant("AI"), RHYTHM: constant("RHYTHM"), INKC: { red: 0, blue: 0 },
  _v: new THREE.Vector3(), _w: new THREE.Vector3(), moveScale: () => 1,
});
const cp = methods(ctrlSource, ["update", "updateFight", "onLungeBlocked", "crash", "addPoise", "doBreak", "endBreak", "onEndAttack", "get poiseMax"], { Q, INKC: { ink: 0, red: 0 } });

function fixture(poise = 0) {
  const world = new CombatWorld(), events = [], tokens = new Set();
  const counts = { damage: 0, cancel: 0, projectile: 0, summon: 0, burst: 0, pillarFx: 0 };
  const hero = world.add(makeEntity({ team: "player", pos: new THREE.Vector3(1, 0, 0), stats: new Stats({ hp: 10000, def: 0 }) }));
  const ent = world.add(makeEntity({ pos: new THREE.Vector3(), stats: new Stats({ hp: 1000, atk: 20, move: 5, crit: 0 }) }));
  ent.shield = { hp: 1500, max: 1500 };
  const pillar = { id: "fixture-pillar", alive: true, pos: new THREE.Vector3(), col: { x: 0, z: 0, r: 1 }, break() { this.alive = false; } };
  const ctx = { world, colliders: [pillar.col], shields: null, vfx: { ring() {}, burst() { counts.burst++; }, pillar() { counts.pillarFx++; } } };
  const e = Object.assign(Object.create(ep), {
    state: "strike", t: 0, pos: ent.pos, home: new THREE.Vector3(), entity: ent, ctx, rank: "boss", cool: {}, actions: {},
    def: {}, aggro: true, kv: new THREE.Vector3(), vel: new THREE.Vector3(), flinchCd: 0,
    play() {}, animate() {}, updatePhases() {}, finish() {}, moveBy() { return false; },
    summon() { counts.summon++; },
    dir: { hero, releaseToken(x) { tokens.delete(x); }, bars: { remove() {} }, onEnemyDeath() {}, proj: { fire() { counts.projectile++; } } },
  });
  const c = Object.assign(Object.create(cp), {
    e, ent, ctx, hero: null, mode: "fight", phase: 1, broken: false, breaks: 0, poise, time: 10, lastGain: 0,
    totems: [], arena: { pillars: [pillar] }, exec: { active: false },
    pillarOf(col) { return col === pillar.col ? pillar : null; },
    ev(name, data) { events.push({ name, ...data, state: e.state, atk: !!e.atk }); },
    poiseFx() {}, emitPoise() {}, setNear() {}, updateTells() {},
  });
  e.ctrl = c;
  ent.onDeath = (info) => e.onDeath(info);
  const a = ENEMY_TYPES.qingya.attacks.find((x) => x.id === "rend");
  e.atk = { a, combo: 0, hit: false, windup: a.windup, aim: new THREE.Vector3(1, 0, 0), origin: e.pos.clone(), tele: { cancel() { counts.cancel++; } } };
  tokens.add(e);
  world.events.on("damage", (info) => { if (info.target === hero) counts.damage++; });
  return { e, c, world, hero, ent, pillar, counts, events, tokens };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
function replaceAttack(f) {
  f.e.endAttack(true);
  const next = { a: ENEMY_TYPES.qingya.attacks.find((a) => a.id === "sweep"), aim: new THREE.Vector3(1, 0, 0), origin: f.e.pos.clone() };
  f.e.atk = next; f.e.state = "strike"; f.e.t = 0.731; f.tokens.add(f.e);
  return next;
}

if (repro) {
  const f = fixture(60);
  // 不提供主角位置，跳过当帧 inZone（它也会读 null.a），单独暴露旧 recover 覆写及下一帧异常。
  f.e.updateAttack(0.02, null, 1);
  assert.equal(f.e.state, "recover"); assert.equal(f.e.atk, null); assert.equal(f.c.broken, true);
  assert.throws(() => f.e.update(0.02, f.hero), /null.*a/);
  console.log("REPRO_CONFIRMED " + JSON.stringify({ state: f.e.state, atk: f.e.atk, broken: f.c.broken, events: f.events }));
} else {
  test("real crash crosses poise threshold: retain down, clear token, no cancelled hit, next frame safe", () => {
    const f = fixture(60);
    f.e.updateAttack(0.02, f.hero.pos, 1);
    assert.equal(f.e.state, "down"); assert.equal(f.e.atk, null); assert.equal(f.c.broken, true);
    assert.equal(f.tokens.size, 0); assert.equal(f.counts.cancel, 1); assert.equal(f.counts.damage, 0); assert.equal(f.pillar.alive, false);
    assert.equal(f.events.filter((x) => x.name === "boss:crash").length, 1);
    f.e.update(0.02, f.hero); assert.equal(f.e.state, "down");
    console.log("CRASH_TRACE " + JSON.stringify(f.events));
  });
  test("real crash below threshold keeps attack and normal recovery", () => {
    const f = fixture(0);
    f.e.updateAttack(0.02, f.hero.pos, 1);
    assert.equal(f.e.state, "recover"); assert(f.e.atk); assert.equal(f.c.broken, false); assert.equal(f.c.poise, 40);
    assert.equal(f.counts.damage, 1); assert.equal(f.counts.cancel, 0); assert(f.tokens.has(f.e));
  });
  test("lunge callback replacing attack is not overwritten by old recovery", () => {
    const f = fixture(); let next;
    f.c.onLungeBlocked = () => { next = replaceAttack(f); };
    f.e.updateAttack(0.02, f.hero.pos, 1);
    assert.equal(f.e.atk, next); assert.equal(f.e.state, "strike"); assert.equal(f.e.t, 0.731); assert.equal(f.counts.damage, 0);
  });
  for (const state of ["down", "cinematic", "return", "dead"]) test("real beforeDamage callback cancels into " + state, () => {
    const f = fixture(); f.e.moveBy = () => true;
    f.world.events.on("beforeDamage", (info) => {
      if (info.target !== f.hero) return;
      info.cancel = true;
      if (state === "dead") f.world.dealDamage(f.hero, f.ent, { base: 10000, noCrit: true });
      else if (state === "return") f.e.goHome();
      else f.e.setState(state, 3.6);
    });
    f.e.updateAttack(f.e.atk.a.active + 0.01, f.hero.pos, 0);
    assert.equal(f.e.state, state); assert.equal(f.e.atk, null); assert.equal(f.counts.damage, 0); assert.equal(f.tokens.size, 0);
  });
  test("real damage callback triggers Qingya doBreak without old recovery", () => {
    const f = fixture(90);
    f.world.events.on("beforeDamage", (info) => {
      if (info.target === f.hero) { info.cancel = true; f.c.addPoise(12, "perfect"); }
    });
    f.e.updateAttack(f.e.atk.a.active + 0.01, f.hero.pos, 0);
    assert.equal(f.c.broken, true); assert.equal(f.e.state, "down"); assert.equal(f.e.atk, null); assert.equal(f.counts.damage, 0);
  });
  test("damage callback replacing attack preserves replacement identity", () => {
    const f = fixture(); let next;
    f.world.events.on("beforeDamage", (info) => { if (info.target === f.hero) { info.cancel = true; next = replaceAttack(f); } });
    f.e.updateAttack(f.e.atk.a.active + 0.01, f.hero.pos, 0);
    assert.equal(f.e.atk, next); assert.equal(f.e.t, 0.731); assert.equal(f.e.state, "strike"); assert.equal(f.counts.damage, 0);
  });
  test("resolved damage is not rolled back, but cancelled attack adds no later status or hit FX", () => {
    const f = fixture(), id = "__reentrancy_status";
    assert.equal(STATUS[id], undefined);
    STATUS[id] = {};
    try {
      f.e.atk.a = { ...f.e.atk.a, status: { id, dur: 1 } };
      f.world.events.on("damage", (info) => { if (info.target === f.hero) f.e.setState("cinematic", 3); });
      f.e.updateAttack(f.e.atk.a.active + 0.01, f.hero.pos, 0);
      assert.equal(f.counts.damage, 1); assert.equal(f.hero.statuses.has(id), false); assert.equal(f.counts.burst, 0); assert.equal(f.e.state, "cinematic");
    } finally { delete STATUS[id]; }
  });
  for (const source of ["event", "hook"]) test("windup strike " + source + " cancellation prevents later damage and summons", () => {
    const f = fixture(); let hookCalls = 0;
    f.e.atk.a = { ...f.e.atk.a, summon: {} };
    if (source === "event") f.world.events.on("enemy:strike", () => f.e.setState("cinematic", 3));
    f.c.onStrike = () => { hookCalls++; if (source === "hook") f.e.setState("down", 3); };
    f.e.state = "windup";
    f.e.updateAttack(f.e.atk.windup, f.hero.pos, 0);
    assert.equal(f.e.atk, null); assert.equal(f.counts.damage, 0); assert.equal(f.counts.summon, 0); assert.equal(hookCalls, source === "event" ? 0 : 1);
    assert.equal(f.e.state, source === "event" ? "cinematic" : "down");
  });
  test("strike hook replacement with unchanged strike state stops old hit", () => {
    const f = fixture(); let next;
    f.c.onStrike = () => { next = replaceAttack(f); };
    f.e.strike(); assert.equal(f.e.atk, next); assert.equal(f.counts.damage, 0); assert.equal(f.e.t, 0.731);
  });
  test("strike hook state-only takeover is preserved even with same attack object", () => {
    const f = fixture(), k = f.e.atk;
    f.c.onStrike = () => { f.e.state = "cinematic"; };
    f.e.strike(); assert.equal(f.e.atk, k); assert.equal(f.e.state, "cinematic"); assert.equal(f.counts.damage, 0);
  });
  test("strike event cancellation prevents projectile dispatch", () => {
    const f = fixture(); f.e.atk.a = { ...f.e.atk.a, shape: "projectile" };
    f.world.events.on("enemy:strike", () => f.e.goHome());
    f.e.strike(); assert.equal(f.e.state, "return"); assert.equal(f.counts.projectile, 0); assert.equal(f.counts.damage, 0);
  });
  test("summon callback cancellation stops remaining old strike", () => {
    const f = fixture(); f.e.atk.a = { ...f.e.atk.a, summon: {} };
    f.e.summon = () => { f.counts.summon++; f.e.setState("down", 3); };
    f.e.strike(); assert.equal(f.e.state, "down"); assert.equal(f.counts.summon, 1); assert.equal(f.counts.damage, 0);
  });
  test("multiple attack centers still hit the hero only once", () => {
    const f = fixture(); f.e.atk.a = { ...f.e.atk.a, radius: 3, lunge: 0 };
    f.e.atk.centers = [f.hero.pos.clone(), f.hero.pos.clone()];
    f.e.strike(); assert.equal(f.counts.damage, 1); assert.equal(f.counts.pillarFx, 2);
  });
  test("down isolation keeps real Enemy.update → QingyaCtrl.update decay running", () => {
    const rates = [1, 0.5].map((fraction) => {
      const f = fixture(60);
      f.e.setState("down", 999); f.ent.hp = f.ent.stats.get("hp") * fraction;
      const start = f.c.time;
      for (let i = 0; i < 8; i++) f.e.update(0.1, f.hero);
      const dt = f.c.time - start, rate = (60 - f.c.poise) / dt;
      assert(dt > 0.79); assert.equal(f.e.state, "down"); assert.equal(f.e.atk, null);
      assert.equal(f.events.filter((x) => x.name === "boss:poiseGain").length, 0);
      return rate;
    });
    assert(Math.abs(rates[0] - 8) < 1e-9); assert(Math.abs(rates[1] / rates[0] - 0.7) < 1e-9);
    console.log("DECAY_TRACE " + JSON.stringify({ full: rates[0], half: rates[1] }));
  });
  console.log("SUMMARY " + passed + "/" + passed);
}
