# -*- coding: utf-8 -*-
"""构筑与成长 v1 · 投放与地图：刷点 / 每局容器与敌人数量 / 定向刷目标局（真实高度场）。

  1. 每个候选点：所在分区、风险、离入口（三个入口的平均 / 最近）、离最近常驻古阵的纯跑图秒数、"进出暴露" = 入口→点→古阵。
  2. 每局"刷出来"的数量：按 level.js 的抽取规则（宝箱 / 灵光宝箱 / 亭 / 残碑 / 灵光点 / 精英间距 / 异种 / 刷怪轮转取前 spawnPacks 组 /
     刷怪点 mobs 循环 · 栖息地随机）蒙特卡洛，按分区、按怪种拆开。
  3. 每局"实际接触"的数量：贪心路线 + 停留 + 撤离读条，三种策略：
       dusk  = 入暮前撤离（预算 540 秒）；night = 入夜前撤离（720 秒）；greedy = 全拿（入夜后拿夜明宝箱）。
     局型：普通 / 遗府 / 首领。
  4. 定向刷目标局：先把目标来源全部走一遍（路上绕路 ≤ DETOUR 米的刷怪组算"被迫打"），再按 dusk 策略顺手拿别的。
  5. 提案点位（PROPOSALS）：校验可站 / 可达，报同样的距离与风险。

运行（docs/review/level 下）：
  node tools/export_hf.mjs ../../../src/data/levels/r1.js _cache/bld_r1   （r2 同理）
  ./.venv/Scripts/python tools/build_drops.py [n_seed=1000]
输出：../../design/构筑与成长_v1/04_data.json、04_data.txt
"""
import json, math, os, random, sys
from collections import Counter, defaultdict

import numpy as np
from matplotlib.path import Path
from scipy.sparse.csgraph import dijkstra

sys.path.insert(0, os.path.dirname(__file__))
from lvl import Map, SPEED  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.normpath(os.path.join(ROOT, "..", "..", "design", "构筑与成长_v1"))
N_SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1000

# src/data/enemies.js ENCOUNTER.habitats / elites / rares
HAB = {
    "r1": {"low": {"burrow": ["rat"], "grass": ["rat"], "nest": ["crow"], "rock": ["crow", "spider"], "ruin": ["spider", "crow"], "water": ["rat"]},
           "std": {"grass": ["wolf", "wolf_grey"], "nest": ["wolf", "wolf_grey"], "burrow": ["wolf_grey"], "ruin": ["golem", "wolf_grey"], "rock": ["golem", "wolf_grey"], "water": ["wolf"]}},
    "r2": {"low": {"grass": ["snake"], "water": ["snake", "toad"], "rock": ["toad"], "nest": ["snake"], "burrow": ["snake"], "ruin": ["toad"]},
           "std": {"grass": ["vine", "wolf"], "water": ["vine", "bat"], "rock": ["bat"], "nest": ["bat"], "ruin": ["vine"], "burrow": ["wolf"]}},
}
ELITES = {"r1": ["wolf_elite"], "r2": ["wolf_elite_r2", "vine_elite"]}
RARE = {"r1": "chilang", "r2": "xuanlin_bat"}
PHASES = {"r1": [270, 540, 720], "r2": [300, 540, 720]}  # src/game/run/regions.js
CHANNEL_MUL = [1, 1, 1.5, 2]
# 停留（秒）：沿用区域规划 v2 / 评审 v1；亭（搜取探查）8、残碑（拓）6、异种按精英 ×2 估
DWELL = {
    "r1": {"pack": 18, "elite": 35, "glow": 45, "chest": 4, "gchest": 4, "pav": 8, "stele": 6, "gather": 3, "den": 200, "boss": 150, "rare": 70, "night": 4},
    "r2": {"pack": 26, "elite": 50, "glow": 55, "chest": 4, "gchest": 4, "pav": 8, "stele": 6, "gather": 3, "den": 300, "boss": 240, "rare": 100, "night": 4},
}
BUDGET = {"dusk": 540, "night": 720, "greedy": 1e9}
DETOUR = 16.0  # 目标局：刷怪组离路线的绕路 ≤ 16 米（约离路 8 米、进仇恨圈）算"被迫打"

