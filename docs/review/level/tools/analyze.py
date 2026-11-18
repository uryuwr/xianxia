# -*- coding: utf-8 -*-
"""
关卡评审主脚本：现状（src/data/levels）vs 定稿（docs/review/level/proposed），全部基于游戏真实高度场。
  1. 点位校验：所有候选点落在可走、非水面的地上，并且从入口可达；遗府石台 / 断涧东必须"要二段跳才到"
  2. 路程表：入口 → 古阵 / 遗府 / Boss / 灵光点
  3. 撤离压力：每处到最近常驻古阵的跑图秒数
  4. 一局模拟（蒙特卡洛 300 种子）：按每局抽取规则抽点 → 贪心路线 → 跑图 + 停留 → 撤离，得到时长分布与天时落点
  5. 出图 + 导出 levels_proposal.json
运行：cd docs/review/level && node tools/export_hf.mjs … 之后 .venv/Scripts/python tools/analyze.py
"""
import json
import math
import os
import random
import sys

import numpy as np
import matplotlib.pyplot as plt
from matplotlib import patches

sys.path.insert(0, os.path.dirname(__file__))
from lvl import Map, base, pts, SPEED, STY

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(ROOT, "_cache")
IMG = os.path.join(ROOT, "img")
os.makedirs(IMG, exist_ok=True)
EXT = lambda M: [M.x0, M.x0 + (M.nx - 1) * M.cell, M.z0 + (M.nz - 1) * M.cell, M.z0]

PHASES = {"r1": [270, 540, 720], "r2": [300, 540, 720]}  # src/game/run/regions.js（灵潮版）
PACKS = {"r1": 5, "r2": 7}
# "收手"策略的时间预算：r1 入暮（第 9 分钟），r2 入夜（第 12 分钟；r2 的目标局长 9–13 分钟）
BUDGET = {"r1": 540, "r2": 720}
CHANNEL_MUL = [1, 1, 1.5, 2]
# 停留时间（秒）：按数值评审的敌人曲线估的"正常构筑"清怪时间
DWELL = {
    "r1": {"pack": 18, "elite": 35, "glow": 45, "chest": 4, "gather": 3, "den": 200, "boss": 150},
    "r2": {"pack": 26, "elite": 50, "glow": 55, "chest": 4, "gather": 3, "den": 300, "boss": 240},
}
# 每局计划（§10.3）：去不去遗府 / Boss，采集拿几成
RUNS = {
    "r1": [("第 2 局 · 熟悉", dict(den=False, boss=False, gather=0.6)), ("第 3 局 · 山神庙", dict(den=True, boss=False, gather=0.5)), ("第 4 局 · 青牙", dict(den=False, boss=True, gather=0.4))],
    "r2": [("第 5 局 · 搬家首探", dict(den=False, boss=False, gather=0.6)), ("第 6 局 · 剑修遗府", dict(den=True, boss=False, gather=0.5)), ("第 7 局 · 碧鳞", dict(den=False, boss=True, gather=0.4))],
}


def xz(p):
    return (p[0], p[1])


def candidates(P, tutorial=None):
    """(类别, 名称, 坐标)"""
    out = [("entry", "入口", xz(p)) for p in P["entries"]]
    out += [("gate", g["name"], xz(g["pos"])) for g in P["gates"]]
    out += [("ruin", "残阵", xz(p)) for p in P["ruins"]["from"]]
    out += [("chest", "宝箱", xz(p)) for p in P["chests"]["from"] + P["chests"].get("glowFrom", [])]
    out += [("gather", g["label"], xz(p)) for g in P["gathers"] for p in g["from"]]
    out += [("glow", g["label"], xz(g["pos"])) for g in P["glows"]["from"]]
    out += [("elite", "精英", xz(p)) for p in P["elites"]["from"]]
    out += [("den", d["name"], xz(d["pos"])) for d in P["dens"]]
    out += [("boss_exit", "Boss 出口", xz(P["boss"]["exit"]))]
    out += [("spawn", "刷怪", xz(s["pos"])) for s in P["spawns"]]
    out += [("enc", "奇遇 " + e["id"], xz(e["pos"])) for e in P.get("encounters", [])]
    out += [("relic", "遗物 " + r["place"], xz(r["pos"])) for r in P.get("relics", [])]
    out += [("shrine", "五行坛", xz(s)) for s in P["boss"].get("shrines", [])]
    return out


def check(M, P, extra_pts=()):
    ents = [xz(p) for p in P["entries"]]
    dJ = M.dist(ents, jumps=True, diag=False)
    dN = M.dist(ents, jumps=False, diag=False)
    issues, needj = [], []
    for k, n, p in list(candidates(P)) + list(extra_pts):
        i = M.snap(p, r=3)
        if not M.ok.flat[i] or M.water.flat[i]:
            issues.append(f"{n}{p}：3 米内没有可站的地面")
            continue
        if not np.isfinite(dJ.flat[i]):
            issues.append(f"{n}{p}：从入口走不到")
        elif not np.isfinite(dN.flat[i]):
            needj.append((k, n, p))
    return dJ, dN, issues, needj


