"""搜打撤经济 / 修为曲线蒙特卡洛模拟（v2：含灵潮推运、机缘刻度、委托 / 奇遇、关键物品护身）。

一次"通关"= 教学局 → 区域一若干局（山神庙遗府、Boss 青牙）→ 搬迁 → 区域二若干局（剑修遗府、Boss 碧鳞）→ 筑基。
每局：按玩家画像决定撤离时间 → 按时间生成击杀 / 精英 / 宝箱 / 灵光点 / 采集（暮夜数量 +30%）→ 灵潮倍率（感悟 + 可堆叠物品）
→ 储物袋取舍 → 撤离或身陨（关键物品不丢）→ 洞府：升级设施、聚气丹、炼化、突破。
"""
import math
import random
from dataclasses import dataclass, field

R_LEVEL = {"r1": (1, 4), "r2": (5, 9)}
SRC = ["感悟", "炼化", "丹药", "首杀/遗府", "委托/奇遇"]


@dataclass
class Item:
    kind: str  # stone / mat / core / bosscore / treasure / gear / herb_shouwu
    n: int = 1
    xp: float = 0  # 炼化可得修为（灵石按颗计，不在这里）
    cells: float = 1
    value: float = 1  # 灵值（用于取舍）
    rarity: int = 0
    level: int = 1
    key: bool = False  # 关键物品：身陨不损失、不占储物袋
    region: str = "r1"


@dataclass
class State:
    layer: int = 1  # 1..9 练气，10 筑基
    xp: float = 0
    stones: float = 0
    spring: int = 0  # 灵泉等级下标 0/1/2
    bag: int = 16
    boss_r1: bool = False
    boss_r2: bool = False
    ruin_r1: bool = False
    ruin_r2: bool = False
    shouwu: bool = False
    relocated: bool = False
    juqi_layer: int = 0
    cores: list = field(default_factory=list)  # 库存精英妖丹 [(区域, 修为)]
    bought: set = field(default_factory=set)
    lost_bag: list = None
    fortune: float = 0  # 机缘刻度
    pity: int = 0
    runs: int = 0
    minutes: float = 0
    deaths: int = 0
    deaths_r2: int = 0
    xp_src: dict = field(default_factory=lambda: {k: 0 for k in SRC})
    stone_in: float = 0
    stone_sink: float = 0
    stone_refined: float = 0
    discarded_value: float = 0
    lost_value: float = 0
    loot_moments: list = field(default_factory=list)  # (分钟, 品质 2 宝 / 3 仙 / 4 极)
    jackpot_src: list = field(default_factory=list)  # 极品来源（"fortune" = 机缘刻度兑现）
    log: list = field(default_factory=list)
    wasted: float = 0  # 练气九层封顶后溢出浪费的修为
    gained: float = 0
    cap_runs: int = 0
    tide_sum: float = 0
    bought_at: dict = field(default_factory=dict)  # 设施名 → 第几局结束后买到
    hl_stones: float = 0  # 化灵得到的灵石（经济复核 v1）
    hl_xp_items: float = 0  # 其中由妖丹 / 灵物化灵得到的
    garden_lv: int = 0  # 药园等级（v2：0 级开局 1 块地）
    garden_stones: float = 0  # 药园 + 灵田的灵草化灵所得
    lingtian: int = 0  # 遇到灵田的次数
    rf_spent: float = 0  # 重铸花掉的灵石
    rf_rolls: int = 0
    rf_k: int = 0  # 当前这件装备已重铸次数（价格 × growth^k）
    rf_first: int = 0  # 第一次重铸在第几局


# ---------------- 化灵（经济复核 v1，../经济复核_v1.md） ----------------
# 游戏里的灵值 = 基础 × 品质倍率 × 数量 × 等级系数（src/core/items.js valueOf）。sim 的 Item.value 只是取舍用的估价，这里换算成游戏灵值。
VALUE_MUL = [1, 3, 10, 40, 200]
GEAR_BASE = {"r1": 19, "r2": 41}  # 区域装备底材的平均基础灵值（青锋剑 18 / 布法衣 16 / 青玉佩 22；竹影剑 40 / 灵丝法衣 38 / 水灵佩 45）
# 修为物品：sim 里按炼化修为区分 → 游戏灵值（含物品自带品质：狼王遗骨灵品、灵蚌珠 / 水灵玉 / 千年竹心 / 狼王内丹宝品）
XP2VAL = {25: 30, 28: 32, 60: 70, 180: 1600, 80: 360, 52: 900, 52.5: 900, 240: 2400, 300: 2800}
MAT_VALUE = {"r1": 7, "r2": 16}  # 一份材料的平均灵值（凡品）