# 提案点位（构筑与成长 v1 · 04 §2）：[(区域, 名称, 坐标)]
PROPOSALS = [
    ("r1", "法宝匣·狼王石后", (50, -28.2)),
    ("r1", "雷击木·乱石岗南", (92, -26)),
    ("r1", "雷击木·乱石岗西", (72, -24)),
    ("r1", "雷击木·北岭东", (44, -54)),
    ("r1", "雷击木·北岭西", (-40, -58)),
    ("r1", "雷击木·东麓丘", (80, 40)),
    ("r2", "雷击木·北脊西", (-64, -78)),
    ("r2", "雷击木·北脊东", (30, -78)),
    ("r2", "雷击木·东岭", (120, -30)),
    ("r2", "岩髓·孤峰脚", (88, -42)),
    ("r2", "岩髓·东岭北", (110, -64)),
    ("r2", "岩髓·断涧东南", (104, 16)),
    ("r2", "剑冢·剑碑西", (-50, -36)),
    ("r2", "剑冢·剑碑北", (-38, -48)),
    ("r2", "阵台·孤峰下（现阵盘点）", (90, -58)),
    ("r2", "阵台·东岭（现阵盘点）", (84, -20)),
]


# 构筑与成长 v1 · 04 §1：分区的"道途"标签（每个流派在每个区域各有 2 个分区）
DAO = {
    "r1": {"zhulin": ["身法", "五行"], "donglu": ["剑势", "雷暴"], "miao": ["五行", "守御"], "luanshi": ["雷暴", "守御"], "beiling": ["身法", "剑势"]},
    "r2": {"xigu": ["身法", "五行"], "zhuhai_n": ["剑势", "五行"], "dongtai": ["守御", "雷暴"], "duanjian": ["身法", "守御"], "beiji": ["剑势", "雷暴"]},
}
# PROP=1：方案版——补亭子候选（竹林、乱石岗、北脊各 1 座），看各流派的容器是否均衡
EXTRA_PAV = {
    "r1": [{"id": "p_lingbang", "name": "灵蚌池亭", "pos": [-26, 16]}, {"id": "p_luanshi", "name": "乱石岗石亭", "pos": [70, -18]}],
    "r2": [{"id": "p_beiji", "name": "北脊亭", "pos": [-90, -80]}],
}
PROP = os.environ.get("PROP") == "1"


def xz(p):
    return (float(p[0]), float(p[1]))


def zone_of(Z, p):
    best = None
    for z in Z:
        if Path(z["poly"]).contains_point(p) and (best is None or z["danger"] > best["danger"]):
            best = z
    return best


