# -*- coding: utf-8 -*-
"""深水改造的绕路评估：随机抽 N 对可站点，比较改造后 / 改造前（可涉水）的路程比；列出最差的对，帮助决定在哪加桥 / 踏石 / 渡口。"""
import os, sys, math, random
import numpy as np
from scipy.sparse.csgraph import dijkstra
sys.path.insert(0, os.path.dirname(__file__))
from water_check import load, cands, snap_ok

rid = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 60
Mc = load("cur_" + rid, None)
pts, ents, bounds = cands(Mc.def_)
if bounds:
    Mc = load("cur_" + rid, bounds)
Mp = load("pre_" + rid, bounds)
rnd = random.Random(3)
cand = [p for n, p in pts]
src = rnd.sample(cand, min(N, len(cand)))
Gc, Gp = Mc.graph(jumps=True, diag=True), Mp.graph(jumps=True, diag=True)
ic = [snap_ok(Mc, p) for p in src]
ip = [snap_ok(Mp, p) for p in src]
keep = [k for k in range(len(src)) if ic[k] is not None and ip[k] is not None]
Dc = dijkstra(Gc, indices=[ic[k] for k in keep])
Dp = dijkstra(Gp, indices=[ip[k] for k in keep])
rows = []
for a in range(len(keep)):
    for b in range(len(keep)):
        if a >= b:
            continue
        dc, dp = Dc[a][ic[keep[b]]], Dp[a][ip[keep[b]]]
        if np.isfinite(dc) and np.isfinite(dp) and dp > 15:
            rows.append((dc / dp, dc - dp, src[keep[a]], src[keep[b]]))
r = np.array([x[0] for x in rows])
print(f"{rid}: {len(rows)} 对；绕路比 p50 {np.percentile(r, 50):.2f} / p90 {np.percentile(r, 90):.2f} / max {r.max():.2f}；多走的米数 p90 {np.percentile([x[1] for x in rows], 90):.0f}")
for x in sorted(rows, key=lambda x: -x[1])[:12]:
    print(f"   +{x[1]:.0f} 米（×{x[0]:.2f}）  {x[2]} → {x[3]}")
