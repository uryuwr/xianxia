"""数值参数：CURRENT = 《最小闭环设计 v1.1》+ 已实现代码（src/data/*.js、src/game/run/regions.js，2026-11-16）
+ 已批准的玩法改动（G3 关键物品护身、G4 机缘刻度、G5 局间 ≤ 90 秒、G6 八局节奏、G9 灵潮、G10 五行符 / 附灵）；
PROPOSED = 本评审建议的调整（每个参数只有一个值，可直接落地，见 ../numeric_proposal.json）。

凡是文档 / 代码都没有给出、模拟又必须的量（每分钟击杀数、玩家画像等），都标注为【假设】。
开发数据落地后，把对应字段改成真实值，重跑 run_all.py 即可。
"""
import copy

CURRENT = {
    # ---------------- 境界与修为（§10.2，src/data/progression.js） ----------------
    "xp_need": [100, 150, 220, 300, 400, 520, 660, 820, 1200],  # 练气1→2 … 练气9→筑基1，合计 4370
    "start_xp_tutorial": 60,
    "atk": lambda layer: 84 if layer >= 10 else 20 + 4 * (layer - 1),
    "hp": lambda layer: 720 if layer >= 10 else 200 + 30 * (layer - 1),
    "def": lambda layer: 36 if layer >= 10 else 5 + 2 * (layer - 1),
    "spell": lambda layer: 84 if layer >= 10 else 20 + 4 * (layer - 1),
    # ---------------- 修为来源（loot.js REGION_LOOT.insight / INSIGHT、items_db.js xp、recipes.js REFINE） ----------------
    "xp_kill": {"r1": 3, "r2": 8},
    "elite_mul": 8,
    "xp_boss_first": {"r1": 150, "r2": 400},
    "xp_ruin_first": {"r1": 80, "r2": 250},
    "xp_per_stone": [2, 3, 4],  # 灵泉 Lv1/2/3
    "xp_core": {"r1": 40, "r2": 90},  # 狼妖内丹（石傀灵核 45）/ 蝠妖、藤妖内丹
    "xp_boss_core": {"r1": 180},  # 狼王内丹；碧鳞内丹用于筑基丹
    # 灵光点大件：(炼化修为, 占格, 权重)。区域一：狼王遗骨 150 / 灵蚌珠 1–2 颗 ×70；区域二：水灵玉 300 / 千年竹心 360
    "treasures": {"r1": [(150, 4, 4), (105, 1.5, 3)], "r2": [(300, 4, 4), (360, 4, 3)]},
    "juqi_xp": [60, 90, 120, 180],  # 聚气丹 下/中/上/极
    "juqi_quality_p": [0.25, 0.4, 0.3, 0.05],  # 【假设】火候小游戏结果分布
    "juqi_per_layer": 3,
    "juqi_cores": 1,  # 每枚聚气丹消耗的精英妖丹（recipes.js juqi：wolf_core ×1）
    "juqi_r2": False,  # 区域二的蝠妖 / 藤妖内丹能否炼聚气丹（当前配方只认狼妖内丹）
    "r2_wolf_core_frac": 0.25,  # 【假设】区域二精英里狼妖的占比
    # ---------------- 天时 / 灵潮（regions.js REGIONS.phases、PHASES.tide；G9） ----------------
    "phases": {"r1": [4.5, 9, 12], "r2": [5, 9, 12]},  # 午 / 暮 / 夜 起点（分钟）
    "tide": [1.0, 1.2, 1.5, 2.0],  # 感悟与可堆叠物品数量 × tide（run.js applyTide）
    # ---------------- 单局节奏【假设】：§4.2 地图大小 + §10.3 + G5/G6 ----------------
    "run_min": {"r1": 8.5, "r2": 11.0},  # 正常撤离时间
    "night_end": 13.5,  # 贪到入夜的撤离时间
    "tutorial_min": 5,
    "between_min": 1.5,  # G5：局间 ≤ 90 秒
    "zhuji_min": 5,
    "kill_rate": {"r1": 3.3, "r2": 3.6},  # 每分钟普通妖兽击杀（暮夜 +30%）
    "elites": {"r1": 1.5, "r2": 2.5},
    "chests": {"r1": 3, "r2": 4},
    "glows": {"r1": (1, 3), "r2": (1, 3)},
    "glow_treasure_p": 0.5,  # 灵光点给大件灵物的概率（否则是灵光宝箱）
    "gathers": {"r1": 8, "r2": 10},
    "ruin_r1_run": 4,  # G6：山神庙第 4 局
    # ---------------- 掉落（loot.js SOURCES / REGION_LOOT.stoneMul） ----------------
    "stone_mul": {"r1": 1.0, "r2": 2.5},
    "mob_stone_p": 0.6,
    "mob_stone": (1, 3),
    "mob_mat_p": 0.5,
    "mob_gear_p": 0.04,
    "mob_gear_rarity": [80, 17, 3, 0, 0],
    "elite_stone": (6, 10),
    "elite_gear_p": 0.35,
    "elite_gear_rarity": [0, 60, 35, 5, 0],
    "chest_stone": {"chest_normal": (4, 9), "chest_glow": (12, 22), "chest_night": (25, 45)},
    "chest_gear_p": {"chest_normal": 0.10, "chest_glow": 0.40, "chest_night": 0.70},
    "chest_gear_rarity": {  # 极品单独由 jipin_p 判
        "chest_normal": [55, 35, 10, 0, 0],
        "chest_glow": [0, 50, 40, 10, 0],
        "chest_night": [0, 20, 52, 27.5, 0],
    },
    # 极品自然概率：Boss 首杀 1% + 10%×1%；夜明宝箱 70%×0.5%
    "jipin_p": {"boss_first": 0.011, "chest_night": 0.0035, "boss_repeat": 0.005},
    # 机缘刻度（loot.js FORTUNE，G4）
    "fortune": {"max": 100, "add": {"elite": 6, "chest_glow": 5, "chest_night": 10, "boss_first": 15, "boss_repeat": 10, "ruin_first": 8},
                "payout": ["boss_first", "boss_repeat", "chest_night"], "payout_key": False},
    "pity_mobs": 25,
    "stone_stack": 50,
    # ---------------- 风险（regions.js：keepBag / LOST_BAG；G3 关键物品不丢） ----------------
    "keep_on_death": {"r1": 0.5, "r2": 0.0},
    "lostbag_retrieve": 0.6,
    "lostbag_retrieve_p": 0.7,  # 【假设】下一局真的去捡的概率
    # 玩家画像【假设】：撤离成功率、贪到入夜的概率、击杀倍率、每局接委托数与完成率
    "profiles": {
        "谨慎": {"p_extract": {"r1": 0.95, "r2": 0.88}, "night": 0.1, "kill_mul": 0.9, "quest_take": 1.3, "quest_done": 0.85},
        "贪心": {"p_extract": {"r1": 0.85, "r2": 0.70}, "night": 0.6, "kill_mul": 1.15, "quest_take": 2.0, "quest_done": 0.75},
        "新手": {"p_extract": {"r1": 0.78, "r2": 0.60}, "night": 0.3, "kill_mul": 0.8, "quest_take": 1.5, "quest_done": 0.6},
    },
    # ---------------- 洞府花费（recipes.js FACILITIES / FORGE） ----------------
    "upgrades": [  # (名称, 灵石, 条件, 必需)；按优先级购买；必需项会让玩家攒灵石（不全拿去炼化）
        ("炼丹炉Lv1", 30, "always", True),
        ("炼器鼎Lv1", 60, "always", True),
        ("药园Lv1", 50, "always", False),
        ("灵泉Lv2", 120, "always", True),
        ("储物袋24", 80, "layer3", True),
        ("锦囊2", 60, "layer4", False),
        ("丹药囊扩容", 80, "always", False),
        ("炼丹炉Lv2", 200, "r2", True),  # 筑基丹需要炼丹炉 Lv2
        ("炼器鼎Lv2", 300, "r2", False),
        ("储物袋32", 200, "layer7", False),
        ("药园Lv2", 200, "r2", False),
        ("附灵", 80, "r2", False),
        ("滴血认主", 100, "r2", False),
        ("丹药囊扩容2", 80, "r2", False),
    ],
    # 每局固定石费：区域一 遁地符 10 + 五行符 15；区域二 护器符 40 + 五行符 15 + 遁地符 10
    "per_run_stone_sinks": {"r1": 25, "r2": 65},
    # ---------------- 进度门槛 ----------------
    "boss_r2_layer": 9,  # 文档：练气九层 + 千年何首乌后挑战碧鳞
    "shouwu_from_ruin": False,
    "shouwu_p": 0.45,  # 【假设】区域二每局遇到千年何首乌的概率
    # ---------------- 委托 / 奇遇（G7、G8：已批准、未实现，数值空缺） ----------------
    "quest": None,
    "encounter": None,
    # ---------------- 战斗（combat.js、player.js、skills.js、shields.js、enemies.js） ----------------
    "combo_scale": [1.0, 1.0, 1.6],
    "combo_time": [0.42, 0.42, 0.50],
    "crit": 0.10,
    "crit_dmg": 1.6,
    "shield_frac": 0.45,
    "shield_counter": 3.0,
    "shield_other": 0.25,
    "shield_phys": 0.15,
    "fu": {"base": 30, "k": 1.2, "shieldMul": 2.0, "n": 3},  # 五行符（items_db.js fu_*）：按克制结算再 ×shieldMul
    "imbue_frac": 0.5,  # 附灵：普攻对对应护盾按"克制"的 50% 结算
    "spells": {
        "剑气斩": {"el": "metal", "base": 30, "k": 1.6, "cd": 8, "hits": 2.0},  # 3 道扇形，大目标约中 2 道
        "火符": {"el": "fire", "base": 70, "k": 3.5, "cd": 10, "hits": 1.0},
        "寒冰锥": {"el": "water", "base": 120, "k": 6.0, "cd": 12, "hits": 1.0},
        "缠藤诀": {"el": "wood", "base": 6, "k": 0.4, "cd": 14, "hits": 8.0},  # 4 秒每 0.5 秒一跳
    },
    "counter_of": {"wood": "metal", "earth": "wood", "water": "earth", "fire": "water", "metal": "fire"},
    "enemy_def": {"r1": 0, "r2": 8, "elite_r1": 20, "elite_r2": 22, "boss_r1": 25, "boss_r2": 40},
    "boss_hp": {"r1": 1800, "r2": 7000},
    "boss_shields": {"r1": ["wood", "earth"], "r2": ["fire", "earth", "wood"]},
    "boss_shield_frac_each": 0.45,
    "effective_atk": {1: 24, 3: 38, 5: 56, 7: 78, 9: 100, 10: 150},  # §10.6（含平均装备）
    # 敌人（enemies.js）：(数据等级, 气血, 防御)；刷怪等级 = 主角层数夹在区域区间内，气血 ×(1 + hp_scale × 等级差)，防御 ×(1 + 0.08 × 等级差)
    "enemies": {"wolf": (1, 60, 0), "wolf_grey": (1, 42, 0), "golem": (2, 110, 28), "bat": (5, 160, 6), "vine": (5, 200, 10),
                "wolf_elite": (1, 600, 20), "vine_elite": (6, 1400, 22)},
    "hp_scale": 0.27,
}

