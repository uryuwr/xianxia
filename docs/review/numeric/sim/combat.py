"""战斗 TTK（击杀所需时间 / 次数）与承伤分析。公式与 src/core/combat.js 一致：
   伤害 = (base + atk×scale.atk + spell×scale.spell) × 暴击期望 × 100/(100+def)
五行护盾与 src/game/shields.js 一致：护盾存在时本体不掉血；克制五行 ×counter，其他五行 ×other，无属性 ×phys。
"""
import math

# 文档 §13 法术获得时间（境界层数：1..9 练气，10 筑基）与法术栏
SPELL_UNLOCK = {"剑气斩": 1, "缠藤诀": 3, "寒冰锥": 7, "火符": 8}
# 法术栏：以 src/data/progression.js 已实现为准（第 2 栏练气三层、第 3 栏练气七层）
SLOTS = lambda layer: 1 if layer < 3 else (2 if layer < 7 else 3)


def crit_mul(P):
    return 1 + P["crit"] * (P["crit_dmg"] - 1)


def def_mul(d):
    return 100 / (100 + max(0, d))


def combo_dps(P, atk, enemy_def):
    dmg = sum(P["combo_scale"]) * atk * crit_mul(P) * def_mul(enemy_def)
    return dmg / sum(P["combo_time"])


def hits_to_kill(P, atk, hp, enemy_def):
    seq = P["combo_scale"]
    dealt, h = 0.0, 0
    while dealt < hp and h < 99:
        dealt += seq[h % 3] * atk * crit_mul(P) * def_mul(enemy_def)
        h += 1
    return h


def eff_atk(P, layer):
    t = P["effective_atk"]
    if layer in t:
        return t[layer]
    ks = sorted(t)
    for a, b in zip(ks, ks[1:]):
        if a < layer < b:
            return t[a] + (t[b] - t[a]) * (layer - a) / (b - a)
    return t[ks[-1]]


def spells_at(layer):
    have = [s for s, lv in SPELL_UNLOCK.items() if lv <= layer]
    return have


def spell_hit(P, name, layer, enemy_def):
    sp = P["spells"][name]
    return (sp["base"] + sp["k"] * P["spell"](layer)) * sp["hits"] * crit_mul(P) * def_mul(enemy_def)


def best_loadout(P, layer, shield_el):
    """在法术栏数内，优先带克制护盾的法术，其次带伤害最高的。"""
    have = spells_at(layer)
    ctr = P["counter_of"][shield_el] if shield_el else None
    have.sort(key=lambda n: (P["spells"][n]["el"] != ctr, -P["spells"][n]["base"]))
    return have[: SLOTS(layer)]


def shield_break_time(P, layer, shield_hp, shield_el, enemy_def, prep="spell"):
    """边普攻边按冷却放法术，打穿一层护盾所需秒数（首轮法术在 0 秒释放）。
    prep："spell" 只靠法术栏；"fu" 另带一组克制五行符（0 / 0.8 / 1.6 秒各掷一张）；"imbue" 法剑附灵克制五行。"""
    atk = eff_atk(P, layer)
    ctr = P["counter_of"][shield_el]
    phys_mul = P["shield_counter"] * P["imbue_frac"] if prep == "imbue" else P["shield_phys"]
    phys_dps = combo_dps(P, atk, enemy_def) * phys_mul
    load = best_loadout(P, layer, shield_el)
    t, sh, nxt = 0.0, shield_hp, {n: 0.0 for n in load}
    if prep == "fu":
        F = P["fu"]
        fu_hit = (F["base"] + F["k"] * P["spell"](layer)) * crit_mul(P) * def_mul(enemy_def) * P["shield_counter"] * F["shieldMul"]
        fu_t = [0.8 * i for i in range(F["n"])]
    dt = 0.1
    while sh > 0 and t < 600:
        if prep == "fu" and fu_t and t >= fu_t[0]:
            fu_t.pop(0)
            sh -= fu_hit
        for n in load:
            if t >= nxt[n]:
                mul = P["shield_counter"] if P["spells"][n]["el"] == ctr else P["shield_other"]
                sh -= spell_hit(P, n, layer, enemy_def) * mul
                nxt[n] = t + P["spells"][n]["cd"]
        sh -= phys_dps * dt
        t += dt
    return t, load


def body_time(P, layer, hp, enemy_def):
    atk = eff_atk(P, layer)
    return hp / combo_dps(P, atk, enemy_def)


def elite_ttk(P, layer, hp, el, enemy_def):
    sh = hp * P["shield_frac"]
    t1, load = shield_break_time(P, layer, sh, el, enemy_def)
    # 破盾后易伤 30%、眩晕 2.5 秒；本体用普攻 + 法术（粗略：普攻 dps×1.3）
    t2 = body_time(P, layer, hp, enemy_def) / 1.3
    return t1, t2, load


def boss_ttk(P, region, layer):
    hp = P["boss_hp"][region]
    d = P["enemy_def"]["boss_" + region]
    total, parts = 0.0, []
    for el in P["boss_shields"][region]:
        t, load = shield_break_time(P, layer, hp * P["boss_shield_frac_each"], el, d)
        parts.append((el, round(t, 1), load))
        total += t
    total += body_time(P, layer, hp, d) / 1.15  # 破盾窗口易伤
    return total, parts


# 承伤：敌人一击占主角气血的比例
ENEMY_HITS = {
    "r1 狼妖扑咬": ("r1", 8, 1.0, lambda lv: 10 + (lv - 1) * 4 / 3),
    "r1 首领连扑": ("r1", 14, 1.0, lambda lv: 16),
    "r2 普通妖兽": ("r2", 12, 1.0, lambda lv: 18 + (lv - 5) * 2.5),
    "r2 精英重击": ("r2", 24, 1.2, lambda lv: 28),
}


def hit_pct(P, name, layer, region_level):
    reg, base, k, atk = ENEMY_HITS[name]
    dmg = (base + k * atk(region_level)) * def_mul(P["def"](layer))
    return dmg / P["hp"](layer)


def scaled(P, name, L):
    """enemies.js scaledStats：返回 (气血, 防御)。"""
    lv, hp, d = P["enemies"][name]
    dd = L - lv
    return hp * max(0.4, 1 + P["hp_scale"] * dd), d * max(0.5, 1 + 0.08 * dd)