def hl_stones(H, kind, value, rarity=0, xp=0):
    """一件东西化灵得几块灵石。H["mode"]："current" = 现行公式（灵值 × 0.5）；"new" = recipes.js HUALING。"""
    if H["mode"] == "current":
        return math.floor(value * 0.5)
    if xp > 0:
        return math.floor(xp * H["fromXp"])
    raw = value * H["rate"].get(kind, H["rate"]["default"]) * H["rarityMul"][rarity]
    return math.floor(min(raw, H["cap"][rarity]))


def roll_rarity(rng, w):
    x = rng.random() * sum(w)
    acc = 0
    for i, p in enumerate(w):
        acc += p
        if x < acc:
            return i
    return len(w) - 1


def rround(rng, v):
    return int(v) + (1 if rng.random() < v % 1 else 0)


def tide_avg(P, region, T):
    """[0, T] 分钟内的平均灵潮倍率、暮夜时长占比（掉落按时间均匀累积）。"""
    edges = [0] + list(P["phases"][region]) + [math.inf]
    acc = dusk = 0.0
    for i in range(4):
        lo, hi = edges[i], min(edges[i + 1], T)
        if hi > lo:
            acc += (hi - lo) * P["tide"][i]
            if i >= 2:
                dusk += hi - lo
    return acc / T, dusk / T


