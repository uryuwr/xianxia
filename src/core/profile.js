// 存档（共享契约）：玩家的长期进度。局内不存档；进入洞府、出行前、撤离结算后、突破后保存（见最小闭环设计 §3.2）。
// localStorage 键：moxian.save.<slot>（slot = 1 | 2 | 3），附 version 便于迁移。
//
// 各模块只读写自己负责的字段（见 docs/开发约定_v1.md）：
//   realm / xp                 修炼与突破（洞府模块）
//   storage / equip / pouch    物品（流程模块、洞府模块）
//   build                      法术 / 法宝 / 阵法 / 心法装配（构筑系统，沿用 src/game/skills 的 loadout 结构）
//   unlocks                    栏位与功能解锁旗标（统一由 progression 写入）
//   cave                       洞府设施等级、药园地块、所在区域（洞府模块）
//   map                        各区域着墨、已发现撤离点、遗府状态（关卡模块）
//   lostBag                    遗落储物袋（流程模块）
//   flags / stats              剧情旗标、统计
import { Bag } from "./bag.js";

export const SAVE_VERSION = 1;
const KEY = (slot) => "moxian.save." + slot;

export function newProfile(slot = 1) {
  return {
    version: SAVE_VERSION,
    slot,
    created: Date.now(),
    playTime: 0, // 秒
    name: "林墨",
    realm: { stage: 0, layer: 0 }, // stage 0 凡人 / 1 练气 / 2 筑基；layer 层数
    xp: 0, // 当前修为
    storage: new Bag(Infinity, { name: "洞府仓库" }),
    pouch: new Bag(1, { maxItemSize: 1, name: "贴身锦囊" }), // 贴身锦囊（格数随等级 1→3）
    bagCapacity: 16, // 储物袋格数（16 / 24 / 32）
    equip: { sword: null, robe: null, jade: null, artifact: null }, // 物品实例
    nativeArtifact: null, // 本命法宝 uid
    build: { spells: [null, null, null], formation: null, xinfa: [] },
    unlocks: {}, // 例如 { spellSlots: 1, xinfaSlots: 0, artifactSlot: false, formationSlot: false, robeSlot: false, jadeSlot: false, pillSlots: 1, doubleJump: false, sword_fly: false }
    cave: { region: "r1", facilities: {}, garden: [] },
    map: {}, // regionId → { inked: [...], extracts: [...], ruins: {...} }
    lostBag: null, // { region, pos: [x, y, z], items: [...] }
    flags: {},
    stats: { runs: 0, extracted: 0, deaths: 0, kills: 0 },
  };
}

export function saveProfile(p) {
  const j = JSON.stringify({ ...p, savedAt: Date.now() });
  localStorage.setItem(KEY(p.slot), j);
  return j.length;
}

export function loadProfile(slot) {
  const raw = localStorage.getItem(KEY(slot));
  if (!raw) return null;
  const p = JSON.parse(raw);
  p.storage = Bag.from(p.storage);
  p.pouch = Bag.from(p.pouch);
  return migrate(p);
}

export function listSaves() {
  return [1, 2, 3].map((slot) => {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return { slot, empty: !0 };
    try {
      const p = JSON.parse(raw);
      return { slot, realm: p.realm, runs: p.stats && p.stats.runs, playTime: p.playTime, savedAt: p.savedAt };
    } catch {
      return { slot, broken: !0 };
    }
  });
}

export function deleteSave(slot) {
  localStorage.removeItem(KEY(slot));
}

function migrate(p) {
  // 版本迁移：以后改存档结构时在这里补字段
  const base = newProfile(p.slot);
  for (const k of Object.keys(base)) if (p[k] === undefined) p[k] = base[k];
  p.version = SAVE_VERSION;
  return p;
}