class Region:
    def __init__(self, rid):
        self.rid = rid
        self.M = M = Map(os.path.join(ROOT, "_cache", "bld_" + rid))
        self.D = D = M.def_
        self.P = P = D["points"]
        if PROP:
            P["pavilions"]["from"] = P["pavilions"]["from"] + EXTRA_PAV.get(rid, [])
        self.Z = [dict(z, danger=z.get("danger", z.get("risk", 1))) for z in D["zones"]]
        self.zid = {z["id"]: z for z in self.Z}
        self.ents = [xz(p) for p in P["entries"]]
        self.gates = [xz(g["pos"]) for g in P["gates"]]
        pts = list(self.ents) + list(self.gates)
        pts += [xz(p) for p in P["ruins"]["from"]] + [xz(p) for p in P["chests"]["from"] + P["chests"].get("glowFrom", [])]
        pts += [xz(p) for g in P["gathers"] for p in g["from"]] + [xz(g["pos"]) for g in P["glows"]["from"]]
        pts += [xz(p) for p in P["elites"]["from"]] + [xz(d["pos"]) for d in P["dens"]] + [xz(P["boss"]["pos"])]
        pts += [xz(s["pos"]) for s in P["spawns"]] + [xz(q["pos"]) for q in P["pavilions"]["from"]] + [xz(q["pos"]) for q in P["steles"]["from"]]
        pts += [xz(q["pos"]) for q in P["rares"]["from"]] + [xz(e["pos"]) for e in P.get("encounters", [])] + [xz(r["pos"]) for r in P.get("relics", [])]
        pts += [xz(p[2]) for p in PROPOSALS if p[0] == rid]
        self.keys = list(dict.fromkeys((round(p[0], 2), round(p[1], 2)) for p in pts))
        self.K = {k: i for i, k in enumerate(self.keys)}
        G = M.graph(jumps=True, diag=True)
        idx = [M.snap(k) for k in self.keys]
        self.Dm = dijkstra(G, directed=True, indices=idx)[:, idx]

    def d(self, a, b):
        return self.Dm[self.K[(round(a[0], 2), round(a[1], 2))], self.K[(round(b[0], 2), round(b[1], 2))]]

    def zone(self, p):
        z = zone_of(self.Z, p)
        return z["id"] if z else "?"

    # ---------------- 一局的抽取（复刻 src/world/level.js）
    def roll(self, rng):
        P, rid = self.P, self.rid
        S = {}
        S["entry"] = rng.choice(self.ents)
        C = P["chests"]
        S["chest"] = [xz(p) for p in rng.sample(C["from"], C["pick"] - C["glow"])]
        S["gchest"] = [xz(p) for p in rng.sample(C["glowFrom"], C["glow"])]
        S["gather"] = [xz(p) for g in P["gathers"] for p in rng.sample(g["from"], g["pick"])]
        S["glow"] = [(g["kind"], xz(g["pos"])) for g in rng.sample(P["glows"]["from"], P["glows"]["pick"])]
        E, bp = P["elites"], xz(P["boss"]["pos"])
        cand = E["from"][:]
        rng.shuffle(cand)
        el = []
        for p in cand:
            if len(el) >= E["pick"]:
                break
            if math.dist(p[:2], bp) < E.get("bossClear", 30) or any(math.dist(p[:2], q) < E.get("minGap", 25) for q in el):
                continue
            el.append(xz(p))
        S["elite"] = [(rng.choice(ELITES[rid]), p) for p in el]
        lo, hi = P["pavilions"]["pick"]
        S["pav"] = [xz(q["pos"]) for q in rng.sample(P["pavilions"]["from"], lo + rng.randrange(hi - lo + 1))]
        lo, hi = P["steles"]["pick"]
        S["stele"] = [(q["zone"], xz(q["pos"])) for q in rng.sample(P["steles"]["from"], lo + rng.randrange(hi - lo + 1))]
        R = P["rares"]
        S["rare"] = [xz(rng.choice(R["from"])["pos"])] if rng.random() < R["chance"] else []
        # 刷怪：最高风险区抽 1 组，其余按分区由浅到深轮转，取前 spawnPacks 组
        sp = [dict(s, risk=self.zid[s["zone"]]["danger"]) for s in P["spawns"]]
        top = max(s["risk"] for s in sp)
        first = rng.choice([s for s in sp if s["risk"] == top])
        rest = [s for s in sp if s is not first]
        rng.shuffle(rest)
        groups = {}
        for s in rest:
            groups.setdefault(s["zone"], []).append(s)
        order = sorted(groups.values(), key=lambda g: g[0]["risk"])
        out = [first]
        while any(order):
            for g in order:
                if g:
                    out.append(g.pop(0))
        packs = []
        for s in out[: self.D["spawnPlan"]["packs"]]:
            n = s.get("pack", 3)
            if s.get("mobs"):
                types = [s["mobs"][i % len(s["mobs"])] for i in range(n)]
            else:
                H = HAB[rid]
                low, std = H["low"].get(s["habitat"], []), H["std"].get(s["habitat"], [])
                if s["tier"] == "low" and low:
                    types = [rng.choice(low) for _ in range(n)]
                else:
                    types = [rng.choice(std) for _ in range(n)]
                    if s["tier"] != "high" and low and n >= 3:
                        for i in range(min(2, n - 2)):
                            types[n - 1 - i] = rng.choice(low)
            packs.append((tuple(types), xz(s["pos"]), s["tier"]))
        S["pack"] = packs
        ru = rng.sample([xz(p) for p in P["ruins"]["from"]], P["ruins"]["pick"])
        S["ruin_real"] = ru[P["ruins"].get("fake", 0):]
        return S

    # ---------------- 一局路线
    def run(self, S, plan, policy, rng, target=None):
        """plan: {den, boss, gather}；target: 目标类别集合（先走完再顺手拿）。返回 dict。"""
        rid, W = self.rid, DWELL[self.rid]
        budget = BUDGET[policy]
        todo = [("chest", p, None) for p in S["chest"]] + [("gchest", p, None) for p in S["gchest"]] + [("pav", p, None) for p in S["pav"]]
        g = S["gather"][:]
        rng.shuffle(g)
        todo += [("gather", p, None) for p in g[: int(round(len(g) * plan.get("gather", 0.5)))]]
        todo += [("glow", p, k) for k, p in S["glow"]] + [("elite", p, k) for k, p in S["elite"]] + [("stele", p, z) for z, p in S["stele"]]
        todo += [("pack", p, (t, tier)) for t, p, tier in S["pack"]] + [("rare", p, RARE[rid]) for p in S["rare"]]
        den = xz(self.P["dens"][0]["pos"]) if plan.get("den") else None
        boss = xz(self.P["boss"]["pos"]) if plan.get("boss") else None
        outs = self.gates + S["ruin_real"]

        def exit_t(p):
            return min(self.d(p, o) for o in outs) / SPEED + 8 + 10

        def tail(p, left_den):
            if left_den:
                return self.d(p, den) / SPEED + W["den"] + exit_t(den)
            if boss:
                return self.d(p, boss) / SPEED + W["boss"] + 3
            return exit_t(p)

        cur, T, got, beats = S["entry"], 0.0, [], []
        den_left = den is not None
        # 目标阶段
        if target:
            tq = [q for q in todo if target(q)]
            for q in tq:
                todo.remove(q)
            while tq:
                tq.sort(key=lambda q: self.d(cur, q[1]))
                q = tq.pop(0)
                dd = self.d(cur, q[1])
                if not np.isfinite(dd):
                    continue
                # 路上被迫打的组
                for f in [x for x in todo if x[0] == "pack" and self.d(cur, x[1]) + self.d(x[1], q[1]) - dd <= DETOUR]:
                    todo.remove(f)
                    got.append(f + ("forced",))
                    T += W["pack"]
                T += dd / SPEED + W[q[0]]
                got.append(q + ("target",))
                cur = q[1]
            t_target = T + exit_t(cur)
        else:
            t_target = None
        while todo or den_left:
            cands = sorted(todo, key=lambda q: self.d(cur, q[1]))
            pick = None
            for q in cands:
                if T + self.d(cur, q[1]) / SPEED + W[q[0]] + tail(q[1], den_left) <= budget:
                    pick = q
                    break
            if pick is None:
                break
            # 遗府：轮到它离得最近时进
            if den_left and self.d(cur, den) <= self.d(cur, pick[1]):
                T += self.d(cur, den) / SPEED + W["den"]
                cur, den_left = den, False
                got.append(("den", den, None, ""))
                continue
            todo.remove(pick)
            T += self.d(cur, pick[1]) / SPEED + W[pick[0]]
            got.append(pick + ("",))
            cur = pick[1]
        if den_left:
            T += self.d(cur, den) / SPEED + W["den"]
            cur = den
            got.append(("den", den, None, ""))
        if boss:
            T += self.d(cur, boss) / SPEED + W["boss"]
            got.append(("boss", boss, None, ""))
            ext = 3
        else:
            o = min(outs, key=lambda q: self.d(cur, q))
            T += self.d(cur, o) / SPEED
            ext = 8 if o in self.gates else 6
        ph = PHASES[rid]
        phase = 0 if T < ph[0] else 1 if T < ph[1] else 2 if T < ph[2] else 3
        night_chest = phase == 3
        T += ext * CHANNEL_MUL[phase] + 10 + (W["night"] if night_chest else 0)
        return dict(T=T, phase=phase, got=got, night=night_chest, t_target=t_target)