PROPOSED = copy.deepcopy(CURRENT)
PROPOSED.update({
    # ===== P0 进度与卡关 =====
    "boss_r2_layer": 8,  # 碧鳞练气八层即可挑战
    "shouwu_from_ruin": True,  # 千年何首乌 = 剑修遗府首通固定奖励（关键物品），不再是随机灵草
    # ===== P1 修为收入 =====
    "elite_mul": 5,
    "xp_kill": {"r1": 2, "r2": 6},
    "xp_core": {"r1": 25, "r2": 60},
    "treasures": {"r1": [(80, 4, 4), (52, 1.5, 3)], "r2": [(240, 4, 4), (300, 4, 3)]},  # 狼王遗骨 80、灵蚌珠 35/颗
    # ===== P1 灵石：区域一普通宝箱加量、符箓降价，可选设施降价（否则 70–99% 的玩家 v1 内买不起，内容闲置） =====
    "chest_stone": {"chest_normal": (6, 12), "chest_glow": (12, 22), "chest_night": (25, 45)},
    "upgrades": [(n, {"炼器鼎Lv2": 180, "药园Lv2": 100, "储物袋32": 150}.get(n, c), cond, e) for n, c, cond, e in CURRENT["upgrades"]],
    # ===== P1 聚气丹 =====
    "juqi_cores": 2,
    "juqi_r2": True,
    # ===== P1 机缘刻度 =====
    "fortune": {"max": 100, "add": {"elite": 6, "chest_glow": 5, "chest_night": 10, "boss_first": 15, "boss_repeat": 10, "ruin_first": 8},  # 增量不变
                "payout": ["elite", "chest_glow", "chest_night", "boss_first", "boss_repeat"], "payout_key": True},
    "jipin_p": {"boss_first": 0.03, "chest_night": 0.01, "boss_repeat": 0.01},
    # ===== P2 掉落手感 =====
    "mob_gear_p": 0.06,
    "mob_gear_rarity": [70, 25, 5, 0, 0],
    "pity_mobs": 40,
    # ===== P2 风险 =====
    "keep_on_death": {"r1": 0.5, "r2": 0.25},
    "per_run_stone_sinks": {"r1": 15, "r2": 40},  # 遁地符 ×2 20→10、五行符 ×3 15→10、护器符 40→25
    # ===== 委托 / 奇遇（G7、G8 数值） =====
    "quest": {"from_run": 5, "mix": [0.5, 0.25, 0.25], "xp": {"r1": 40, "r2": 100}, "fortune": 12, "stones": {"r1": 30, "r2": 60}},
    "encounter": {"from_run": 6, "xp": {"r1": 20, "r2": 40}, "fortune": 5, "gear_p": 0.25},
    # ===== P0 五行护盾 =====
    "shield_frac": 0.40,
    "shield_counter": 2.0,
    "shield_other": 0.20,
    "shield_phys": 0.25,
    "boss_shield_frac_each": 0.25,
    "boss_hp": {"r1": 2400, "r2": 7000},
    "fu": {"base": 30, "k": 1.2, "shieldMul": 1.0, "n": 3},  # 五行符：一组 3 张 ≈ 打穿一面同级精英盾（原 ×2 时 1 张就破）
    "imbue_frac": 0.35,  # 附灵：普攻按克制的 35%（原 50% 时普攻破盾比法术还快）
    "spells": {**CURRENT["spells"], "缠藤诀": {"el": "wood", "base": 10, "k": 0.7, "cd": 14, "hits": 8.0}},
})


