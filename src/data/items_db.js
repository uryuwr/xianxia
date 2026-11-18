// 物品数据库（内容模块 D）：两区域闭环所需的全部物品。格式见 src/core/items.js；依据《最小闭环设计》§8、§9、§11。
// 调用 registerAllItems() 注册（本文件被导入时也会自动注册一次）。
//
// 本表在 core 格式之上的扩展字段：
//   el        五行（metal 金 / wood 木 / water 水 / fire 火 / earth 土），药材与材料用
//   region    主要产地（"r1" 青岚山外 / "r2" 竹海·溪谷）
//   xp        灵泉炼化可得修为（灵石按灵泉等级另算，见 recipes.js REFINE）
//   tier      妖丹 / 材料档次（1 普通、2 精英、3 Boss）
//   slot/base 装备栏位与 1 级基础属性（core 格式）；gear.stat：[[属性, 每级增加, 1 级数值], …]，掉落 / 炼器时由 src/game/loot.js
//             的 gearStats(inst) 按物品等级与品质算出实际基础属性 + 词条（装备生效请用 gearStats，而不是 def.base）
//   artifact  对应构筑系统 ARTIFACTS 的 id（src/data/items.js），bonusLevel 额外祭炼等级
//   teaches   功法残卷教会的 id（kind: "spell" 法术 | "xinfa" 心法 | "formation" 阵法），pages 需要集齐的页数
//   unlocks   丹方 / 器方解锁的配方 id（recipes.js 里配方的 recipe 字段 = 本物品 id）
//   use       丹药 / 符箓效果：hot 持续回血（3 秒）/ mp 回气 / xp 修为（按品质 rarity 0~3 取档）/ dmgTaken 本局减伤 / extract 撤离读条秒 / protectGear 护器
//   seed      灵草苗：{ herb: 成株名称, runs: 成熟所需出行次数, yield: [最少, 最多] }（药园，见 recipes.js GARDEN）
//   quest     剧情物品（不可化灵、不可丢弃）
//   tags      ["key"] = 关键物品（突破材料、遗府首通秘宝、剧情物品）：身陨不损失（流程模块判断 def.tags 或实例 tags；rollLoot 产出的实例也带上）
//   五行符 use：{ element, damage: { base, scale: { spell } }, radius, range, shieldMul }——在准星 / 面前 range 米处炸开半径 radius 的五行爆发，
//             对护盾按"克制"结算再 ×shieldMul（由整合 / 流程模块实现效果）
import { registerItems } from "../core/items.js";
import { SCROLLS, pageId, bookId } from "./gongfa.js";

const herb = (id, name, glyph, el, region, value, o = {}) => ({ id, name, glyph, cat: "herb", el, region, value, stack: 20, size: 1, ...o });
const mat = (id, name, glyph, cat, region, value, o = {}) => ({ id, name, glyph, cat, region, value, stack: 20, size: 1, ...o });