def summarize_counts(R, n):
    """每局刷出来的数量（按分区 / 按种类）"""
    rng = random.Random(1)
    acc = defaultdict(float)
    for _ in range(n):
        S = R.roll(rng)
        for k in ("chest", "gchest", "pav", "gather"):
            for p in S[k]:
                acc[(k, R.zone(p))] += 1
        for kind, p in S["glow"]:
            acc[("glow:" + kind, R.zone(p))] += 1
        for typ, p in S["elite"]:
            acc[("elite:" + typ, R.zone(p))] += 1
        for z, p in S["stele"]:
            acc[("stele", z)] += 1
        for p in S["rare"]:
            acc[("rare:" + RARE[R.rid], R.zone(p))] += 1
        for types, p, tier in S["pack"]:
            acc[("pack:" + tier, R.zone(p))] += 1
            for t in types:
                acc[("mob:" + t, R.zone(p))] += 1
    return {f"{k[0]}@{k[1]}": round(v / n, 3) for k, v in sorted(acc.items())}


def contact(R, got):
    c = Counter()
    for q in got:
        k = q[0]
        if k == "pack":
            types, tier = q[2]
            c["pack:" + tier] += 1
            for t in types:
                c["mob:" + t] += 1
        elif k in ("elite", "glow", "rare"):
            c[f"{k}:{q[2]}"] += 1
        elif k == "stele":
            c["stele:" + q[2]] += 1
        else:
            c[k] += 1
        if len(q) > 3 and q[3]:
            c["_" + q[3]] += 1
    return c