# ======================================================================================
# 难度曲线复核 v1（../难度曲线复核_v1.md）：用 tools/scenarios/num_ttk.mjs 的运行时实测回填
#   REVIEW_BEFORE = 复核前的游戏（= PROPOSED 已落地）；REVIEW_AFTER = 本次改动 + 战斗开发的攻速 0.8 起步 / 闪身 1 次充能
# 实测（机器人按住左键追着打，单位：秒；work/num_ttk_*_final.json）：
#   每只普通怪的平均交战时间（成群一起打）：区域一 0.50 → 1.06，区域二 0.78 → 1.73；精英：区域一 7.2 → 11.6，区域二 ≈13 → 12.3
#   真人比机器人慢（走位、瞄准、闪避），按 ×1.5 折算；击杀数 / 局不变，多出的时间加到单局时长上：
#     区域一：28 只 × 0.84 + 1.5 精英 × 6.6 ≈ +34 秒 → 8.5 → 9.1 分钟；区域二：40 只 × 1.43 ≈ +57 秒 → 11 → 12.0 分钟
#   撤离成功率【假设】：击杀不回血 + 普通群不闪避掉血 10–25%、精英群 20–90%（复核前普通群 0%）→ 各画像下调 2–6 个百分点
# 战斗参数（c5 / c6 用）：有效攻击取实测（练气一层锈剑 24 … 八层宝品 86），敌人气血 / 防御取改后数据表
# ======================================================================================
REVIEW_BEFORE = copy.deepcopy(PROPOSED)
REVIEW_BEFORE["effective_atk"] = {1: 24, 3: 37.8, 4: 44.6, 5: 51.5, 6: 63.6, 8: 86.2, 9: 93.4, 10: 150}
REVIEW_AFTER = copy.deepcopy(REVIEW_BEFORE)
REVIEW_AFTER.update({
    "run_min": {"r1": 9.1, "r2": 12.0},
    "night_end": 14.3,
    "profiles": {
        "谨慎": {**PROPOSED["profiles"]["谨慎"], "p_extract": {"r1": 0.93, "r2": 0.85}},
        "贪心": {**PROPOSED["profiles"]["贪心"], "p_extract": {"r1": 0.82, "r2": 0.66}},
        "新手": {**PROPOSED["profiles"]["新手"], "p_extract": {"r1": 0.72, "r2": 0.54}},
    },
    "enemies": {"wolf": (1, 140, 0), "wolf_grey": (1, 90, 0), "golem": (2, 225, 28), "bat": (5, 360, 6), "vine": (5, 440, 10),
                "wolf_elite": (4, 1500, 26), "vine_elite": (9, 4250, 29)},
    "hp_scale": 0.15,
    "shield_frac": 0.30,
    "boss_hp": {"r1": 3000, "r2": 12000},
    "boss_shield_frac_each": 0.15,  # 青牙 0.15；碧鳞 0.2（c6 只用一个值，取保守）
    "spells": {**PROPOSED["spells"],
               "剑气斩": {"el": "metal", "base": 16, "k": 0.6, "cd": 8, "hits": 3.0},  # 实际还有 0.5 × 攻击（combat.py 只按法力算，偏保守）
               "缠藤诀": {"el": "wood", "base": 7, "k": 0.5, "cd": 14, "hits": 8.0}},
})