def gate_pressure(M, P):
    g = M.dist([xz(x["pos"]) for x in P["gates"]], jumps=True, diag=True)
    fin = np.isfinite(g) & M.ok & ~M.water
    return g, {"p50": float(np.percentile(g[fin], 50) / SPEED), "p90": float(np.percentile(g[fin], 90) / SPEED), "max": float(g[fin].max() / SPEED)}


# ---------------------------------------------------------------- 一局模拟
def zone_of(Z, p):
    from matplotlib.path import Path

    for z in Z:
        if Path(z["poly"]).contains_point(p):
            return z
    return None


def sim_runs(M, rid, n=300, seed=7, policy="all"):
    D = M.def_
    P = D["points"]
    Z = D.get("zones", [])
    zrisk = {z["id"]: z["risk"] for z in Z}
    W = DWELL[rid]
    # 预先算好所有候选点之间的路程（每个候选点一次 Dijkstra）
    nodes = {}

    def add(p):
        p = (round(p[0], 2), round(p[1], 2))
        nodes.setdefault(p, None)
        return p

    allp = [xz(p) for p in P["entries"]] + [xz(g["pos"]) for g in P["gates"]] + [xz(p) for p in P["ruins"]["from"]]
    allp += [xz(p) for p in P["chests"]["from"] + P["chests"].get("glowFrom", [])] + [xz(p) for g in P["gathers"] for p in g["from"]]
    allp += [xz(g["pos"]) for g in P["glows"]["from"]] + [xz(p) for p in P["elites"]["from"]] + [xz(d["pos"]) for d in P["dens"]] + [xz(P["boss"]["pos"]), xz(P["boss"]["exit"])]
    allp += [xz(s["pos"]) for s in P["spawns"]]
    keys = list(dict.fromkeys(add(p) for p in allp))
    idx = [M.snap(k) for k in keys]
    from scipy.sparse.csgraph import dijkstra

    G = M.graph(jumps=True, diag=True)
    Dm = dijkstra(G, directed=True, indices=idx)[:, idx]
    K = {k: i for i, k in enumerate(keys)}
    dist = lambda a, b: Dm[K[add(a)], K[add(b)]]
    rng = random.Random(seed)
    tier_of = {(round(s["pos"][0], 2), round(s["pos"][1], 2)): s.get("tier", "mid") for s in P["spawns"]}
    results = {}
    for name, plan in RUNS[rid]:
        rows = []
        for s in range(n):
            entry = xz(rng.choice(P["entries"]))
            chests = rng.sample([xz(p) for p in P["chests"]["from"]], P["chests"]["pick"] - P["chests"]["glow"])
            gf = P["chests"].get("glowFrom") or P["chests"]["from"]
            chests += rng.sample([xz(p) for p in gf], P["chests"]["glow"])
            gathers = [xz(p) for g in P["gathers"] for p in rng.sample(g["from"], g["pick"])]
            gathers = rng.sample(gathers, int(round(len(gathers) * plan["gather"])))
            glows = [xz(g["pos"]) for g in rng.sample(P["glows"]["from"], P["glows"]["pick"])]
            elites = [xz(p) for p in rng.sample(P["elites"]["from"], P["elites"]["pick"])]
            sp = P["spawns"]
            if Z and all("zone" in x for x in sp):
                # 定稿规则：按风险加权不放回抽 packs 组，并保证最高风险区至少 1 组
                top = max(zrisk[x["zone"]] for x in sp)
                first = rng.choice([x for x in sp if zrisk[x["zone"]] == top])
                rest = [x for x in sp if x is not first]
                pick = [first]
                while len(pick) < PACKS[rid]:
                    w = [zrisk[x["zone"]] for x in rest]
                    j = rng.choices(range(len(rest)), weights=w)[0]
                    pick.append(rest.pop(j))
            else:
                pick = rng.sample(sp, PACKS[rid])
            packs = [xz(x["pos"]) for x in pick]
            ruins = rng.sample([xz(p) for p in P["ruins"]["from"]], P["ruins"]["pick"])
            nfake = P["ruins"].get("fake", 0)
            real_ruins = ruins[nfake:] if nfake else ruins
            todo = [("chest", p) for p in chests] + [("gather", p) for p in gathers] + [("glow", p) for p in glows] + [("elite", p) for p in elites] + [("pack", p) for p in packs]
            if plan["den"]:
                todo.append(("den", xz(P["dens"][0]["pos"])))
            # 贪心：总挑最近的；Boss 局最后打 Boss，从 Boss 出口走。
            # policy="dusk"：每次先算"拿完这个再去目标 + 撤离"能否在入暮前完成，来不及就跳过（玩家的正常取舍）
            outs_all = [xz(g["pos"]) for g in P["gates"]] + real_ruins
            den_pos = xz(P["dens"][0]["pos"]) if plan["den"] else None

            def tail(p):
                # 收手判断要把"还没去的遗府"也算进去：先去遗府、再撤离
                if den_pos is not None and any(q[0] == "den" for q in todo):
                    return dist(p, den_pos) / SPEED + W["den"] + min(dist(den_pos, o) for o in outs_all) / SPEED + 8 + 10
                if plan["boss"]:
                    return dist(p, xz(P["boss"]["pos"])) / SPEED + W["boss"] + 3
                return min(dist(p, o) for o in outs_all) / SPEED + 8 + 10
            budget = BUDGET[rid] if policy == "dusk" else 1e9
            n_opt = len(todo)
            got = 0
            cur, t_run, t_stay, m_total, beats = entry, 0.0, 0.0, 0.0, []
            while todo:
                todo.sort(key=lambda q: dist(cur, q[1]))
                fits = [q for q in todo if q[0] == "den" or t_run + t_stay + dist(cur, q[1]) / SPEED + W[q[0]] + tail(q[1]) <= budget]
                if not fits:
                    break
                k, p = fits[0]
                todo.remove(fits[0])
                d = dist(cur, p)
                if not np.isfinite(d):
                    continue
                got += k != "den"
                m_total += d
                t_run += d / SPEED
                beats.append((t_run + t_stay, k, p))
                t_stay += W[k]
                cur = p
            if plan["boss"]:
                d = dist(cur, xz(P["boss"]["pos"]))
                m_total += d
                t_run += d / SPEED
                beats.append((t_run + t_stay, "boss", xz(P["boss"]["pos"])))
                t_stay += W["boss"]
                ext_t, ext = 3, "boss"
            else:
                outs = [xz(g["pos"]) for g in P["gates"]] + real_ruins
                o = min(outs, key=lambda q: dist(cur, q))
                d = dist(cur, o)
                m_total += d
                t_run += d / SPEED
                ext = "gate" if o in [xz(g["pos"]) for g in P["gates"]] else "ruin"
                ext_t = 8 if ext == "gate" else 6
            T = t_run + t_stay
            ph = PHASES[rid]
            phase = 0 if T < ph[0] else 1 if T < ph[1] else 2 if T < ph[2] else 3
            T += ext_t * CHANNEL_MUL[phase] + 10  # 读条 + 守阵清一波
            rows.append(dict(T=T, run=t_run, stay=t_stay, m=m_total, beats=beats, phase=phase, extract=ext, frac=got / max(1, n_opt - plan["den"])))
        Ts = np.array([r["T"] for r in rows]) / 60
        med = sorted(rows, key=lambda r: r["T"])[len(rows) // 2]
        results[name] = dict(
            p10=float(np.percentile(Ts, 10)), p50=float(np.percentile(Ts, 50)), p90=float(np.percentile(Ts, 90)),
            run_share=float(np.mean([r["run"] / (r["run"] + r["stay"]) for r in rows])), meters=float(np.median([r["m"] for r in rows])),
            dusk=float(np.mean([r["phase"] >= 2 for r in rows])), frac=float(np.mean([r["frac"] for r in rows])), median=med,
            # 一局里平均接触的内容：狼群 / 妖群按刷怪点 tier 分，精英、灵光、宝箱
            engaged={k: round(float(np.mean([sum(1 for b in r["beats"] if (b[1] if b[1] != "pack" else "pack_" + tier_of.get((round(b[2][0], 2), round(b[2][1], 2)), "mid")) == k) for r in rows])), 2) for k in ("pack_low", "pack_mid", "pack_high", "elite", "glow", "chest", "gather", "den", "boss")},
            pack_size=round(float(np.mean([s.get("pack", 3) for s in P["spawns"]])), 2),
        )
    return results


# ---------------------------------------------------------------- 出图
def fig_layout(M, rid, title, fname, extra=True):
    D = M.def_
    P = D["points"]
    fig, ax = plt.subplots(figsize=(M.W / 9, M.D / 9 + 1.2), dpi=110)
    base(ax, M, title)
    for c in D.get("veg", {}).get("clearings", []):
        ax.add_patch(patches.Circle((c[0], c[1]), c[2], fill=False, ec="#3d6b3a", ls="--", lw=0.8, alpha=0.8))
    for b in D.get("veg", {}).get("bamboo", []):
        if "poly" in b:
            ax.add_patch(patches.Polygon(b["poly"], closed=True, fc="#5f8f5a", ec="none", alpha=0.10, hatch="||", zorder=2))
        else:
            ax.add_patch(patches.Circle(b["circle"][:2], b["circle"][2], fc="#5f8f5a", ec="none", alpha=0.10, hatch="||", zorder=2))
    for pa in D.get("paths", []):
        xs, zs = zip(*pa)
        ax.plot(xs, zs, c="#8a6a45", lw=1.2, alpha=0.55, zorder=3)
    ex = {k: D.get(k, []) for k in ("zones", "landmarks", "night", "patrols")}
    ex["encounters"] = P.get("encounters", [])
    pts(ax, M, P, extra=ex if extra else None)
    for r in P.get("relics", []):
        ax.scatter([r["pos"][0]], [r["pos"][1]], marker="$遗$", s=120, c="#5a2e86", zorder=7)
    for s in P["boss"].get("shrines", []):
        ax.scatter([s[0]], [s[1]], marker="H", s=90, c="#3fae7a", edgecolors="#15181b", zorder=7)
    for p in D.get("props", []):
        if p.get("type") == "boulder":
            ax.add_patch(patches.Circle(p["pos"], p.get("r", 1.2), fc="#6d685d", ec="#15181b", zorder=6))
    h, l = ax.get_legend_handles_labels()
    from matplotlib.lines import Line2D

    h += [Line2D([], [], c="#8a6a45", lw=1.5), Line2D([], [], c="#7b4fa8", ls="--"), Line2D([], [], marker="$遗$", ls="", c="#5a2e86", ms=10), Line2D([], [], marker="H", ls="", c="#3fae7a", ms=9), Line2D([], [], c="#3d6b3a", ls="--")]
    l += ["石径", "午起精英巡游线", "委托遗物藏点", "五行坛（碧鳞）", "林中空地"]
    ax.legend(h, l, loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=8, frameon=False)
    fig.text(0.01, 0.003, "底图=游戏真实高度场（浅=低、深=高）；黑线=走不上去的崖；蓝=水；深灰=虚空 / 断涧 / 深水（不可站）；蓝双箭头=二段跳点；红虚圈=Boss 场；数字=妖兽只数", fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(IMG, fname), bbox_inches="tight")
    plt.close(fig)


def fig_risk(Mc, Mn, rid, fname):
    fig, axs = plt.subplots(1, 3, figsize=(Mn.W / 4.6, Mn.D / 13 + 1.4), dpi=95)
    D = Mn.def_
    # 风险热度
    from matplotlib.path import Path

    X, Zg = np.meshgrid(Mn.x0 + np.arange(Mn.nx) * Mn.cell, Mn.z0 + np.arange(Mn.nz) * Mn.cell)
    rk = np.full(X.shape, np.nan)
    flat = np.c_[X.ravel(), Zg.ravel()]
    for z in sorted(D["zones"], key=lambda z: z["risk"]):
        m = Path(z["poly"]).contains_points(flat).reshape(X.shape)
        rk[m] = z["risk"]
    rk[~Mn.ok] = np.nan
    base(axs[0], Mn, "定稿：风险梯度（1 安全 → 5 核心）")
    im = axs[0].imshow(rk, cmap="YlOrRd", alpha=0.5, extent=EXT(Mn), vmin=1, vmax=5)
    pts(axs[0], Mn, D["points"], labels=False, show={"entry", "gate", "glow", "boss", "den", "elite", "jump"})
    fig.colorbar(im, ax=axs[0], fraction=0.03)
    for ax, M, t in ((axs[1], Mc, "现状"), (axs[2], Mn, "定稿")):
        g, st = gate_pressure(M, M.def_["points"])
        base(ax, M, f"{t}：到最近常驻古阵的跑图秒数（中位 {st['p50']:.0f} 秒 / 90% {st['p90']:.0f} 秒 / 最远 {st['max']:.0f} 秒）")
        tt = np.where(np.isfinite(g) & M.ok, g / SPEED, np.nan)
        im = ax.imshow(tt, cmap="magma_r", alpha=0.55, extent=EXT(M), vmin=0, vmax=40)
        cs = ax.contour(M.x0 + np.arange(M.nx) * M.cell, M.z0 + np.arange(M.nz) * M.cell, np.nan_to_num(tt, nan=99), levels=[10, 20, 30], colors="#15181b", linewidths=0.7)
        ax.clabel(cs, fmt="%d 秒", fontsize=7)
        pts(ax, M, M.def_["points"], labels=False, show={"entry", "gate", "boss", "den", "jump"})
    fig.colorbar(im, ax=axs[2], fraction=0.03)
    fig.tight_layout()
    fig.savefig(os.path.join(IMG, fname), bbox_inches="tight")
    plt.close(fig)


def fig_tutorial(M):
    T = M.def_["tutorialLayout"]
    fig, ax = plt.subplots(figsize=(9, 7), dpi=110)
    base(ax, M, "教学局（定稿）：溪边 → 石桥 → 狼 → 破洞府", extent=[-50, 22, -4, 58])
    b = T["bounds"]
    ax.add_patch(patches.Polygon(b, closed=True, fill=False, ec="#7b4fa8", lw=2, ls="--"))
    steps = T["steps"]
    d_total = 0
    for a, c in zip(steps[:-1], steps[1:]):
        d = M.dist([xz(a["pos"])], jumps=False, diag=True)
        d_total += M.at(d, xz(c["pos"]))
    xs, zs = zip(*[s["pos"] for s in steps])
    ax.plot(xs, zs, c="#d2321e", lw=2.2, zorder=6)
    for i, s in enumerate(steps):
        ax.scatter([s["pos"][0]], [s["pos"][1]], c="#d2321e", s=70, edgecolors="#15181b", zorder=7)
        ax.annotate(f"{i + 1} {s['note']}", s["pos"], (8, -4), textcoords="offset points", fontsize=8, weight="bold", bbox=dict(fc="#ffffff", ec="none", alpha=0.6, pad=1))
    # 现状的 tutorialSetup：入口 + 固定方向 (1,0,-0.6)
    e0 = (-1, 32)
    f = np.array([1, -0.6]) / np.hypot(1, 0.6)
    side = np.array([-f[1], f[0]])
    for d, sd, lab in ((2.2, 0, "锈剑"), (10, 1, "两只狼"), (17, -1, "末狼")):
        p = np.array(e0) + f * d + side * sd
        ax.scatter([p[0]], [p[1]], marker="x", c="#555", s=60, zorder=7)
        ax.annotate("现状·" + lab, p, (5, 5), textcoords="offset points", fontsize=7, color="#555")
    ax.scatter([e0[0]], [e0[1]], marker="v", c="#888", s=80, zorder=7)
    ax.annotate("现状·入口", e0, (5, -10), textcoords="offset points", fontsize=7, color="#555")
    ax.text(-49, 57, f"定稿路线 {d_total:.0f} 米 / 纯跑图 {d_total / SPEED:.0f} 秒；加 3 段教学停顿与 2 场小战斗约 3–4 分钟。\n紫虚线 = 教学局边界（墨雾 + 空气墙）；灰 × = 现状 tutorialSetup 按固定方向摆的位置（在溪东北，背离破洞府）", fontsize=8, va="bottom")
    fig.tight_layout()
    fig.savefig(os.path.join(IMG, "tutorial.png"), bbox_inches="tight")
    plt.close(fig)
    return d_total


def fig_arenas(M1, M2):
    fig, axs = plt.subplots(1, 2, figsize=(17, 8.2), dpi=110)
    a = axs[0]
    b1 = M1.def_["points"]["boss"]
    base(a, M1, "青牙 Boss 场（狼谷底，真实地形）", extent=[b1["pos"][0] - 24, b1["pos"][0] + 24, b1["pos"][1] - 20, b1["pos"][1] + 22])
    a.add_patch(patches.Circle(b1["pos"], b1["arena"], fill=False, ec="#d2321e", ls="--", lw=1.4))
    for p in M1.def_["props"]:
        if p["type"] == "boulder":
            a.add_patch(patches.Circle(p["pos"], p.get("r", 1.2), fc="#6d685d", ec="#15181b", zorder=6))
        if p["type"] == "bones":
            a.scatter([p["pos"][0]], [p["pos"][1]], marker="x", s=70, c="#4a4540", zorder=6)
            a.annotate("白骨", p["pos"], (4, -10), textcoords="offset points", fontsize=7, color="#4a4540")
    for q in b1["adds"]:
        a.scatter([q[0]], [q[1]], marker="o", s=160, c="#4a3f35", edgecolors="#15181b", zorder=6)
        a.annotate("狼窝（召狼）", q, (6, 4), textcoords="offset points", fontsize=8)
    a.scatter([b1["pos"][0]], [b1["pos"][1]], marker="X", s=260, c="#d2321e", edgecolors="#15181b", zorder=7)
    a.scatter([b1["exit"][0]], [b1["exit"][1]], marker="*", s=230, c="#c9a040", edgecolors="#15181b", zorder=7)
    for j in (M1.def_["points"]["elites"]["from"]):
        pass
    a.text(b1["pos"][0] - 23, b1["pos"][1] + 21, "· 入场：狼谷口坡道（西）或狼谷北阶（北脊下来）；两条路都先经过白骨（危险预告）\n"
           "· 5 块卧石（r≈1.4）：青牙的扑咬是直线预警，绕石即可躲——给玩家一个'走位答案'而不是硬吃\n"
           "· 一阶段木盾：从 3 个狼窝召狼（不同方向）；二阶段土盾：撞碎挡路卧石，场地逐渐开阔、节奏变快\n"
           "· Boss 出口在场内西北，击杀后 3 秒读条；场外 12 米无刷怪点（Boss 战不被路过的狼群搅局）", fontsize=8, va="bottom", bbox=dict(fc="#ffffff", ec="none", alpha=0.75))
    b = axs[1]
    b2 = M2.def_["points"]["boss"]
    lx, lz = b2["lake"]
    base(b, M2, "碧鳞 Boss 场（深潭，真实地形 + 潭口石梁）", extent=[lx - 30, lx + 30, lz - 24, lz + 26])
    b.add_patch(patches.Circle((lx, lz), b2["arena"], fill=False, ec="#d2321e", ls="--", lw=1.4))
    for (sx, sz), lab, col in zip(b2["shrines"], ["水坛（克火盾）", "金坛（克木盾）", "木坛（克土盾）"], ["#3f8fa8", "#c9a040", "#3fae7a"]):
        b.scatter([sx], [sz], marker="H", s=200, c=col, edgecolors="#15181b", zorder=7)
        b.annotate(lab, (sx, sz), (8, 4), textcoords="offset points", fontsize=8, weight="bold")
    b.scatter([b2["pos"][0]], [b2["pos"][1]], marker="X", s=260, c="#d2321e", edgecolors="#15181b", zorder=7)
    b.scatter([b2["exit"][0]], [b2["exit"][1]], marker="*", s=230, c="#c9a040", edgecolors="#15181b", zorder=7)
    d = M2.def_["points"]["dens"][0]
    b.scatter([d["pos"][0]], [d["pos"][1]], marker="P", s=200, c="#15181b", zorder=7)
    b.annotate("剑修遗府（石台，二段跳）", d["pos"], (8, 2), textcoords="offset points", fontsize=8, weight="bold")
    for j in M2.def_["points"]["jumps"]:
        if j["id"] == "den_ledge":
            b.annotate("", xy=j["to"], xytext=j["from"], arrowprops=dict(arrowstyle="<->", color="#2f7fa8", lw=1.8), zorder=7)
    b.text(lx - 29, lz + 25, "· 马蹄形环场：西岸 – 潭口石梁 – 东岸，各宽 8–12 米；碧鳞在潭里潜行，从岸边突袭（水面墨圈预警）\n"
           "· 三段护盾 火→土→木：场边三座五行坛，读条 2 秒点亮 → 本阶段普攻附带克制五行 15 秒\n"
           "  （第 3 法术栏练气七层已开：剑气斩 / 缠藤诀 / 寒冰锥正好克三段；五行坛是给带了别的构筑的人的退路）\n"
           "· 甩尾横扫岸边（扇形预警）、水柱随机落在岸上（圆形预警）；北侧瀑布下是遗府石台（Boss 战时不可上）", fontsize=8, va="bottom", bbox=dict(fc="#ffffff", ec="none", alpha=0.75))
    fig.tight_layout()
    fig.savefig(os.path.join(IMG, "arenas.png"), bbox_inches="tight")
    plt.close(fig)


def box(ax, x, y, w, h, label, fc="#efe9d8", fs=8):
    ax.add_patch(patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.3,rounding_size=1.2", fc=fc, ec="#15181b", lw=1.4))
    ax.text(x + w / 2, y + h / 2, label, ha="center", va="center", fontsize=fs)


def fig_ruins():
    fig, axs = plt.subplots(1, 2, figsize=(15, 6.5), dpi=110)
    a = axs[0]
    a.set_title("r1 · 山神庙地窖（遗府，约 32×22 米，单次 3–4 分钟）", fontsize=10)
    box(a, 0, 8, 9, 7, "① 前殿\n石傀 ×2（硬壳）\n教『破甲 / 绕背』")
    box(a, 12, 6, 10, 11, "② 灯阵室\n4 盏石灯可转向\n对准壁画星位\n错一盏 → 刷 3 只狼影")
    box(a, 25, 8, 8, 7, "③ 地窖宝室\n《缠藤诀》\n器方《法衣》", fc="#f3e2b5")
    box(a, 13, 0, 8, 4, "暗格：灵石箱\n（壁画背面）", fc="#e6e0cf", fs=7)
    box(a, 26, 17, 6, 4.5, "藤梯捷径\n→ 庙后", fc="#e6e0cf", fs=7)
    for (x0, y0), (x1, y1) in [((9, 11.5), (12, 11.5)), ((22, 11.5), (25, 11.5)), ((17, 6), (17, 4)), ((29, 15), (29, 17))]:
        a.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="->", lw=1.5))
    a.annotate("入口（庙侧 [-29,-24]）", (0, 11.5), (-60, -30), textcoords="offset points", arrowprops=dict(arrowstyle="->"), fontsize=8)
    a.text(0, -3.5, "节奏：战斗 → 解谜 → 奖励；藤梯捷径单向打开（宝室直接回到庙后，免走回头路）。\n再次进入：①② 保留，③ 换成随机宝箱（ruin_repeat）", fontsize=8)
    a.set_xlim(-3, 36)
    a.set_ylim(-5, 24)
    a.set_aspect("equal")
    a.axis("off")
    b = axs[1]
    b.set_title("r2 · 剑修遗府（瀑后，约 44×30 米，单次 5–6 分钟）", fontsize=10)
    box(b, 0, 10, 8, 8, "瀑后石台\n二段跳上台\n（入口）", fc="#d9e7ee")
    box(b, 11, 10, 10, 8, "① 剑痕廊\n墙中剑气按节拍横扫\n闪身 / 看准空档")
    box(b, 24, 18, 9, 10, "② 镜水池\n断开的汀步\n二段跳过池\n踩 3 块阵石亮灯")
    box(b, 24, 2, 9, 9, "③ 剑傀守关\n剑傀（金盾 → 火克）\n圆形石室 R=7")
    box(b, 36, 9, 8, 10, "④ 剑冢\n青冥飞剑（本命）\n《寒冰锥》", fc="#f3e2b5")
    for (x0, y0), (x1, y1) in [((8, 14), (11, 14)), ((21, 15), (24, 22)), ((28.5, 18), (28.5, 11)), ((33, 7), (36, 12))]:
        b.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="->", lw=1.5))
    b.text(0, -3, "② 亮灯后 ③ 的石门才开；④ 后水道单向通到潭口石梁东头（出遗府即在 Boss 场边，可接着打碧鳞或去溪口撤离）。\n剑傀金盾：此时玩家多半还没有火符——给它『金盾只在剑傀举剑时出现』的窗口，或改成无盾高护甲", fontsize=8)
    b.set_xlim(-3, 47)
    b.set_ylim(-5, 31)
    b.set_aspect("equal")
    b.axis("off")
    fig.tight_layout()
    fig.savefig(os.path.join(IMG, "ruins.png"), bbox_inches="tight")
    plt.close(fig)