PLANS = {
    "r1": {"普通": dict(gather=0.6), "遗府(山神庙)": dict(den=True, gather=0.5), "首领(青牙)": dict(boss=True, gather=0.4)},
    "r2": {"普通": dict(gather=0.6), "遗府(剑修)": dict(den=True, gather=0.5), "首领(碧鳞)": dict(boss=True, gather=0.4)},
}
TARGETS = {
    "r1": {
        "石傀+山神庙残碑": lambda q: (q[0] == "pack" and "golem" in q[2][0]) or (q[0] == "stele" and q[2] == "miao"),
        "狼妖头目×全部": lambda q: q[0] == "elite",
        "残碑×全部": lambda q: q[0] == "stele",
        "灵光宝箱+亭": lambda q: q[0] in ("gchest", "pav"),
        "异种(赤狼)": lambda q: q[0] == "rare",
        "灵光点×全部": lambda q: q[0] == "glow",
    },
    "r2": {
        "藤妖(组+精英)": lambda q: (q[0] == "pack" and "vine" in q[2][0]) or (q[0] == "elite" and q[2] == "vine_elite"),
        "灰鬃头目": lambda q: q[0] == "elite" and q[2] == "wolf_elite_r2",
        "残碑×全部": lambda q: q[0] == "stele",
        "灵光宝箱+亭": lambda q: q[0] in ("gchest", "pav"),
        "异种(玄鳞蝠)": lambda q: q[0] == "rare",
        "灵光点×全部": lambda q: q[0] == "glow",
        "精英×全部": lambda q: q[0] == "elite",
    },
}


ZONE_CONT = ("chest", "gchest", "pav", "stele", "elite", "glow", "rare")
TARGET_POLICY = {"r1": "dusk", "r2": "night"}  # r2 的常规策略是入夜前撤（区域规划 v2 §7）