# ======================================================================================
# 经济复核 v1（../经济复核_v1.md）：化灵（以前的 sim 完全没算化灵，等于假设玩家从不化灵）
#   ECON_NO_HL  = REVIEW_AFTER（不化灵，上一轮的隐含假设）
#   ECON_CURRENT = 现行公式（灵值 × 0.5），理性玩家：灵物 / 妖丹化灵再炼化比直接炼化多就化灵
#   ECON_NEW    = recipes.js HUALING（只把装备、富余材料化灵；灵物 / 妖丹直接炼化）
#   【假设】装备除了要穿的 80% 化灵；材料四成富余拿去化灵
# ======================================================================================
_HL_COMMON = {"gear_salvage": 0.8, "mat_salvage": 0.4}
ECON_NO_HL = copy.deepcopy(REVIEW_AFTER)
ECON_CURRENT = copy.deepcopy(REVIEW_AFTER)
ECON_CURRENT["hualing"] = {"mode": "current", **_HL_COMMON}
ECON_NEW = copy.deepcopy(REVIEW_AFTER)
ECON_NEW["hualing"] = {"mode": "new", **_HL_COMMON,
                       "rate": {"gear": 0.25, "mat": 0.25, "default": 0.2},  # 与 src/data/recipes.js HUALING 一致
                       "rarityMul": [1, 0.8, 0.4, 0.25, 0.1], "cap": [10, 25, 60, 150, 300], "fromXp": 0.2}