def fig_pacing(sims):
    fig, axs = plt.subplots(6, 1, figsize=(14, 9), dpi=110, sharex=True)
    col = {"pack": "#d2321e", "elite": "#7b4fa8", "glow": "#e9bb57", "chest": "#8a5a2b", "gather": "#3fae7a", "den": "#15181b", "boss": "#a8241a"}
    i = 0
    for rid in ("r1", "r2"):
        ph = PHASES[rid]
        for name, r in sims[rid].items():
            ax = axs[i]
            i += 1
            for x0, x1, c, lab in ((0, ph[0], "#f6f1df", "晨"), (ph[0], ph[1], "#efe3c0", "午"), (ph[1], ph[2], "#e7c9a5", "暮"), (ph[2], 900, "#b9b6c9", "夜")):
                ax.axvspan(x0 / 60, x1 / 60, color=c, zorder=0)
                ax.text((x0 + 8) / 60, 0.82, lab, fontsize=8, color="#4a4540")
            for t, k, p in r["median"]["beats"]:
                ax.scatter([t / 60], [0.4], c=col[k], s=90 if k in ("den", "boss", "glow", "elite") else 40, marker="s" if k in ("den", "boss") else "o", edgecolors="#15181b", zorder=3)
            ax.axvline(r["median"]["T"] / 60, c="#2f7fa8", lw=2)
            ax.text(r["median"]["T"] / 60 + 0.1, 0.35, "撤离", color="#2f7fa8", fontsize=8)
            ax.set_yticks([])
            ax.set_ylim(0, 1)
            ax.set_ylabel(f"{rid}\n{name}", rotation=0, ha="right", va="center", fontsize=8)
    axs[-1].set_xlabel("分钟（中位种子的一局：每个点 = 一次遭遇的开始；红=狼群 / 妖群，紫=精英，金=灵光点，褐=宝箱，绿=采集，黑方=遗府 / Boss）")
    axs[-1].set_xlim(0, 15)
    fig.suptitle("一局节奏（定稿布局，贪心路线 + '入暮前撤离'取舍的中位种子）：晨 → 午 → 暮 → 夜", fontsize=11)
    fig.tight_layout()
    fig.savefig(os.path.join(IMG, "pacing.png"), bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------- 主流程
def main():
    report = {"current": {}, "proposed": {}}
    sims = {}
    proposal = {
        "version": 1,
        "about": "关卡评审定稿（关卡开发可直接采用）：regions.<id>.def 与 src/data/levels/<id>.js 同格式（含新增字段）；regions.<id>.contract 是 buildLevel points 契约的全部候选点（含地面高度 y）",
        "coord": "x 向右（东），z 向镜头（南，画面下方）；单位米；contract 里 pos = [x, y, z]",
        "regions": {},
    }
    Ms = {}
    for rid in ("r1", "r2"):
        Mc = Map(os.path.join(CACHE, "cur_" + rid))
        Mn = Map(os.path.join(CACHE, "new_" + rid))
        Ms[rid] = Mn
        for tag, M in (("current", Mc), ("proposed", Mn)):
            P = M.def_["points"]
            extra = []
            if tag == "proposed":
                extra += [("night", "妖潮来向", xz(n["pos"])) for n in M.def_.get("night", [])]
                extra += [("patrol", "巡游 " + p["id"], xz(q)) for p in M.def_.get("patrols", []) for q in p["path"]]
                if rid == "r1":
                    T = M.def_["tutorialLayout"]
                    extra += [("tut", "教学 " + s["id"], xz(s["pos"])) for s in T["steps"]]
            dJ, dN, issues, needj = check(M, P, extra)
            g, st = gate_pressure(M, P)
            ents = [xz(p) for p in P["entries"]]
            E = M.dist_each(ents, jumps=True, diag=True)
            keys = [("古阵 " + g_["name"].split("·")[0], g_["pos"]) for g_ in P["gates"]] + [("遗府 " + d["name"], d["pos"]) for d in P["dens"]] + [("Boss " + P["boss"]["name"], P["boss"]["pos"])] + [("灵光 " + g_["label"], g_["pos"]) for g_ in P["glows"]["from"]]
            table = [[k] + [round(M.at(E[i], xz(p))) for i in range(len(ents))] for k, p in keys]
            report[tag][rid] = dict(issues=issues, needJump=[f"{n}{p}" for k, n, p in needj], gate=st, table=table, entries=ents, walk=float((M.ok & ~M.water).mean()))
        sims[rid] = sim_runs(Mn, rid, policy="dusk")
        strip = lambda S: {k: {kk: vv for kk, vv in v.items() if kk != "median"} for k, v in S.items()}
        report["proposed"][rid]["sim"] = strip(sims[rid])
        report["proposed"][rid]["sim_all"] = strip(sim_runs(Mn, rid, policy="all"))
        report["current"][rid]["sim"] = strip(sim_runs(Mc, rid, policy="dusk"))
        report["current"][rid]["sim_all"] = strip(sim_runs(Mc, rid, policy="all"))
        fig_layout(Mc, rid, f"现状 {rid} {Mc.def_['name']}（src/data/levels/{rid}.js）", f"cur_{rid}.png", extra=False)
        fig_layout(Mn, rid, f"定稿 {rid} {Mn.def_['name']}（docs/review/level/proposed/{rid}.js）", f"new_{rid}.png")
        fig_risk(Mc, Mn, rid, f"risk_{rid}.png")
        # 导出
        D = Mn.def_
        P = D["points"]
        y = lambda p: round(Mn.h(*p), 2)
        pos = lambda p: [p[0], y(xz(p)), p[1]]
        CH = {"gate": 8, "ruin": 6, "fake": 6, "boss": 3}
        contract = {
            "entries": [{"pos": pos(p)} for p in P["entries"]],
            "extracts": [{"id": g_["id"], "kind": "gate", "name": g_["name"], "pos": pos(g_["pos"]), "channel": CH["gate"]} for g_ in P["gates"]]
            + [{"id": f"{rid}_ruin_c{i + 1}", "kind": "ruin", "pos": pos(p), "channel": CH["ruin"], "candidate": True, "fakeAllowed": (list(p) in [list(q) for q in P["ruins"].get("fakeFrom", P["ruins"]["from"])]) and P["ruins"].get("fake", 0) > 0} for i, p in enumerate(P["ruins"]["from"])]
            + [{"id": f"{rid}_boss_exit", "kind": "boss", "pos": pos(P["boss"]["exit"]), "channel": CH["boss"]}],
            "chests": [{"pos": pos(p), "tier": "normal"} for p in P["chests"]["from"]] + [{"pos": pos(p), "tier": "glow"} for p in P["chests"].get("glowFrom", [])],
            "gathers": [{"pos": pos(p), "kind": g_["kind"], "label": g_["label"], "cat": g_["cat"]} for g_ in P["gathers"] for p in g_["from"]],
            "elites": [{"pos": pos(p), **(p[2] if len(p) > 2 else {})} for p in P["elites"]["from"]],
            "glows": [{"pos": pos(g_["pos"]), "kind": g_["kind"], "label": g_["label"]} for g_ in P["glows"]["from"]],
            "ruins": [{"id": d["id"], "name": d["name"], "pos": pos(d["pos"]), "need": d.get("need")} for d in P["dens"]],
            "boss": {"id": P["boss"]["id"], "name": P["boss"]["name"], "pos": pos(P["boss"]["pos"]), "arena": P["boss"]["arena"], "exit": pos(P["boss"]["exit"])},
            "spawns": [{"pos": pos(s["pos"]), "pack": s["pack"], "zone": s.get("zone"), "mobs": s.get("mobs")} for s in P["spawns"]],
            "encounters": [{"id": e["id"], "pos": pos(e["pos"]), "types": e["types"]} for e in P.get("encounters", [])],
            "relics": [{"pos": pos(r["pos"]), "place": r["place"]} for r in P.get("relics", [])],
            "jumps": [{**j, "from": pos(j["from"]), "to": pos(j["to"])} for j in P.get("jumps", [])],
        }
        proposal["regions"][rid] = {
            "def": D,
            "contract": contract,
            "pickRules": {
                "entries": "每局 1 个（打乱后取第一个）",
                "ruins": f"每局抽 {P['ruins']['pick']} 个" + ("，其中 1 个假阵只能来自 ruins.fakeFrom" if P["ruins"].get("fake") else ""),
                "chests": f"每局 {P['chests']['pick']} 个，其中 {P['chests']['glow']} 个灵光宝箱只从 chests.glowFrom 抽",
                "spawns": f"开局 {PACKS[rid]} 组：先从最高风险区抽 1 组，其余按所在 zone 的 risk 加权不放回抽",
                "elites": "第三分量 { shield } 限定该点精英的护盾五行（覆盖 enemies.js 的随机）",
                "encounters": "每局 0–2 个，按 types 与 ENCOUNTER_RULES 距离限制抽",
                "night": "夜·妖潮每波从离主角最近的两个来向之一生成，向主角推进",
                "patrols": "午起每条线 1 只巡游精英",
            },
            "checks": {k: report["proposed"][rid][k] for k in ("issues", "needJump", "gate")},
        }
    proposal["tutorial"] = {"region": "r1", "layout": Ms["r1"].def_["tutorialLayout"]}
    tut = fig_tutorial(Ms["r1"])
    report["tutorial_m"] = tut
    fig_arenas(Ms["r1"], Ms["r2"])
    fig_ruins()
    fig_pacing(sims)
    json.dump(proposal, open(os.path.join(ROOT, "levels_proposal.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(report, open(os.path.join(CACHE, "report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # 控制台摘要
    for tag in ("current", "proposed"):
        for rid in ("r1", "r2"):
            r = report[tag][rid]
            print(f"== {tag} {rid}  古阵压力 {r['gate']}")
            print("  问题:", r["issues"])
            print("  需二段跳:", r["needJump"])
            for row in r["table"]:
                print("   ", row)
            for tagS in ("sim_all", "sim"):
                for k, v in r[tagS].items():
                    print(f"   [{tagS}] {k}: p10 {v['p10']:.1f} / p50 {v['p50']:.1f} / p90 {v['p90']:.1f} 分；跑图占比 {v['run_share'] * 100:.0f}%；路程 {v['meters']:.0f} 米；入暮 {v['dusk'] * 100:.0f}%；内容拿到 {v['frac'] * 100:.0f}%")
    print("教学局路线", round(tut), "米")


if __name__ == "__main__":
    main()
