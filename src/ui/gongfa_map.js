// 功法来源小签：只遍历 MapModel 已见点；来源/概率从规则反查，缓存随事件和地图版本失效。
import { gongfaSources, itemsOfGongfa, pageHint } from "../game/gongfa.js";
import { SPELLS } from "../data/skills.js";
import { SOURCES } from "../data/loot.js";
import { enemyLootSource } from "../game/loot.js";
import { defOf } from "../core/items.js";
import { gapGroups } from "./gongfa_hint.js";

const clean = (s) => String(s || "").replace(/（.*?）/g, "");
const hasItem = (list, ids, region, enemy) => (list || []).some((e) => (!e.region || e.region === region) && (!e.enemy || [].concat(e.enemy).includes(enemy)) && (ids.includes(e.item) || e.pick?.some(([id]) => ids.includes(id))));
export class GongfaMap {
  constructor(run) {
    this.run = run;
    this.dirty = true;
    this.ver = 0;
    this.tags = [];
    this.off = [];
    const dirty = (type) => { if (type === "progress" || type === "channel") return; this.dirty = true; ++this.ver; };
    for (const emitter of [run.bag, run.profile.storage, run.containers, run]) {
      const off = emitter?.on?.(dirty);
      if (typeof off === "function") this.off.push(off);
    }
  }
  invalidate() { this.dirty = true; ++this.ver; }
  refresh() {
    const r = this.run, M = r.mapModel, P = r.profile;
    const on = P.flags.gongfaMapTag !== false;
    if (!this.dirty && this.mapVer === M.ver && this.on === on) return;
    this.dirty = false; this.mapVer = M.ver; this.on = on;
    this.tags = [];
    if (!on) return;
    const ids = [...new Set(gapGroups(P, r.region).flatMap((g) => g.cands))];
    const merged = new Map();
    const add = (key, pos, id, source, status = "") => {
      let tag = merged.get(key);
      if (!tag) merged.set(key, tag = { pos, ids: [], lines: [], label: "" });
      if (tag.ids.includes(id)) return;
      tag.ids.push(id);
      const item = itemsOfGongfa(id).find((k) => defOf({ id: k })?.pages) || itemsOfGongfa(id)[0];
      const hint = item && pageHint(P, item, r.bag);
      tag.lines.push(`${SPELLS[id].name} · ${source.where} · ${source.tier}${status ? " · " + status : ""}${hint ? "\n" + hint.text : ""}`);
    };
    for (const id of ids) {
      const itemIds = itemsOfGongfa(id), srcs = gongfaSources(id).filter((s) => s.region === r.region);
      for (const [mark, t] of M.things) {
        if (t.kind !== "chest" || t.state === "empty") continue;
        const src = mark.lootSrc || (mark.altar ? "pavilion" : `chest_${t.tier || "normal"}`);
        if (!hasItem(SOURCES[src], itemIds, r.region)) continue;
        const found = srcs.find((s) => mark.stele ? s.src === "stele" && clean(s.where) === clean(t.label) : s.src === src);
        if (found) add(mark, t.pos, id, found, t.state === "searched" ? "已搜" : t.state === "opened" ? "已开" : "");
      }
      for (const [key, gp] of M.groups) {
        if (gp.boss || gp.cleared) continue;
        for (const e of gp.members) {
          if (e.noLoot) continue;
          const src = enemyLootSource(e.type, P);
          if (!hasItem(SOURCES[src], itemIds, r.region, e.type)) continue;
          const found = srcs.find((s) => s.src === src && (["异种", "妖兽", "小妖", "头目"].includes(s.where) || s.where.split(" / ").some((n) => n === e.def?.name || n === e.entity?.name)));
          if (found) add(key, gp.pos, id, found);
        }
      }
      for (const d of r.map.points.ruins || []) {
        if (!M.now.dens.has(d.id) && !M.old.dens.has(d.id)) continue;
        const cleared = P.flags["den_" + d.id] || P.flags[d.id + "_cleared"];
        const found = srcs.find((s) => s.src === (cleared ? "ruin_repeat" : "ruin_first") && (cleared || clean(s.where) === clean(d.name)));
        if (found) add(d, d.pos, id, found, M.now.dens.has(d.id) ? "" : "旧日所见");
      }
      const boss = r.map.points.boss;
      if (boss?.pos && (M.now.boss || M.old.boss) && !M.bossDead()) {
        const found = srcs.find((s) => s.src === (P.flags["boss_" + boss.id] ? "boss_repeat" : "boss_first") && clean(s.where) === clean(boss.name));
        if (found) add(boss, boss.pos, id, found, M.now.boss ? "" : "旧日所见");
      }
    }
    this.tags = [...merged.values()];
    for (const t of this.tags) {
      t.label = t.ids.map((id) => SPELLS[id].name).join(" · ");
      t.tip = t.lines.join("\n\n");
    }
  }
  draw(g, X, Z, icons) {
    this.refresh();
    g.save();
    g.font = "20px KaiTi, serif";
    g.textAlign = "left"; g.textBaseline = "middle";
    for (const t of this.tags) {
      const x = X(t.pos.x) + 24, y = Z(t.pos.z) + 24;
      const w = Math.min(240, g.measureText(t.label).width + 18);
      if (x < 0 || y < 12 || x + w > g.canvas.width || y + 14 > g.canvas.height) continue;
      g.fillStyle = "rgba(247,242,229,.95)"; g.fillRect(x, y - 14, w, 28);
      g.fillStyle = "#8a6a22"; g.fillRect(x, y - 14, 3, 28);
      g.fillStyle = "#343735"; g.fillText(t.label, x + 9, y, w - 18);
      icons.push({ x: x + w / 2, y, x0: x, y0: y - 14, w, h: 28, tip: t.tip, gongfa: true });
    }
    g.restore();
  }
  dispose() { for (const off of this.off) off(); this.off.length = 0; this.tags.length = 0; }
}