export const ITEM_DEFS = [
  // ---------------- 灵石 ----------------
  { id: "spirit_stone", name: "灵石", glyph: "石", cat: "stone", stack: 999, size: 1, value: 1, desc: "修士通用之物：可在灵泉炼化为修为，也用于设施与炼器" },

  // ---------------- 灵草（区域一）----------------
  herb("qingling_cao", "青灵草", "青", "wood", "r1", 4, { desc: "最常见的灵草，回春丹主药" }),
  herb("ninglu_hua", "凝露花", "露", "water", "r1", 5, { desc: "清晨含露而开，回气丹主药；亦可制黄纸" }),
  mat("tiejing_shi", "铁精石", "铁", "ore", "r1", 6, { el: "metal", desc: "含铁精的矿石，炼器基础材料" }),
  mat("ling_tu", "灵土", "土", "ore", "r1", 3, { el: "earth", desc: "带灵气的泥土，药园开垦所需" }),
  // ---------------- 灵草（区域二）----------------
  herb("hanlu_cao", "寒露草", "寒", "water", "r2", 12, { desc: "生于溪谷阴面，护脉丹主药" }),
  herb("zi_teng", "紫藤", "藤", "wood", "r2", 18, { size: 2, stack: 10, desc: "一捆坚韧紫藤，炼丹炼器皆用" }),
  herb("chiyan_guo", "赤炎果", "炎", "fire", "r2", 22, { desc: "断涧对岸的火属灵果，筑基丹辅药" }),
  herb("heshouwu", "千年何首乌", "乌", "earth", "r2", 380, { tags: ["key"], size: 4, stack: 1, rarity: 2, desc: "成形的千年灵根，筑基丹必需辅药" }),
  // 灵泉水：药引，洞府灵泉自取（炼丹时不消耗仓库物品）
  { id: "lingquan_shui", name: "灵泉水", glyph: "泉", cat: "herb", el: "water", stack: 20, size: 1, value: 0, desc: "洞府灵泉所出，炼丹药引（灵泉自取）" },

  // ---------------- 灵草苗（药园移植）----------------
  herb("seed_qingling", "青灵草苗", "苗", "wood", "r1", 6, { seed: { herb: "青灵草", runs: 1, yield: [3, 5] } }),
  herb("seed_ninglu", "凝露花苗", "苗", "water", "r1", 7, { seed: { herb: "凝露花", runs: 1, yield: [3, 5] } }),
  herb("seed_hanlu", "寒露草苗", "苗", "water", "r2", 16, { seed: { herb: "寒露草", runs: 1, yield: [3, 5] } }),
  herb("seed_ziteng", "紫藤苗", "苗", "wood", "r2", 22, { seed: { herb: "紫藤", runs: 2, yield: [2, 3] } }),
  herb("seed_chiyan", "赤炎果苗", "苗", "fire", "r2", 28, { seed: { herb: "赤炎果", runs: 2, yield: [3, 4] } }),

  // ---------------- 妖兽材料 ----------------
  mat("wolf_fang", "狼妖牙", "牙", "beast", "r1", 5, { el: "metal", desc: "炼器辅材" }),
  mat("wolf_hide", "狼皮", "皮", "beast", "r1", 6, { el: "wood", desc: "护器符、丹药囊扩容的材料" }),
  mat("stone_heart", "石傀心", "核", "beast", "r1", 14, { el: "earth", desc: "山神庙石傀体内的灵核碎块，炼器材料" }),
  mat("bat_wing", "蝠翼", "翼", "beast", "r2", 14, { el: "water", desc: "蝠妖薄翼，法衣与炼器鼎升级材料" }),
  mat("vine_heart", "藤心", "心", "beast", "r2", 16, { el: "wood", desc: "藤妖心髓，炼丹辅材" }),
  mat("ling_si", "灵丝", "丝", "beast", "r2", 20, { el: "wood", desc: "藤妖吐出的灵丝，储物袋与锦囊升级材料" }),
  mat("python_skin", "蟒皮", "蟒", "beast", "r2", 45, { size: 2, stack: 5, el: "water", desc: "水蟒蜕下的厚皮，鹿皮乾坤袋材料" }),
  mat("bilin_scale", "碧鳞", "鳞", "beast", "r2", 32, { el: "water", desc: "碧鳞水蟒的鳞片" }),
  // 日常材料（怪物生态 v1，docs/review/numeric/怪物生态_v1.md）：低阶怪多掉，精英 / 首领不掉；炼丹、画符、炼器、重铸、施肥都要用
  mat("gu_fen", "骨粉", "骨", "beast", "r1", 3, { el: "earth", desc: "山鼠、蛛妖、寒蟾的碎骨研成的粉：回春丹、五行符、重铸的辅材，也能代替灵土施肥（2 份抵 1 份）" }),
  mat("ya_yu", "鸦羽", "羽", "beast", "r1", 5, { el: "metal", desc: "鸦妖的墨羽：回气丹、遁地符的辅材" }),
  mat("du_nang", "毒囊", "囊", "beast", "r1", 6, { el: "wood", desc: "蛛妖、竹叶青的毒囊：护脉丹、竹影剑的辅材" }),
  mat("she_tui", "蛇蜕", "蜕", "beast", "r2", 12, { el: "wood", desc: "竹叶青蜕下的皮：护脉丹、灵丝法衣、蟒皮乾坤袋的材料" }),
  mat("chan_su", "寒蟾酥", "酥", "beast", "r2", 14, { el: "water", desc: "寒蟾背上的白浆：回气丹（寒露方）的主药" }),
  { id: "dan_sui", name: "妖丹碎片", glyph: "碎", cat: "core", region: "r1", size: 1, stack: 50, value: 4, xp: 4, desc: "小妖体内没成形的妖丹：攒够了可炼聚气丹（碎丹方），也是重铸的主材；灵泉炼化每片 4 修为" },
  // 稀有异种的专属材料（只有异种会掉）
  // 青牙 v2：首杀（及重复击杀 20%）掉落的专属材料——炼器鼎打"青牙剑"
  { id: "qingya_fang", name: "青牙之牙", glyph: "牙", cat: "beast", region: "r1", size: 1, stack: 5, value: 200, rarity: 2, el: "metal", desc: "狼王青牙的犬齿，青白如玉：炼制青牙剑的主材" },
  { id: "chilang_xin", name: "赤狼心", glyph: "心", cat: "core", region: "r1", size: 1, stack: 5, value: 120, xp: 60, rarity: 2, desc: "赤狼胸中一团不灭的火：炼制赤狼佩的主材（器方随赤狼掉落）" },
  { id: "xuanbat_xin", name: "玄蝠心", glyph: "心", cat: "core", region: "r2", size: 1, stack: 5, value: 260, xp: 140, rarity: 2, desc: "玄鳞蝠的心核，冷得像一块墨玉：炼制玄蝠法衣的主材（器方随玄鳞蝠掉落）" },

  // ---------------- 妖丹 ----------------
  { id: "wolf_core", name: "狼妖内丹", glyph: "丹", cat: "core", region: "r1", tier: 2, size: 1, stack: 10, value: 30, xp: 25, desc: "精英狼妖的内丹：炼化得修为，亦为聚气丹主药" },
  { id: "golem_core", name: "石傀灵核", glyph: "丹", cat: "core", region: "r1", tier: 2, size: 1, stack: 10, value: 32, xp: 28, desc: "炼化得修为" },
  { id: "wolfking_core", name: "狼王内丹", glyph: "丹", cat: "core", region: "r1", tier: 3, size: 2, stack: 1, value: 160, xp: 180, rarity: 2, desc: "青牙的内丹，修为大补" },
  { id: "bat_core", name: "蝠妖内丹", glyph: "丹", cat: "core", region: "r2", tier: 2, size: 1, stack: 10, value: 70, xp: 60, desc: "炼化得修为" },
  { id: "vine_core", name: "藤妖内丹", glyph: "丹", cat: "core", region: "r2", tier: 2, size: 1, stack: 10, value: 70, xp: 60, desc: "炼化得修为" },
  { id: "bilin_core", tags: ["key"], name: "碧鳞内丹", glyph: "丹", cat: "core", region: "r2", tier: 3, size: 2, stack: 1, value: 600, xp: 0, rarity: 3, desc: "筑基丹主药——留着炼丹，不要炼化" },

  // ---------------- 大件灵物（灵光点 / 遗府）----------------
  { id: "wolfking_bone", name: "狼王遗骨", glyph: "骨", cat: "treasure", region: "r1", size: 4, value: 120, xp: 70, desc: "狼窝深处的灵骨，炼化得大量修为（品质随机：灵品为主，品质越高修为越多）" },
  { id: "lingbang_zhu", name: "灵蚌珠", glyph: "珠", cat: "treasure", region: "r1", size: 1, stack: 5, value: 60, xp: 30, desc: "溪中灵蚌所孕（品质随机：灵品为主，宝品少见，仙品极少）" },
  { id: "water_jade", name: "水灵玉", glyph: "玉", cat: "treasure", region: "r2", size: 4, value: 240, xp: 200, desc: "瀑布下的灵玉：炼化修为，或用于炼器鼎升级、炼制玉佩（品质随机）" },
  { id: "zhuxin", name: "千年竹心", glyph: "竹", cat: "treasure", region: "r2", size: 4, value: 280, xp: 250, desc: "竹海深处的千年竹心，炼化得大量修为（品质随机）" },
  { id: "ling_yu", name: "灵玉", glyph: "玉", cat: "treasure", region: "r1", size: 1, stack: 10, value: 25, xp: 20, desc: "小块灵玉，玉佩材料" },

  // ---------------- 装备底材（实际属性由 loot.js 按等级与品质生成）----------------
  // gear.stat：[属性, 每级增加, 1 级数值]
  { id: "rust_sword", name: "锈剑", glyph: "剑", cat: "gear", size: 2, value: 4, level: 1, slot: "sword", base: [{ stat: "atk", type: "flat", value: 4 }], gear: { slot: "sword", stat: [["atk", 0, 4]] }, desc: "溪边捡到的锈剑，聊胜于无" },
  { id: "sword_qingfeng", name: "青锋剑", glyph: "剑", cat: "gear", region: "r1", size: 2, value: 18, slot: "sword", base: [{ stat: "atk", type: "flat", value: 6 }], gear: { slot: "sword", stat: [["atk", 2.5, 6]] } },
  { id: "sword_zhuying", name: "竹影剑", glyph: "剑", cat: "gear", region: "r2", size: 2, value: 40, slot: "sword", base: [{ stat: "atk", type: "flat", value: 8 }, { stat: "crit", type: "flat", value: 0.02 }], gear: { slot: "sword", stat: [["atk", 2.5, 8], ["crit", 0, 0.02]] } },
  { id: "robe_bu", name: "布法衣", glyph: "衣", cat: "gear", region: "r1", size: 2, value: 16, slot: "robe", base: [{ stat: "hp", type: "flat", value: 20 }, { stat: "def", type: "flat", value: 3 }], gear: { slot: "robe", stat: [["hp", 12, 20], ["def", 1, 3]] } },
  { id: "robe_lingsi", name: "灵丝法衣", glyph: "衣", cat: "gear", region: "r2", size: 2, value: 38, slot: "robe", base: [{ stat: "hp", type: "flat", value: 30 }, { stat: "def", type: "flat", value: 4 }], gear: { slot: "robe", stat: [["hp", 12, 30], ["def", 1.2, 4]] } },
  // 异种装备（怪物生态 v1）：底材自带特殊属性，器方随异种掉落；主材是宝品，所以炼出来至少宝品
  // 青牙剑（青牙 v2）：法剑底材，攻击成长高于竹影剑、自带攻速 +0.05、暴击 +2%；主材青牙之牙是宝品 → 炼出来至少宝品
  { id: "sword_qingya", name: "青牙剑", glyph: "剑", cat: "gear", region: "r1", size: 2, value: 80, slot: "sword", base: [{ stat: "atk", type: "flat", value: 12 }, { stat: "aspd", type: "flat", value: 0.05 }, { stat: "crit", type: "flat", value: 0.02 }], gear: { slot: "sword", stat: [["atk", 3, 12], ["aspd", 0, 0.05], ["crit", 0, 0.02]] }, desc: "以狼王之牙为脊锻成的法剑：出剑更快" },
  { id: "jade_chilang", name: "赤狼佩", glyph: "佩", cat: "gear", region: "r1", size: 2, value: 60, slot: "jade", base: [{ stat: "mp", type: "flat", value: 10 }, { stat: "aspd", type: "flat", value: 0.06 }, { stat: "crit", type: "flat", value: 0.03 }], gear: { slot: "jade", stat: [["mp", 6, 10], ["aspd", 0, 0.06], ["crit", 0, 0.03]] }, desc: "赤狼心炼成的玉佩：出剑更快、更狠" },
  { id: "robe_xuanbat", name: "玄蝠法衣", glyph: "衣", cat: "gear", region: "r2", size: 2, value: 70, slot: "robe", base: [{ stat: "hp", type: "flat", value: 40 }, { stat: "def", type: "flat", value: 4 }, { stat: "dashCdr", type: "flat", value: 0.1 }], gear: { slot: "robe", stat: [["hp", 12, 40], ["def", 1.2, 4], ["dashCdr", 0, 0.1]] }, desc: "玄蝠心与灵丝织成的法衣：闪身冷却 −10%" },
  { id: "jade_qing", name: "青玉佩", glyph: "佩", cat: "gear", region: "r1", size: 2, value: 22, slot: "jade", base: [{ stat: "mp", type: "flat", value: 10 }], gear: { slot: "jade", stat: [["mp", 6, 10]] } },
  { id: "jade_shuiling", name: "水灵佩", glyph: "佩", cat: "gear", region: "r2", size: 2, value: 45, slot: "jade", base: [{ stat: "mp", type: "flat", value: 25 }], gear: { slot: "jade", stat: [["mp", 9, 25]] } }, // 真气不自动回复：原"真气回复"并入真气上限
  // 栏位解锁赠送的基础款（progression.js grants，玩法系统 2026-11-17；数值策划已确认）：不进掉落池，弱于山神庙器方的布法衣 / 随机掉的青玉佩
  { id: "robe_cu", name: "粗布衣", glyph: "衣", cat: "gear", size: 2, value: 10, level: 1, slot: "robe", region: "r1", base: [{ stat: "hp", type: "flat", value: 12 }, { stat: "def", type: "flat", value: 1 }], gear: { slot: "robe", stat: [["hp", 10, 14], ["def", 0.8, 2]] }, desc: "练气三层时师门给的旧衣，炼器鼎也炼得出，聊胜于无；山神庙地窖有更好的法衣器方" },
  { id: "jade_su", name: "素玉坠", glyph: "佩", cat: "gear", size: 2, value: 8, level: 1, slot: "jade", base: [{ stat: "mp", type: "flat", value: 6 }], gear: { slot: "jade", stat: [["mp", 3, 6]] }, desc: "练气五层时得的一枚素玉，聊胜于无" },

  // ---------------- 法宝 / 法器 ----------------
  { id: "art_flying_sword", tags: ["key"], name: "青冥飞剑", glyph: "冥", cat: "artifact", slot: "artifact", size: 2, value: 400, rarity: 2, artifact: "flying_sword", artifactId: "flying_sword", desc: "剑修遗府所藏飞剑；第一件法宝自动成为本命，永不遗落" },
  { id: "art_seal", name: "镇山印", glyph: "印", cat: "artifact", slot: "artifact", size: 2, value: 900, rarity: 3, artifact: "seal", artifactId: "seal", desc: "碧鳞仙品掉落：祭出砸地震晕" },
  // 极品大奖（极低概率）：沿用构筑系统的法宝效果，额外祭炼等级 + 极品词条
  { id: "art_chixiao", name: "赤霄剑", glyph: "霄", cat: "artifact", slot: "artifact", size: 2, value: 3000, rarity: 4, artifact: "flying_sword", artifactId: "flying_sword", bonusLevel: 2, desc: "极品飞剑：剑光如赤霞" },
  { id: "art_qiankun", name: "乾坤镜", glyph: "镜", cat: "artifact", slot: "artifact", size: 2, value: 3000, rarity: 4, artifact: "gourd", artifactId: "gourd", bonusLevel: 2, desc: "极品法器：照摄妖物精血" },

  // ---------------- 功法残卷 ----------------
  { id: "scroll_sword_qi", name: "《剑气斩》", glyph: "卷", cat: "scroll", size: 1, value: 50, teaches: "sword_qi", kind: "spell", desc: "玄机子所授" },
  { id: "scroll_vine", tags: ["key"], name: "《缠藤诀》", glyph: "卷", cat: "scroll", size: 1, value: 120, rarity: 1, teaches: "vine", kind: "spell", desc: "山神庙地窖所藏" },
  { id: "scroll_frost", tags: ["key"], name: "《寒冰锥》", glyph: "卷", cat: "scroll", size: 1, value: 260, rarity: 2, teaches: "frost", kind: "spell", desc: "剑修遗府所藏" },
  { id: "scroll_fire_page", name: "《火符》残卷", glyph: "页", cat: "scroll", size: 1, stack: 3, value: 60, rarity: 1, teaches: "fire_talisman", kind: "spell", pages: 3, desc: "集齐三页可参悟火符" },
  // 功法体系 v2（战斗设计，docs/design/功法体系_v2.md；数值待数值策划复核）：残页 / 完本由 src/data/gongfa.js 的 SCROLLS 生成，说明文字从数据拼（不手写页数）
  ...SCROLLS.flatMap((s) => [
    { id: pageId(s.id), name: `《${s.name}》残页`, glyph: "页", cat: "scroll", size: 1, stack: 9, value: s.value, rarity: s.rarity, teaches: s.id, kind: "spell", pages: s.pages, desc: `集齐 ${s.pages} 页，回洞府仓库参悟《${s.name}》；已会的残页参悟可化为悟性` },
    { id: bookId(s.id), name: `《${s.name}》`, glyph: "卷", cat: "scroll", size: 1, value: s.value * s.pages, rarity: Math.min(3, s.rarity + 1), teaches: s.id, kind: "spell", desc: `完本：回洞府仓库即可参悟《${s.name}》` },
  ]),
  { id: "scroll_earth_shield", name: "《土遁护体》", glyph: "卷", cat: "scroll", size: 1, value: 300, rarity: 2, teaches: "earth_shield", kind: "spell", desc: "筑基所得" },
  { id: "xinfa_lingtai", name: "心法《灵台》", glyph: "台", cat: "scroll", size: 1, value: 180, rarity: 2, teaches: "lingtai", kind: "xinfa", desc: "神识 +30；探查时偶尔顺带探明下一格" },
  { id: "xinfa_dash_shadow", name: "心法《剑影》", glyph: "影", cat: "scroll", size: 1, value: 200, rarity: 2, teaches: "dash_shadow", kind: "xinfa" },
  { id: "xinfa_crit_thunder", name: "心法《雷引》", glyph: "引", cat: "scroll", size: 1, value: 220, rarity: 2, teaches: "crit_thunder", kind: "xinfa" },
  { id: "xinfa_vajra", name: "心法《金刚体》", glyph: "刚", cat: "scroll", size: 1, value: 200, rarity: 2, teaches: "vajra", kind: "xinfa" },
  { id: "xinfa_sharp", name: "心法《锋锐》", glyph: "锐", cat: "scroll", size: 1, value: 220, rarity: 2, teaches: "sharp", kind: "xinfa" },
  // 普攻流 / 身法心法（战斗 · 气势与身法 v1）：掉落见 src/data/loot.js SOURCES（elite / chest_glow / chest_night / ruin_repeat）
  { id: "xinfa_mom_gather", name: "心法《蓄势》", glyph: "蓄", cat: "scroll", size: 1, value: 160, rarity: 1, teaches: "mom_gather", kind: "xinfa", desc: "普攻积攒气势 +30%" },
  { id: "xinfa_mom_chain", name: "心法《连环》", glyph: "环", cat: "scroll", size: 1, value: 180, rarity: 1, teaches: "mom_chain", kind: "xinfa", desc: "普攻叠层增伤" },
  { id: "xinfa_mom_haste", name: "心法《满势》", glyph: "满", cat: "scroll", size: 1, value: 200, rarity: 2, teaches: "mom_haste", kind: "xinfa", desc: "势成时攻速、移速提升" },
  { id: "xinfa_mom_wave", name: "心法《余波》", glyph: "波", cat: "scroll", size: 1, value: 220, rarity: 2, teaches: "mom_wave", kind: "xinfa", desc: "蓄势斩剑气余波" },
  { id: "xinfa_mom_return", name: "心法《回锋》", glyph: "锋", cat: "scroll", size: 1, value: 220, rarity: 2, teaches: "mom_return", kind: "xinfa", desc: "蓄势斩命中返还闪身" },
  { id: "xinfa_dash_flow", name: "心法《流云》", glyph: "云", cat: "scroll", size: 1, value: 240, rarity: 2, teaches: "dash_flow", kind: "xinfa", desc: "闪身充能 +1" },

  // ---------------- 丹方 / 器方 / 阵盘 ----------------
  { id: "danfang_juqi", tags: ["key"], name: "丹方《聚气丹》", glyph: "方", cat: "recipe", size: 1, value: 80, rarity: 1, unlocks: "juqi", desc: "青牙首杀必得" },
  { id: "danfang_humai", tags: ["key"], name: "丹方《护脉丹》", glyph: "方", cat: "recipe", size: 1, value: 120, rarity: 1, unlocks: "humai" },
  { id: "danfang_zhuji", tags: ["key"], name: "丹方《筑基丹》", glyph: "方", cat: "recipe", size: 1, value: 400, rarity: 2, unlocks: "zhuji", desc: "碧鳞首杀必得" },
  // 丹方残页（用户定，2026-11-17）：集齐 pages 页在洞府仓库研读，按 pageTargets 顺序得一本还没拥有的丹方（已学会的配方也算拥有）；三本都有后只能化灵。
  //   规则在 src/game/gongfa.js（recipePageTarget / pageHint）与 facilities.js studyList；desc 由下方从数据生成
  { id: "danfang_page", name: "丹方残页", glyph: "页", cat: "recipe", size: 1, stack: 10, value: 20, pages: 5, pageTargets: ["danfang_juqi", "danfang_humai", "danfang_zhuji"] },
  { id: "qifang_chilang", name: "器方《赤狼佩》", glyph: "器", cat: "recipe", size: 1, value: 80, rarity: 1, unlocks: ["jade_chilang"], desc: "从赤狼身上找到的残方" },
  { id: "qifang_xuanbat", name: "器方《玄蝠法衣》", glyph: "器", cat: "recipe", size: 1, value: 120, rarity: 1, unlocks: ["robe_xuanbat"], desc: "从玄鳞蝠巢里找到的残方" },
  { id: "qifang_robe", tags: ["key"], name: "器方《法衣》", glyph: "器", cat: "recipe", size: 1, value: 100, rarity: 1, unlocks: ["robe", "robe2"], desc: "山神庙地窖所藏" },
  { id: "zhenpan_sword", tags: ["key"], name: "阵盘·剑阵", glyph: "阵", cat: "scroll", size: 1, value: 300, rarity: 2, teaches: "sword_array", kind: "formation", desc: "区域二灵光点首次固定" },

  // ---------------- 丹药（rarity 表示丹药品质，叫法同 RARITY：0 凡品 1 灵品 2 宝品 3 仙品）----------------
  { id: "huichun_dan", name: "回春丹", glyph: "春", cat: "pill", size: 1, stack: 5, value: 12, use: { hot: 80, dur: 3 }, desc: "3 秒内回复气血" },
  { id: "huiqi_dan", name: "回气丹", glyph: "气", cat: "pill", size: 1, stack: 5, value: 12, use: { mp: 40 }, desc: "回复 40 点真气（真气不会自行回复）" },
  { id: "juqi_dan", name: "聚气丹", glyph: "聚", cat: "pill", size: 1, stack: 5, value: 60, use: { xp: [60, 90, 120, 180] }, desc: "服下增加修为（每个小境界最多 3 枚）" },
  { id: "ningshen_dan", name: "凝神丹", glyph: "凝", cat: "pill", size: 1, stack: 5, value: 45, use: { sense: 20 }, desc: "出行前服用：本局神识 +20（探查更快，墨封下隐约见得宝光）" },
  { id: "humai_dan", name: "护脉丹", glyph: "脉", cat: "pill", size: 1, stack: 5, value: 50, use: { dmgTaken: -0.1 }, desc: "出行前服用：本局受到伤害 -10%" },
  { id: "zhuji_dan", tags: ["key"], name: "筑基丹", glyph: "基", cat: "pill", size: 1, stack: 3, value: 1200, rarity: 2, use: { breakthrough: "1:9" }, desc: "练气九层突破筑基必需" },

  // ---------------- 符箓 ----------------
  { id: "dundi_fu", name: "遁地符", glyph: "遁", cat: "talisman", size: 1, stack: 5, value: 15, use: { extract: 12 }, desc: "随处读条 12 秒撤离，受击打断" },
  ...[["metal", "金", "金符"], ["wood", "木", "木符"], ["water", "水", "水符"], ["fire", "火", "火符"], ["earth", "土", "土符"]].map(([el, g, name]) => ({
    id: "fu_" + el, name, glyph: g, cat: "talisman", el, size: 1, stack: 5, value: 10,
    use: { element: el, damage: { base: 30, scale: { spell: 1.2 } }, radius: 3.5, range: 6, shieldMul: 1 },
    desc: `五行符：在准星处炸开${g}行爆发，破${{ metal: "木", wood: "土", water: "火", fire: "金", earth: "水" }[el]}盾尤佳`,
  })),
  { id: "huqi_fu", name: "护器符", glyph: "护", cat: "talisman", size: 1, stack: 5, value: 30, use: { protectGear: 1 }, desc: "本局保护 1 件装备不遗落" },

  // ---------------- 剧情 / 设施 ----------------
  { id: "furnace_part", tags: ["key"], name: "炼器鼎残件", glyph: "鼎", cat: "quest", quest: !0, size: 4, value: 80, desc: "区域一灵光点：炼器鼎升阶所需" },
  { id: "jinnang_qiankun", tags: ["key"], name: "乾坤锦囊", glyph: "囊", cat: "quest", quest: !0, size: 1, value: 300, rarity: 2, desc: "碧鳞首杀：在炼器鼎上炼入，贴身锦囊升至 3 格" },
];

// 集页换丹方的说明文字：从 pages / pageTargets 生成（不手写页数与丹方名）
for (const d of ITEM_DEFS) if (d.pageTargets && !d.desc) {
  const nm = d.pageTargets.map((id) => ((ITEM_DEFS.find((x) => x.id === id) || {}).name || id).replace(/^丹方/, "").replace(/[《》]/g, ""));
  d.desc = `集齐 ${d.pages} 页可在洞府仓库研读，得一本还没有的丹方（依次：${nm.join(" → ")}）；都有了之后只能化灵`;
}
let done = !1;
export function registerAllItems() {
  if (done) return;
  registerItems(ITEM_DEFS);
  done = !0;
}
registerAllItems();