class Sim:
    def __init__(self, P, profile, seed=0):
        self.P = P
        self.pname = profile
        self.prof = P["profiles"][profile]
        self.rng = random.Random(seed)
        self.s = State()

    # ---------------- 修为 ----------------
    def need(self):
        s = self.s
        return self.P["xp_need"][s.layer - 1] if s.layer <= 9 else math.inf

    def add_xp(self, n, src):
        """加修为：满层自动突破（练气小层）；练气九层封顶（需筑基丹），溢出浪费。返回实际获得。"""
        s, got = self.s, 0.0
        while n > 1e-9 and s.layer <= 9:
            k = min(self.need() - s.xp, n)
            s.xp += k
            got += k
            n -= k
            if s.xp >= self.need() - 1e-9:
                if s.layer < 9:
                    s.layer += 1
                    s.xp = 0
                    s.juqi_layer = 0
                else:
                    break
        if self.full_at_9() and n > 1e-9:
            s.wasted += n
        s.xp_src[src] += got
        s.gained += got
        return got

    def full_at_9(self):
        s = self.s
        return s.layer == 9 and s.xp >= self.need() - 1e-9

    # ---------------- 机缘刻度 ----------------
    def fortune_event(self, src, moments):
        """一次可能出极品的事件：先判自然极品，再判刻度兑现，否则加刻度。返回是否出极品。"""
        P, s, rng = self.P, self.s, self.rng
        F = P["fortune"]
        hit = rng.random() < P["jipin_p"].get(src, 0)
        how = src
        if not hit and s.fortune >= F["max"] and src in F["payout"]:
            hit, how = True, "fortune"
        if hit:
            s.fortune = 0
            moments.append((4, how == "fortune" and F.get("payout_key", False)))
            s.jackpot_src.append((how, s.runs, s.boss_r2))  # 第三项：是否在碧鳞首杀时 / 之后（对 v1 已无用）
            return True
        s.fortune = min(F["max"], s.fortune + F["add"].get(src, 0))
        return False

    # ---------------- 一局 ----------------
    def gen_loot(self, region, T, tide, dusk, night, frac):
        """按出行时长生成战利品。frac < 1 表示中途身陨（只拿到前 frac 的东西）。"""
        P, rng, s = self.P, self.rng, self.s
        lo, hi = R_LEVEL[region]
        lvl = lambda: max(1, min(9, rng.randint(lo, hi) + rng.choice([-1, 0, 1])))
        smul = P["stone_mul"][region] * tide
        items, insight, moments, events = [], 0.0, [], []

        def stones(a, b):
            items.append(Item("stone", rround(rng, rng.randint(a, b) * smul), region=region))

        def gear(rarity):
            items.append(Item("gear", 1, 0, 2, [4, 12, 40, 160, 3000][rarity], rarity, lvl(), region=region))
            if rarity >= 2:
                moments.append((rarity, False))

        kills = rround(rng, P["kill_rate"][region] * T * frac * self.prof["kill_mul"] * (1 + 0.3 * dusk))
        for _ in range(kills):
            insight += P["xp_kill"][region]
            if rng.random() < P["mob_stone_p"]:
                stones(*P["mob_stone"])
            if rng.random() < P["mob_mat_p"]:
                items.append(Item("mat", rround(rng, tide), 0, 0.1, 5, region=region))
            s.pity += 1
            if rng.random() < P["mob_gear_p"]:
                r = roll_rarity(rng, P["mob_gear_rarity"])
                if s.pity >= P["pity_mobs"] and r == 0:
                    r = 1
                if r >= 1:
                    s.pity = 0
                gear(r)
        # 稀有异种（怪物生态 v1）：每局按概率出现 0–1 只；感悟按精英倍率、保底宝品、灵石 20–40、本区域妖丹
        RV = P.get("rare_variant")
        if RV and rng.random() < RV["p"][region] * frac:
            insight += P["xp_kill"][region] * P["elite_mul"]
            stones(*RV["stones"])
            items.append(Item("core", 1, P["xp_core"][region], 1, 40, region=region))
            gear(3 if rng.random() < 0.1 else 2)
            s.rares = getattr(s, "rares", 0) + 1
        n_el = P["elites"][region] * frac
        elites = int(n_el) + int(rng.random() < n_el % 1) + (1 if night and frac >= 1 else 0)
        glows = int(round(rng.randint(*P["glows"][region]) * frac))
        for _ in range(elites):
            insight += P["xp_kill"][region] * P["elite_mul"]
            stones(*P["elite_stone"])
            wolf = region == "r1" or rng.random() < P["r2_wolf_core_frac"]
            for _ in range(rround(rng, tide)):  # 妖丹可堆叠 → 灵潮放大
                items.append(Item("core", 1, P["xp_core"][region], 1, 40, region="r1" if wolf else "r2"))
            if rng.random() < P["elite_gear_p"]:
                gear(roll_rarity(rng, P["elite_gear_rarity"]))
            events.append("elite")
        # 亭子（真气与炼化增益 v1）：每局 2–4 个，灵石同普通宝箱，其余是丹符（不计修为）
        if P.get("pavilion"):
            for _ in range(int(round(rng.randint(*P["pavilion"]["n"]) * frac))):
                stones(*P["pavilion"]["stones"])
        chests = ["chest_normal"] * int(round(P["chests"][region] * frac))
        if night and frac >= 1:
            chests.append("chest_night")
        for _ in range(glows):
            if rng.random() < P["glow_treasure_p"]:
                xp, cells, _w = P["treasures"][region][roll_rarity(rng, [t[2] for t in P["treasures"][region]])]
                items.append(Item("treasure", 1, xp, cells, xp * 0.8, region=region))
            else:
                chests.append("chest_glow")
        for c in chests:
            stones(*P["chest_stone"][c])
            if rng.random() < P["chest_gear_p"][c]:
                gear(roll_rarity(rng, P["chest_gear_rarity"][c]))
            if c != "chest_normal":
                events.append(c)
        for _ in range(int(round(P["gathers"][region] * frac))):
            items.append(Item("mat", rround(rng, 1.5 * tide), 0, 0.2, 5, region=region))
        if region == "r2" and not s.shouwu and not P["shouwu_from_ruin"] and rng.random() < P["shouwu_p"] * frac:
            items.append(Item("herb_shouwu", 1, 0, 4, 380, key=True))
        # 奇遇（每局 0–2 个，均匀）
        if P.get("encounter") and s.runs >= P["encounter"]["from_run"]:
            E = P["encounter"]
            for _ in range(int(round(rng.randint(0, 2) * frac))):
                insight_q = E["xp"][region]
                self.add_xp(insight_q, "委托/奇遇")
                s.fortune = min(P["fortune"]["max"], s.fortune + E["fortune"])
                if rng.random() < E["gear_p"]:
                    gear(2)
        rng.shuffle(events)
        return items, insight, moments, events

    def pack(self, items):
        """储物袋取舍：关键物品不占格；其余按灵值/格从高到低装，装不下的丢弃（记录丢弃灵值）。"""
        s, P = self.s, self.P
        keys = [i for i in items if i.key]
        items = [i for i in items if not i.key]
        st = sum(i.n for i in items if i.kind == "stone")
        mats = sum(i.n for i in items if i.kind == "mat")
        rest = [i for i in items if i.kind not in ("stone", "mat")]
        units = [("stone", 50.0)] * math.ceil(st / P["stone_stack"])
        units += [("mat", 30.0)] * math.ceil(mats / 10)
        units += [(i, i.value / i.cells) for i in rest]
        units.sort(key=lambda u: -u[1])
        used, kst, kmat, kept = 0.0, 0, 0, []
        for u, vpc in units:
            cells = 1 if u in ("stone", "mat") else u.cells
            if used + cells > s.bag:
                s.discarded_value += vpc * cells
                continue
            used += cells
            if u == "stone":
                kst += P["stone_stack"]
            elif u == "mat":
                kmat += 10
            else:
                kept.append(u)
        return min(kst, st), min(kmat, mats), kept, keys

    def run(self):
        P, rng, s = self.P, self.rng, self.s
        s.runs += 1
        if s.runs == 1:  # 教学局
            s.minutes += P["tutorial_min"] + P["between_min"]
            self.add_xp(P["start_xp_tutorial"], "首杀/遗府")
            s.log.append({"run": 1, "region": "tutorial", "layer": s.layer, "xp": s.xp, "gained": s.gained, "minutes": s.minutes,
                          "stones_in": 0, "sink": 0, "refined": 0, "deaths": 0, "fortune": 0})
            return
        region = "r2" if (s.boss_r1 and s.layer >= 5) else "r1"
        protected = region == "r2" and not s.relocated
        s.relocated = s.relocated or region == "r2"
        night = rng.random() < self.prof["night"]
        T = P["night_end"] if night else P["run_min"][region]
        p_ok = self.prof["p_extract"][region] * (0.92 if night else 1.0)
        ok = protected or rng.random() < p_ok
        frac = 1.0 if ok else rng.uniform(0.35, 1.0)
        tide, dusk = tide_avg(P, region, T * frac)
        s.tide_sum += tide
        s.minutes += T * frac + P["between_min"]
        boss_try = (region == "r1" and not s.boss_r1 and s.layer >= 4) or (
            region == "r2" and not s.boss_r2 and s.layer >= P["boss_r2_layer"] and s.shouwu)
        ruin_try = (region == "r1" and not s.ruin_r1 and s.runs >= P["ruin_r1_run"]) or (region == "r2" and not s.ruin_r2)
        items, insight, moments, events = self.gen_loot(region, T, tide, dusk, night, frac)
        if ruin_try and (ok or frac > 0.6):
            self.add_xp(P["xp_ruin_first"][region], "首杀/遗府")
            setattr(s, "ruin_" + region, True)
            events.append("ruin_first")
            if region == "r2" and P["shouwu_from_ruin"]:
                s.shouwu = True
        if boss_try:
            win_p = 0.85 if self.prof["p_extract"]["r1"] >= 0.85 else 0.65
            if rng.random() < win_p:
                self.add_xp(P["xp_boss_first"][region], "首杀/遗府")
                setattr(s, "boss_" + region, True)
                moments.append((2, False))  # 首杀保底宝品
                events.append("boss_first")
                if region == "r1":
                    items.append(Item("core", 1, P["xp_boss_core"]["r1"], 2, 160, region="boss"))
                ok, frac = True, max(frac, 1.0)  # Boss 出口 3 秒
        for ev in events:
            self.fortune_event(ev, moments)
        self.add_xp(insight * tide, "感悟")  # 感悟即得，受灵潮放大
        if s.lost_bag and region == "r2" and rng.random() < P["lostbag_retrieve_p"]:
            back, s.lost_bag = s.lost_bag, None
            k = P["lostbag_retrieve"]
            items += [Item(i.kind, max(1, int(i.n * k)) if i.kind in ("stone", "mat") else i.n, i.xp, i.cells, i.value, i.rarity, i.level, i.key, i.region)
                      for i in back if i.kind in ("stone", "mat", "gear") or rng.random() < k]
        st, mats, kept, keys = self.pack(items)
        value_run = st + mats * 5 + sum(i.value for i in kept)
        if not ok:
            s.deaths += 1
            keep = P["keep_on_death"][region]
            if region == "r2":
                s.deaths_r2 += 1
                s.lost_bag = [Item("stone", st), Item("mat", mats)] + kept
            s.lost_value += value_run * (1 - keep)
            st, mats = int(st * keep), int(mats * keep)
            kept = [i for i in kept if rng.random() < keep]
            moments = [m for m in moments if m[1] or rng.random() < keep]
        for m, _key in moments:
            s.loot_moments.append((s.minutes, m))
        for i in kept + keys:
            if i.kind == "herb_shouwu":
                s.shouwu = True
            if i.kind == "core":
                s.cores.append((i.region, i.xp))
        s.stones += st
        s.stone_in += st
        # 委托（结算时发奖，需撤离成功）
        if P.get("quest") and s.runs >= P["quest"]["from_run"] and ok:
            Q = P["quest"]
            n = rround(rng, self.prof["quest_take"])
            for _ in range(n):
                if rng.random() < self.prof["quest_done"]:
                    kind = roll_rarity(rng, Q["mix"])
                    if kind == 0:
                        self.add_xp(Q["xp"][region], "委托/奇遇")
                    elif kind == 1:
                        s.fortune = min(P["fortune"]["max"], s.fortune + Q["fortune"])
                    else:
                        s.stones += Q["stones"][region]
                        s.stone_in += Q["stones"][region]
        H = P.get("hualing")
        if H:
            # 装备：除了要穿的，其余化灵（极品留着用）
            for g in [i for i in kept if i.kind == "gear" and i.rarity < 4]:
                if rng.random() < H["gear_salvage"]:
                    v = GEAR_BASE[g.region] * VALUE_MUL[g.rarity] * (1 + 0.1 * (g.level - 1))
                    st = hl_stones(H, "gear", v, g.rarity)
                    s.stones += st
                    s.stone_in += st
                    s.hl_stones += st
            # 富余材料
            st = int(mats * H["mat_salvage"]) * hl_stones(H, "mat", MAT_VALUE[region])
            s.stones += st
            s.stone_in += st
            s.hl_stones += st
            # 灵物：现行公式下，化灵再炼化比直接炼化多 → 理性玩家全部化灵
            if H["mode"] == "current":
                per = P["xp_per_stone"][2 if s.relocated else s.spring]
                for t in [i for i in kept if i.kind == "treasure"]:
                    st = hl_stones(H, "treasure", XP2VAL.get(t.xp, t.xp), xp=t.xp)
                    if st * per > t.xp:
                        kept.remove(t)
                        s.stones += st
                        s.stone_in += st
                        s.hl_stones += st
                        s.hl_xp_items += st
        treasure_xp = sum(i.xp for i in kept if i.kind == "treasure")
        self.cave(region, treasure_xp)

    def cave(self, region, treasure_xp):
        P, s, rng = self.P, self.s, self.rng
        sink = min(s.stones, P["per_run_stone_sinks"][region])
        s.stones -= sink
        s.stone_sink += sink
        avail = lambda cond: cond == "always" or (cond == "r2" and s.relocated) or (cond.startswith("layer") and s.layer >= int(cond[5:]))
        for name, cost, cond, ess in P["upgrades"]:
            if name in s.bought:
                continue
            if avail(cond) and s.stones >= cost * (1 if ess else 2):  # 可选设施：手头有两倍余钱才买
                s.stones -= cost
                s.stone_sink += cost
                s.bought.add(name)
                s.bought_at[name] = s.runs
                if name == "灵泉Lv2":
                    s.spring = max(s.spring, 1)
                if name == "储物袋24":
                    s.bag = 24
                if name == "储物袋32":
                    s.bag = 32
                if name.startswith("药园Lv"):
                    s.garden_lv = max(s.garden_lv, int(name[4:]))
        if s.relocated:
            s.spring = 2  # 搬迁后灵泉 Lv3
        # 药园 v2 / 灵田（药园与重铸 v1）：灵草一半自用（炼丹）、一半化灵；按每块地每局的期望产量折成灵石
        G = P.get("garden2")
        if G:
            plots = G["plots"][s.garden_lv] + (G["relocate_bonus"] if s.relocated and s.garden_lv >= 1 else 0)
            per_plot = G["herbs_per_plot_run"] * G["growth"][s.garden_lv]
            st = plots * per_plot * G["herb_value"][region] * G["sell_frac"]
            if s.runs >= G["lingtian_min_run"] and rng.random() < G["lingtian_p"][region]:
                s.lingtian += 1
                st += G["lingtian_stones"][region]
            s.stones += st
            s.stone_in += st
            s.garden_stones += st
        # 重铸（炼器鼎）：留够下一个必需设施的钱，其余按比例拿去重铸（九层封顶后灵石炼不了修为，全部重铸）
        RF = P.get("reforge")
        if RF and "炼器鼎Lv1" in s.bought:
            reserve = next((c for n, c, cond, ess in P["upgrades"] if ess and n not in s.bought and avail(cond)), 0)
            share = 1.0 if self.full_at_9() else RF["share"]["r2" if s.relocated else "r1"]
            budget = max(0, s.stones - reserve) * share
            rar = RF["gear_rarity"]["r2" if s.relocated else "r1"]
            if s.runs % RF["new_gear_every"] == 0:
                s.rf_k = 0
            while True:
                cost = math.ceil(RF["stones"][rar] * min(RF["growth"] ** s.rf_k, RF["max_mul"]))
                if cost > budget:
                    break
                budget -= cost
                s.stones -= cost
                s.stone_sink += cost
                s.rf_spent += cost
                s.rf_rolls += 1
                s.rf_k += 1
                s.rf_first = s.rf_first or s.runs
        # 聚气丹：青牙首杀得丹方后可炼；每枚消耗 juqi_cores 枚精英妖丹（CURRENT 只认狼妖内丹）
        jc = P["juqi_cores"]
        usable = lambda: [c for c in s.cores if c[0] == "r1" or (c[0] == "r2" and P["juqi_r2"])]
        while s.boss_r1 and len(usable()) >= jc and s.juqi_layer < P["juqi_per_layer"] and not self.full_at_9():
            for c in usable()[:jc]:
                s.cores.remove(c)
            layer0 = s.layer
            self.add_xp(P["juqi_xp"][roll_rarity(rng, P["juqi_quality_p"])], "丹药")
            if s.layer == layer0:
                s.juqi_layer += 1
        # 现行化灵公式：剩下的妖丹化灵比炼化更划算 → 理性玩家化灵
        H = P.get("hualing")
        if H and H["mode"] == "current":
            per = P["xp_per_stone"][s.spring]
            keep = []
            for c in s.cores:
                st = hl_stones(H, "core", XP2VAL.get(c[1], c[1]), xp=c[1])
                if st * per > c[1]:
                    s.stones += st
                    s.stone_in += st
                    s.hl_stones += st
                    s.hl_xp_items += st
                else:
                    keep.append(c)
            s.cores = keep
        # 炼化：妖丹 → 灵物 → 灵石（满九层就不再炼化，灵石留着）
        if not self.full_at_9():
            self.add_xp(sum(c[1] for c in s.cores), "炼化")
            s.cores = []
            self.add_xp(treasure_xp, "炼化")
            rate = P["xp_per_stone"][s.spring]
            # 攒灵石：留出下一个"必需"设施的钱，其余炼化
            reserve = next((c for n, c, cond, ess in P["upgrades"] if ess and n not in s.bought and avail(cond)), 0)
            used = self.add_xp(max(0, s.stones - reserve) * rate, "炼化") / rate
            s.stones -= used
            s.stone_refined += used
        if self.full_at_9() and s.boss_r2 and s.shouwu and "炼丹炉Lv2" in s.bought:
            s.layer = 10
            s.minutes += P["zhuji_min"]
        if self.full_at_9():
            s.cap_runs += 1
        s.log.append({"run": s.runs, "region": region, "layer": s.layer, "xp": s.xp, "gained": s.gained, "minutes": s.minutes,
                      "stones_in": s.stone_in, "sink": s.stone_sink, "refined": s.stone_refined, "deaths": s.deaths, "fortune": s.fortune})

    def play(self, max_runs=60):
        while self.s.layer < 10 and self.s.runs < max_runs:
            self.run()
        return self.s


def monte_carlo(P, profile, n=2000, seed=1):
    return [Sim(P, profile, seed + k * 7919).play() for k in range(n)]
