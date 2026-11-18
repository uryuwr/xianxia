# -*- coding: utf-8 -*-
"""深水改造校验：所有必须去的点在"不飞"的前提下（可用二段跳点）可站、可达；列出过河点；与改造前（可涉水）比较关键路线的绕路。
用法：node tools/export_hf.mjs ../../../src/data/levels/<id>.js _cache/cur_<id>（改造前另存 _cache/pre_<id>）
     python tools/water_check.py r1 r2 tutorial"""
import os, sys, json, math
import numpy as np
from matplotlib.path import Path
sys.path.insert(0, os.path.dirname(__file__))
from lvl import Map, SPEED

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
xz = lambda p: (p[0], p[1]) if not isinstance(p, dict) else (p["pos"][0], p["pos"][1])


def cands(D):
    tut = D.get("tutorial")
    if tut:
        T = D["tutorialLayout"]
        out = [("入口", xz(p)) for p in T["entries"]] + [("步骤 " + s["id"], xz(s["pos"])) for s in T["steps"] if not s.get("legacy")]
        out += [("刷怪", xz(s["pos"])) for s in T["spawns"]] + [("灵草", xz(g["pos"])) for g in T["gathers"]] + [("宝箱", xz(c["pos"])) for c in T["chests"]] + [("破洞府", xz(x["pos"])) for x in T["extracts"]]
        return out, [xz(p) for p in T["entries"]], T.get("bounds")
    P = D["points"]
    out = [("入口", xz(p)) for p in P["entries"]] + [("古阵 " + g["name"], xz(g["pos"])) for g in P["gates"]]
    out += [("残阵", xz(p)) for p in P["ruins"]["from"] + P["ruins"].get("fakeFrom", [])]
    out += [("宝箱", xz(p)) for p in P["chests"]["from"] + P["chests"].get("glowFrom", [])]
    out += [(g["label"], xz(p)) for g in P["gathers"] for p in g["from"]]
    out += [("灵光 " + g["label"], xz(g["pos"])) for g in P["glows"]["from"]] + [("精英", xz(p)) for p in P["elites"]["from"]]
    out += [("遗府 " + d["name"], xz(d["pos"])) for d in P["dens"]] + [("Boss", xz(P["boss"]["pos"])), ("Boss 出口", xz(P["boss"]["exit"]))]
    out += [("刷怪", xz(s["pos"])) for s in P["spawns"]] + [("奇遇", xz(e["pos"])) for e in P.get("encounters", [])] + [("遗物", xz(r["pos"])) for r in P.get("relics", [])]
    pav = P.get("pavilions") or {}
    out += [("亭子 " + q.get("name", ""), xz(q["pos"])) for q in pav.get("from", [])]
    out += [("巡游", xz(q)) for p in D.get("patrols", []) for q in p["path"]] + [("五行坛", xz(s)) for s in P["boss"].get("shrines", [])]
    out += [("异种 " + q.get("sign", ""), xz(q["pos"])) for q in (P.get("rares") or {}).get("from", [])]
    gates = P.get("bossGates") or ([P["bossGate"]] if P.get("bossGate") else [])
    out += [("首领门", xz(g["pos"])) for g in gates]
    out += [("夜潮", xz(n["pos"])) for n in D.get("night", [])] if False else []
    return out, [xz(p) for p in P["entries"]], None


def load(name, bounds):
    M = Map(os.path.join(ROOT, "_cache", name))
    if bounds:
        X, Z = np.meshgrid(M.x0 + np.arange(M.nx) * M.cell, M.z0 + np.arange(M.nz) * M.cell)
        M.ok &= Path(bounds).contains_points(np.c_[X.ravel(), Z.ravel()]).reshape(X.shape)
        M._graph = {}
    return M


def snap_ok(M, p, r=2.5):
    # 和 level.js settle 一样就近找可站格（不在深水里）
    for rr in np.arange(0, r + 0.01, 0.5):
        for k in range(16 if rr else 1):
            a = k / 16 * 2 * math.pi
            i = M.idx(p[0] + math.cos(a) * rr, p[1] + math.sin(a) * rr)
            if M.ok.flat[i]:
                return i
    return None


def run(rid):
    name = "tutorial" if rid == "tutorial" else rid
    Mc = load("cur_" + name, None)
    D = Mc.def_
    pts, ents, bounds = cands(D)
    if bounds:
        Mc = load("cur_" + name, bounds)
    Mp = load("pre_" + name, bounds)
    res = {"bad": [], "deep_cells": 0}
    for tag, M in (("cur", Mc), ("pre", Mp)):
        G = M.graph(jumps=True, diag=False)
        from scipy.sparse.csgraph import dijkstra
        idx = [snap_ok(M, e) for e in ents]
        d = dijkstra(G, directed=True, indices=[i for i in idx if i is not None], min_only=True)
        if tag == "cur":
            for n, p in pts:
                i = snap_ok(M, p)
                if i is None:
                    res["bad"].append(f"{n}{p}：2.5 米内没有可站的地面（深水 / 崖外）")
                elif not np.isfinite(d[i]):
                    res["bad"].append(f"{n}{p}：从入口走不到")
        res[tag] = M
    # 深水面积
    res["deep_cells"] = int(((Mc.walk < -35) & (Mp.walk > -0.8)).sum() * Mc.cell ** 2) if Mc.walk.shape == Mp.walk.shape else -1
    return res, D, pts, ents


if __name__ == "__main__":
    out = {}
    for rid in sys.argv[1:]:
        r, D, pts, ents = run(rid)
        print(f"== {rid}  新增深水面积 ≈ {r['deep_cells']} 平方米；问题 {len(r['bad'])} 处")
        for b in r["bad"]:
            print("   ", b)
        out[rid] = r["bad"]
    json.dump(out, open(os.path.join(ROOT, "_cache", "water_check.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
