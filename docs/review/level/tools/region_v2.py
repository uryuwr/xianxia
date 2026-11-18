# -*- coding: utf-8 -*-
"""区域规划 v2 校验与出图（按境界分区）：
  - 入口 → 最近常驻古阵（≤ 30 秒）、入口 → 首领门 / 首领的纯跑图时间，以及最短路依次经过的分区；
  - 精英候选能否按"每局 N 只、相距 ≥ minGap、离首领 ≥ bossClear"抽满（300 个种子）；
  - 刷怪点：首领 30 米内有没有、低阶占比、每个分区的组数；异种点所在分区的境界；
  - 一局时长模拟（复用 analyze.sim_runs，开局刷怪组数取 spawnPlan.packs）；
  - 出图 img/region_v2_<id>.png（分区 + 推荐境界 + 入口 → 首领的路线）。
运行：node tools/export_hf.mjs ../../../src/data/levels/<id>.js _cache/cur_<id>；python tools/region_v2.py r1 r2
"""
import json, math, os, random, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import patches
from matplotlib.path import Path
from scipy.sparse.csgraph import dijkstra

sys.path.insert(0, os.path.dirname(__file__))
from lvl import Map, base, pts, SPEED
import analyze

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "img")
xz = lambda p: (p[0], p[1])
REALM = lambda r: f"练气{r[0]}" + (f"–{r[1]}" if r[1] != r[0] else "") + "层"


def zone_at(Z, p):
    best = None
    for z in Z:
        if Path(z["poly"]).contains_point(p) and (best is None or z["danger"] > best["danger"]):
            best = z
    return best


