# -*- coding: utf-8 -*-
"""崖线渗漏检查：封掉所有坡道 / 石阶 / 桥的走廊后，从低层到高层找最短路；路径上高度跨过中间带的位置就是一处"不走坡道也能上下"的渗漏。
找到一处就在那里封 5 米，再找下一处，直到走不通（最多 24 处）。规则与 level.js 的 flood 相同（4 邻接，上 0.55 / 下 0.9）。
用法：python tools/leaks.py <缓存名> "<低层点x,z>;<高层点x,z>;<中间带下限>;<中间带上限>" …"""
import sys, os, json
import numpy as np
from scipy.sparse.csgraph import dijkstra
sys.path.insert(0, os.path.dirname(__file__))
from lvl import Map

def corridors(M):
    D = M.def_
    X, Z = np.meshgrid(M.x0 + np.arange(M.nx) * M.cell, M.z0 + np.arange(M.nz) * M.cell)
    def segd(a, b):
        ex, ez = b[0] - a[0], b[1] - a[1]
        t = np.clip(((X - a[0]) * ex + (Z - a[1]) * ez) / (ex * ex + ez * ez), 0, 1)
        return np.hypot(a[0] + ex * t - X, a[1] + ez * t - Z)
    blk = np.zeros(X.shape, bool)
    for r in D.get("ramps", []):
        blk |= segd(r["a"], r["b"]) < r["width"] / 2 + 1.5
    return X, Z, blk

def find(M, a, b, lo, hi, nmax=24):
    X, Z, blk = corridors(M)
    ok0 = M.ok.copy()
    leaks = []
    for _ in range(nmax):
        M.ok = ok0 & ~blk
        M._graph = {}
        G = M.graph(jumps=False)
        s, t = M.snap(a), M.snap(b)
        d, pred = dijkstra(G, indices=s, return_predecessors=True)
        if not np.isfinite(d[t]):
            break
        i, hit = t, None
        while i != s:
            h = M.walk.flat[i]
            if lo < h < hi:
                hit = (float(X.flat[i]), float(Z.flat[i]))
            i = pred[i]
        if hit is None:
            break
        leaks.append((round(hit[0]), round(hit[1])))
        blk |= np.hypot(X - hit[0], Z - hit[1]) < 5
    M.ok = ok0
    M._graph = {}
    return leaks

if __name__ == "__main__":
    name = sys.argv[1]
    M = Map(os.path.join(os.path.dirname(__file__), "..", "_cache", name))
    out = {}
    for spec in sys.argv[2:]:
        A, B, lo, hi = spec.split(";")
        a = tuple(map(float, A.split(","))); b = tuple(map(float, B.split(",")))
        L = find(M, a, b, float(lo), float(hi))
        out[spec] = L
        print(name, spec, len(L), L)
    p = os.path.join(os.path.dirname(__file__), "..", "_cache", "leaks.json")
    allr = json.load(open(p)) if os.path.exists(p) else {}
    allr[name] = out
    json.dump(allr, open(p, "w"), ensure_ascii=False)