# 灵光点改动（品质随机、候选点加倍、守卫）：灵蚌期望修为 52 → 44；区域一被精英守着的灵光点每局约 +0.3 个精英
ECON_NEW["treasures"] = {"r1": [(80, 4, 4), (44, 1.5, 3)], "r2": [(240, 4, 4), (300, 4, 3)]}
ECON_NEW["elites"] = {"r1": 1.8, "r2": 2.5}


# ======================================================================================
# 药园与重铸 v1（../药园与重铸_v1.md）：在 ECON_NEW 上加药园 v2、灵田、重铸开销
#   药园设施：0 级开局 1 块地；Lv1 50（灵土 3）、Lv2 100（灵土 6，练气三层起）、Lv3 200（灵土 10，搬迁后）——都按"可选"购买
#   【假设】每块地每局平均产出 2.5 份灵草（种子 1–2 局成熟、每茬 3–5 份，十年 / 五十年种子为主），× 生长倍率；一半自用一半化灵
#   一份灵草的化灵灵石：区域一 1.6（青灵草 / 凝露花 4–5 灵值，品质均值 ×1.6，× 0.25），区域二 5（寒露草 / 紫藤 / 赤炎果 12–22）
#   灵田：第 3 局起，区域一 20% / 二 25%；一片 5–8 株，每株 2 份灵草（高一档）+ 0.5 颗种子 → 化灵一半 ≈ 区域一 12 / 区域二 35 灵石
#   重铸：炼器鼎 Lv1 后；区域一把余钱的 15%、区域二 50% 拿去重铸（九层封顶后 100%）；区域一按灵品（30）、区域二按宝品（80）定价，
#         同一件装备 ×1.15 / 次（封顶 ×4），每 2 局换一件新装备（计数清零）
# ======================================================================================
ECON_GR = copy.deepcopy(ECON_NEW)
ECON_GR["upgrades"] = [u for u in ECON_NEW["upgrades"] if not u[0].startswith("药园")] + [
    ("药园Lv1", 50, "always", False), ("药园Lv2", 100, "layer3", False), ("药园Lv3", 200, "r2", False)]
ECON_GR["garden2"] = {"plots": [1, 2, 3, 4], "growth": [1, 1.25, 1.6, 2], "relocate_bonus": 1, "herbs_per_plot_run": 2.5,
                      "herb_value": {"r1": 1.6, "r2": 5}, "sell_frac": 0.5,
                      "lingtian_min_run": 3, "lingtian_p": {"r1": 0.2, "r2": 0.25}, "lingtian_stones": {"r1": 12, "r2": 35}}