def path_cells(M, src, dst):
    G = M.graph(jumps=True, diag=True)
    s, t = M.snap(src), M.snap(dst)
    d, pred = dijkstra(G, indices=s, return_predecessors=True)
    if not np.isfinite(d[t]):
        return None, math.inf
    out, i = [], t
    while i != s and i >= 0:
        out.append(i)
        i = pred[i]
    out.append(s)
    out.reverse()
    xs = [(M.x0 + (i % M.nx) * M.cell, M.z0 + (i // M.nx) * M.cell) for i in out]
    return xs, d[t]


def elite_fill(P, n_seed=300):
    E = P["elites"]
    gap, clear, bp = E.get("minGap", 25), E.get("bossClear", 30), P["boss"]["pos"]
    full = 0
    for s in range(n_seed):
        rnd = random.Random(s)
        cand = E["from"][:]
        rnd.shuffle(cand)
        picked = []
        for p in cand:
            if len(picked) >= E["pick"]:
                break
            if math.dist(p[:2], bp) < clear or any(math.dist(p[:2], q[:2]) < gap for q in picked):
                continue
            picked.append(p)
        full += len(picked) == E["pick"]
    return full / n_seed


def run(rid):
    M = Map(os.path.join(ROOT, "_cache", "cur_" + rid))
    D = M.def_
    P = D["points"]
    Z = [dict(z, danger=z.get("danger", z.get("risk", 1))) for z in D["zones"]]
    rep = {"id": rid, "size": D["size"]}
    ents = [xz(p) for p in P["entries"]]
    gates = [xz(g["pos"]) for g in P["gates"]]
    gate_d = M.dist_each(gates, jumps=True, diag=True)
    rep["entry_gate_s"] = [round(min(M.at(gate_d[k], e) for k in range(len(gates))) / SPEED, 1) for e in ents]
    bgs = P.get("bossGates") or [P["bossGate"]]
    bg = xz(bgs[0]["pos"])
    boss = xz(P["boss"]["pos"])
    rep["routes"] = []
    best = None
    for e in ents:
        cells, d = path_cells(M, e, boss)
        dg = path_cells(M, e, bg)[1]
        seq = []
        for c in cells[::4]:
            z = zone_at(Z, c)
            name = z["name"] if z else "?"
            if not seq or seq[-1] != name:
                seq.append(name)
        rep["routes"].append({"entry": e, "to_gate_s": round(dg / SPEED, 1), "to_boss_s": round(d / SPEED, 1), "meters": round(d), "zones": seq})
        if best is None or d < best[1]:
            best = (cells, d, e)
    rep["elite_fill"] = elite_fill(P)
    sp = P["spawns"]
    rep["spawns"] = len(sp)
    rep["low_share"] = round(sum(s.get("tier") == "low" for s in sp) / len(sp), 2)
    rep["near_boss"] = [s["pos"] for s in sp if math.dist(s["pos"], boss) < 30]
    rep["per_zone"] = {}
    for z in Z:
        n = [s for s in sp if s.get("zone") == z["id"]]
        rep["per_zone"][z["name"]] = {"realm": z["realm"], "baseLevel": z.get("baseLevel"), "packs": len(n), "low": sum(s.get("tier") == "low" for s in n), "mobs": sorted({m for s in n for m in (s.get("mobs") or [s.get("habitat") + "?"])})}
    rep["rares"] = [(q["sign"], q["pos"], (zone_at(Z, xz(q["pos"])) or {}).get("name"), (zone_at(Z, xz(q["pos"])) or {}).get("realm")) for q in P["rares"]["from"]]
    # 一局时长
    analyze.PACKS[rid] = D.get("spawnPlan", {}).get("packs", analyze.PACKS[rid])
    simA = analyze.sim_runs(M, rid, policy="all")
    simD = analyze.sim_runs(M, rid, policy="dusk")
    strip = lambda S: {k: {kk: (round(vv, 2) if isinstance(vv, float) else vv) for kk, vv in v.items() if kk != "median"} for k, v in S.items()}
    rep["sim_all"], rep["sim_dusk"] = strip(simA), strip(simD)
    rep["_median"] = {k: v["median"] for k, v in simD.items()}
    # 图
    fig, ax = plt.subplots(figsize=(M.W / 10, M.D / 10 + 1.2), dpi=105)
    base(ax, M, f"区域规划 v2 · {D['name']}（{D['size'][0]}×{D['size'][1]} 米）：分区 + 推荐境界 + 入口 → 首领最短路")
    cmap = plt.get_cmap("YlOrRd")
    for z in Z:
        poly = np.array(z["poly"])
        ax.add_patch(patches.Polygon(poly, closed=True, fc=cmap(0.15 + 0.17 * z["danger"]), ec="#4a4540", alpha=0.28, lw=1.2, ls="--", zorder=2))
        inside = Path(z["poly"])
        # 标签放在分区里可走的格子的中位点
        X = M.x0 + np.arange(0, M.nx, 6) * M.cell
        Zs = M.z0 + np.arange(0, M.nz, 6) * M.cell
        gx, gz = np.meshgrid(X, Zs)
        m = inside.contains_points(np.c_[gx.ravel(), gz.ravel()])
        okm = M.ok[::6, ::6].ravel()[: m.size] & m
        if okm.any():
            cx, cz = np.median(gx.ravel()[okm]), np.median(gz.ravel()[okm])
            ax.text(cx, cz, f"{z['name']}\n{REALM(z['realm'])} · 基准 {z.get('baseLevel')}", ha="center", va="center", fontsize=9, weight="bold", color="#3a2a1a", zorder=9, bbox=dict(fc="#fff8e8", ec="none", alpha=0.75, pad=2))
    cells, d, e = best
    xs, zs = zip(*cells)
    ax.plot(xs, zs, c="#d2321e", lw=2.4, zorder=8, label=f"最近入口 → 首领：{d:.0f} 米 / {d / SPEED:.0f} 秒")
    pts(ax, M, P, labels=False, show={"entry", "gate", "boss", "den", "jump", "elite"})
    for g in bgs:
        ax.scatter([g["pos"][0]], [g["pos"][1]], marker="s", s=160, c="#15181b", zorder=9)
        ax.annotate(g["text"], g["pos"], (8, -12), textcoords="offset points", fontsize=8, color="#a8241a", weight="bold", bbox=dict(fc="#ffffff", ec="none", alpha=0.7, pad=1))
    for q in P["rares"]["from"]:
        ax.scatter([q["pos"][0]], [q["pos"][1]], marker="*", s=180, c={"scorch": "#3a2a1a", "frost": "#bfe3f2", "bones": "#d8d2c0", "mist": "#6d7a86", "bloom": "#c0507a"}[q["sign"]], edgecolors="#a8241a", zorder=9)
    for s in sp:
        c = {"low": "#3fae7a", "mid": "#c9a040", "high": "#d2321e"}[s.get("tier", "mid")]
        ax.scatter([s["pos"][0]], [s["pos"][1]], s=18 + 8 * s["pack"], c=c, edgecolors="#15181b", lw=0.5, zorder=7)
    from matplotlib.lines import Line2D
    h, l = ax.get_legend_handles_labels()
    h += [Line2D([], [], marker="o", ls="", c=c, ms=8) for c in ("#3fae7a", "#c9a040", "#d2321e")] + [Line2D([], [], marker="*", ls="", c="#888", ms=12), Line2D([], [], marker="s", ls="", c="#15181b", ms=9)]
    l += ["刷怪点·低阶", "刷怪点·标准", "刷怪点·高阶", "异种出没点（焦土 / 白霜 / 白骨 / 墨雾）", "首领门"]
    ax.legend(h, l, loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=8, frameon=False)
    fig.tight_layout()
    fig.savefig(os.path.join(IMG, f"region_v2_{rid}.png"), bbox_inches="tight")
    plt.close(fig)
    return rep


if __name__ == "__main__":
    out = {}
    for rid in sys.argv[1:]:
        r = run(rid)
        med = r.pop("_median")
        out[rid] = r
        print(f"== {rid} {r['size']}")
        print("  入口 → 最近古阵（秒）", r["entry_gate_s"])
        for q in r["routes"]:
            print(f"  入口 {q['entry']} → 首领门 {q['to_gate_s']} 秒 / 首领 {q['to_boss_s']} 秒（{q['meters']} 米）经过：{' → '.join(q['zones'])}")
        print("  精英抽满率", r["elite_fill"], "；刷怪点", r["spawns"], "低阶占比", r["low_share"], "；首领 30 米内的刷怪点", r["near_boss"])
        for k, v in r["per_zone"].items():
            print("   ", k, v)
        print("  异种点", r["rares"])
        for tag in ("sim_all", "sim_dusk"):
            for k, v in r[tag].items():
                print(f"  [{tag}] {k}: p10 {v['p10']} / p50 {v['p50']} / p90 {v['p90']} 分；路程 {v['meters']} 米；入暮 {v['dusk']}；内容 {v['frac']}；接触 {v['engaged']}；平均组大小 {v['pack_size']}")
    json.dump(out, open(os.path.join(ROOT, "_cache", "region_v2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=float)