def stats(rows, key):
    a = np.array([r[key] for r in rows if r[key] is not None], float)
    if not len(a):
        return None
    return {"p10": round(float(np.percentile(a, 10)), 1), "p50": round(float(np.percentile(a, 50)), 1), "p90": round(float(np.percentile(a, 90)), 1), "mean": round(float(a.mean()), 2)}


def mean_counter(cs):
    tot = Counter()
    for c in cs:
        tot.update(c)
    return {k: round(v / len(cs), 2) for k, v in sorted(tot.items())}


def points_table(R):
    M = R.M
    rows = []
    P = R.P

    def add(cat, name, p):
        p = xz(p)
        tE = [R.d(e, p) / SPEED for e in R.ents]
        tG = min(R.d(p, g) for g in R.gates) / SPEED
        z = zone_of(R.Z, p)
        i = M.snap(p, r=3)
        ok = bool(M.ok.flat[i] and not M.water.flat[i] and np.isfinite(min(tE)))
        rows.append(dict(cat=cat, name=name, pos=p, zone=z["id"] if z else "?", danger=z["danger"] if z else 0, realm=z["realm"] if z else None,
                         tE_mean=round(float(np.mean(tE)), 1), tE_min=round(float(min(tE)), 1), tG=round(float(tG), 1), expo=round(float(np.mean(tE) + tG), 1), ok=ok))

    for q in P["steles"]["from"]:
        add("stele", q["name"], q["pos"])
    for q in P["pavilions"]["from"]:
        add("pav", q["name"], q["pos"])
    for g in P["glows"]["from"]:
        add("glow", g["label"], g["pos"])
    for p in P["chests"]["glowFrom"]:
        add("gchest", "灵光宝箱位", p)
    for p in P["elites"]["from"]:
        add("elite", "精英位", p)
    for q in P["rares"]["from"]:
        add("rare", "异种 " + q["note"], q["pos"])
    for d in P["dens"]:
        add("den", d["name"], d["pos"])
    add("boss", P["boss"]["name"], P["boss"]["pos"])
    for e in P.get("encounters", []):
        add("enc", "奇遇 " + e["id"], e["pos"])
    for r in P.get("relics", []):
        add("relic", "遗物 " + r["place"], r["pos"])
    for s in P["spawns"]:
        if s.get("mobs") and any(m in ("golem", "vine") for m in s["mobs"]):
            add("spawn:" + "+".join(sorted(set(s["mobs"]))), "刷怪点", s["pos"])
    for rid, name, p in PROPOSALS:
        if rid == R.rid:
            add("proposal", name, p)
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    rep, lines = {}, []
    for rid in ("r1", "r2"):
        R = Region(rid)
        r = rep[rid] = {}
        r["spawned_per_run"] = summarize_counts(R, N_SEED)
        r["points"] = points_table(R)
        # 局型 × 策略
        r["runs"] = {}
        for pname, plan in PLANS[rid].items():
            for pol in ("dusk", "night", "greedy"):
                rng = random.Random(7)
                rows = []
                for s in range(N_SEED):
                    S = R.roll(random.Random(s))
                    rows.append(R.run(S, plan, pol, rng))
                r["runs"][f"{pname}/{pol}"] = dict(
                    T_min=stats([dict(x=x["T"] / 60) for x in rows], "x"),
                    phase_share=[round(float(np.mean([x["phase"] == k for x in rows])), 3) for k in range(4)],
                    night_chest=round(float(np.mean([x["night"] for x in rows])), 3),
                    contact=mean_counter([contact(R, x["got"]) for x in rows]),
                )
        # 定向刷
        r["targets"] = {}
        zc = {}

        def zof(p):
            k = (round(p[0], 2), round(p[1], 2))
            if k not in zc:
                zc[k] = R.zone(p)
            return zc[k]

        tg = dict(TARGETS[rid])
        for dao in ("剑势", "五行", "身法", "雷暴", "守御"):
            zs = [z for z, v in DAO[rid].items() if dao in v]
            tg["流派:" + dao] = (lambda zs: (lambda q: q[0] in ZONE_CONT and zof(q[1]) in zs))(zs)
        for z in R.Z:
            if 2 <= z["danger"] <= 4:
                tg["分区:" + z["name"]] = (lambda zid: (lambda q: q[0] in ZONE_CONT and zof(q[1]) == zid))(z["id"])
        for tname, fn in tg.items():
            rng = random.Random(11)
            rows = []
            for s in range(N_SEED):
                S = R.roll(random.Random(s))
                rows.append(R.run(S, PLANS[rid]["普通"], TARGET_POLICY[rid], rng, target=fn))
            tc = [Counter(q[0] if q[0] not in ("pack", "elite", "glow", "stele", "rare") else contact(R, [q]).most_common(1)[0][0] for q in x["got"] if len(q) > 3 and q[3] == "target") for x in rows]
            # 目标里的怪种只数
            mobc = []
            for x in rows:
                c = Counter()
                for q in x["got"]:
                    if len(q) > 3 and q[3] == "target" and q[0] == "pack":
                        for t in q[2][0]:
                            c["mob:" + t] += 1
                mobc.append(c)
            r["targets"][tname] = dict(
                t_target_min=stats([dict(x=x["t_target"] / 60) for x in rows], "x"),
                T_min=stats([dict(x=x["T"] / 60) for x in rows], "x"),
                target_hits=mean_counter(tc),
                target_mobs=mean_counter(mobc),
                p_zero=round(float(np.mean([sum(c.values()) == 0 for c in tc])), 3),
                forced_packs=round(float(np.mean([sum(1 for q in x["got"] if len(q) > 3 and q[3] == "forced") for x in rows])), 2),
                contact=mean_counter([contact(R, x["got"]) for x in rows]),
            )
        # 文本
        lines.append(f"===== {rid} =====")
        lines.append("-- 每局刷出（期望，按 类别@分区）")
        agg = defaultdict(float)
        for k, v in r["spawned_per_run"].items():
            agg[k.split("@")[0]] += v
        lines += [f"  {k:24s} {v:6.2f}" for k, v in sorted(agg.items())]
        lines.append("-- 局型 × 策略")
        for k, v in r["runs"].items():
            c = v["contact"]
            lines.append(f"  {k:22s} T p50 {v['T_min']['p50']:5.1f} 分  暮/夜 {v['phase_share'][2]:.2f}/{v['phase_share'][3]:.2f}  夜明 {v['night_chest']:.2f}  "
                         + " ".join(f"{kk}={vv}" for kk, vv in c.items() if not kk.startswith("mob:") and not kk.startswith("_")))
        lines.append(f"-- 定向刷（{TARGET_POLICY[rid]} 策略，先走完目标再顺手拿）")
        for k, v in r["targets"].items():
            lines.append(f"  {k:16s} 目标段 p50 {v['t_target_min']['p50']:4.1f} 分（含撤离）  全局 p50 {v['T_min']['p50']:4.1f}  命中 {v['target_hits']}  怪 {v['target_mobs']}  落空 {v['p_zero']}  被迫组 {v['forced_packs']}")
        lines.append("-- 点位（入口均值 / 最近入口 / 最近常驻古阵 秒；暴露 = 入口均值 + 古阵）")
        for p in r["points"]:
            lines.append(f"  {p['cat']:22s} {p['name']:18s} {str(tuple(round(c) for c in p['pos'])):12s} {p['zone']:9s} 险{p['danger']}  入{p['tE_mean']:5.1f}/{p['tE_min']:5.1f}  阵{p['tG']:5.1f}  暴露{p['expo']:6.1f}  {'ok' if p['ok'] else 'BAD'}")
    suf = "_prop" if PROP else ""
    json.dump(rep, open(os.path.join(OUT, f"04_data{suf}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, f"04_data{suf}.txt"), "w", encoding="utf-8").write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