ECON_GR["reforge"] = {"stones": [None, 30, 80, 200, 500], "growth": 1.15, "max_mul": 4, "share": {"r1": 0.15, "r2": 0.5},
                      "gear_rarity": {"r1": 1, "r2": 2}, "new_gear_every": 2}


# ======================================================================================
# 真气与炼化增益 v1（../真气与炼化增益_v1.md）：在 ECON_GR 上加
#   亭子：每局 2–4 个，灵石 6–12（× 区域倍率、灵潮）
#   真气不再自动回复【假设】：法术省着放，清小怪略慢 → 单局时长 +2%
#   灵气充盈（炼化后 5–8 分钟减伤 4–12%、气血 +3–8%）【假设】：撤离成功率 +1 个百分点
#   小境界常驻加成（progressBonus 0.5）：平均约 +¼ 层属性，影响已含在上一条里
# ======================================================================================
ECON_MP = copy.deepcopy(ECON_GR)
ECON_MP["pavilion"] = {"n": (2, 4), "stones": (6, 12)}
ECON_MP["run_min"] = {k: round(v * 1.02, 2) for k, v in ECON_GR["run_min"].items()}
ECON_MP["night_end"] = round(ECON_GR["night_end"] * 1.02, 2)
ECON_MP["profiles"] = {k: {**v, "p_extract": {r: min(0.98, x + 0.01) for r, x in v["p_extract"].items()}} for k, v in ECON_GR["profiles"].items()}


# ======================================================================================
# 怪物生态 v1 + 关卡 区域规划 v2（关卡设计实测：真实地形、300 种子、贪心路线到入暮 / 入夜收手；docs/review/level/区域规划_v2.md）
#   普通撤离局：区域一 8.9 分钟，接触 低 2.5 / 标 3.1 / 高 2.0 组 × 3.3 只、精英 2.5、灵光 1.6、宝箱 7.2、采集 8.4
#              区域二 12.0 分钟，接触 低 2.3 / 标 2.2 / 高 2.9 组 × 3.7 只、精英 3.2、灵光 1.3、宝箱 8.1、采集 8.2
#   小怪灵石：低阶 40% × 1.5、标准 60% × 2 → 按低阶占比（41% / 36%）混合约 52%
#   异种：区域一 0.35、区域二 0.40 × 路线覆盖率（88% / 76%）
# ======================================================================================
ECON_ECO = copy.deepcopy(ECON_MP)
ECON_ECO["run_min"] = {"r1": round(8.9 * 1.02, 2), "r2": round(12.0 * 1.02, 2)}
ECON_ECO["kill_rate"] = {"r1": round(7.6 * 3.3 / 8.9, 2), "r2": round(7.4 * 3.7 / 12.0, 2)}
ECON_ECO["elites"] = {"r1": 2.5, "r2": 3.2}
ECON_ECO["chests"] = {"r1": 7, "r2": 8}
ECON_ECO["glows"] = {"r1": (1, 2), "r2": (1, 2)}
ECON_ECO["gathers"] = {"r1": 8, "r2": 8}
ECON_ECO["mob_stone_p"] = 0.52
ECON_ECO["rare_variant"] = {"p": {"r1": round(0.35 * 0.88, 3), "r2": round(0.40 * 0.76, 3)}, "stones": (20, 40)}

# 回调（怪物生态 v1）：精英每局多了约 40%、宝箱翻倍 → 精英感悟倍率 5 → 4，普通宝箱灵石 6–12 → 5–10
ECON_ECO2 = copy.deepcopy(ECON_ECO)
ECON_ECO2["elite_mul"] = 4
ECON_ECO2["chest_stone"] = {**ECON_ECO["chest_stone"], "chest_normal": (5, 10)}
ECON_ECO3 = copy.deepcopy(ECON_ECO2)
ECON_ECO3["elite_mul"] = 3

# 青牙 v2 / 仙品武器（2026-11-17，用户"练四拿仙品剑就斩了青牙"）：区域一的仙品权重下调（游戏里按 region: "r1" 分条，只动区域一）。
# 这里对两个区域一起改，是经济影响的上界。
ECON_XIAN = copy.deepcopy(ECON_ECO)
ECON_XIAN["elite_gear_rarity"] = [0, 65, 33, 2, 0]
ECON_XIAN["chest_gear_rarity"] = {**ECON_ECO["chest_gear_rarity"], "chest_glow": [0, 55, 40, 5, 0], "chest_night": [0, 30, 60, 10, 0]}
