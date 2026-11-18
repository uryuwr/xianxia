# -*- coding: utf-8 -*-
"""序章（教学局 v2）校验与出图：
  1. 读游戏真实高度场（node tools/export_hf.mjs ../../../src/data/levels/tutorial.js _cache/tut），按 tutorialLayout.bounds 裁掉围栏外
  2. 每个步骤点 / 刷怪点 / 灵草 / 宝箱 / 破洞府：可站（周围 0.6 米平稳、不在水里）、从入口可达（4 邻接，与 level.js flood 同规则，不用二段跳）
  3. 主线与可选小环的路程；按停留模型估时长（熟手 / 新手 ×1.3），出节奏表
  4. 出图 img/prologue_v2.png（路线 + 步骤 + 敌群 + 地标）与 img/prologue_v2_pacing.png
"""
import json
import math
import os
import sys

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import patches
from matplotlib.path import Path

sys.path.insert(0, os.path.dirname(__file__))
from lvl import Map, base, SPEED

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = Map(os.path.join(ROOT, "_cache", "tut"))
D = M.def_
T = D["tutorialLayout"]
X, Z = np.meshgrid(M.x0 + np.arange(M.nx) * M.cell, M.z0 + np.arange(M.nz) * M.cell)
inside = Path(T["bounds"]).contains_points(np.c_[X.ravel(), Z.ravel()]).reshape(X.shape)
M.ok = M.ok & inside
M._graph = {}

# 停留模型（秒）：战斗按凡人 + 锈剑（攻 20）对现有敌人数值估；每条教学提示另加 3 秒阅读
FIGHT = {"wolf_first": 12, "wolves": 22, "ambush": 16, "bamboo": 32, "golem": 40, "elite": 75, "cave": 20}
ACT = {"pickup": 3, "gather": 4, "chest": 4, "pill": 4, "reach": 0, "kill": 0, "extract": 0}


def flat_ok(p, clear=0.6):
    i = M.idx(*p)
    if not M.ok.flat[i] or M.water.flat[i]:
        return False
    h = M.walk.flat[i]
    return all(abs(M.walk.flat[M.idx(p[0] + dx, p[1] + dz)] - h) <= 0.45 for dx, dz in ((clear, 0), (-clear, 0), (0, clear), (0, -clear)))


def main():
    steps = [s for s in T["steps"] if not s.get("legacy")]
    entry = tuple(T["entries"][0])
    reach = M.dist([entry], jumps=False, diag=False)
    pts = [("步骤 " + s["id"], tuple(s["pos"])) for s in steps]
    pts += [("刷怪 " + "+".join(sp["mobs"]), tuple(sp["pos"])) for sp in T["spawns"]]
    pts += [("灵草 " + g["label"], tuple(g["pos"])) for g in T["gathers"]] + [("宝箱", tuple(c["pos"])) for c in T["chests"]] + [("破洞府", tuple(x["pos"])) for x in T["extracts"]]
    issues = []
    for n, p in pts:
        if not flat_ok(p):
            issues.append(f"{n}{p}：不可站（不平 / 水里 / 围栏外）")
        elif not np.isfinite(reach.flat[M.idx(*p)]):
            issues.append(f"{n}{p}：从入口走不到")
    # 路程：主线（非 optional，按 seq）与可选小环（fork → pool_s → pool_n → fork）
    main_ = [s for s in steps if not s.get("optional")]
    by = {s["id"]: s for s in steps}
    legs, total = [], 0.0
    for a, b in zip(main_[:-1], main_[1:]):
        d = M.at(M.dist([tuple(a["pos"])], jumps=False, diag=True), tuple(b["pos"]))
        legs.append((a["id"], b["id"], d))
        total += d
    loop = ["fork", "pool_s", "pool_n", "fork"]
    loop_m = sum(M.at(M.dist([tuple(by[a]["pos"])], jumps=False, diag=True), tuple(by[b]["pos"])) for a, b in zip(loop[:-1], loop[1:]))
    # 节奏表
    rows, t = [], 0.0
    for s in steps:
        if s.get("optional"):
            continue
        prev = rows[-1]["id"] if rows else None
        walk = next((d for a, b, d in legs if b == s["id"]), 0.0)
        t_walk = walk / SPEED
        t_read = (3 if s.get("hint") else 0) + 2.5 * len(s.get("say", [])) * 0.5  # 对白不暂停，按一半计入
        t_do = FIGHT.get(s["id"], 0) + ACT.get(s["trigger"]["type"], 0)
        if s["id"] == "cave":
            t_do += 5  # 读条
        t += t_walk + t_read + t_do
        rows.append(dict(id=s["id"], chapter=s["chapter"], teach=s["teach"], walk=walk, t_walk=t_walk, t_read=t_read, t_do=t_do, t_end=t))
    loop_t = loop_m / SPEED + 2 * (ACT["gather"] + 0) + 3
    rep = dict(issues=issues, main_m=total, loop_m=loop_m, t_expert=t, t_expert_loop=t + loop_t, t_novice=t * 1.3, t_novice_loop=(t + loop_t) * 1.3, rows=rows)
    json.dump(rep, open(os.path.join(ROOT, "_cache", "prologue_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---------------- 图 1：路线 ----------------
    fig, ax = plt.subplots(figsize=(13, 8.6), dpi=110)
    base(ax, M, "序章 v2（青岚山外西南角）：真实地形 + 围栏 + 路线", extent=[-76, 22, -2, 58])
    for c in D["veg"]["bamboo"]:
        if "poly" in c:
            ax.add_patch(patches.Polygon(c["poly"], closed=True, fc="#5f8f5a", ec="none", alpha=0.12, hatch="||", zorder=2))
    for c in D["veg"].get("clearings", []):
        if -76 < c[0] < 22 and -2 < c[1] < 58:
            ax.add_patch(patches.Circle(c[:2], c[2], fill=False, ec="#3d6b3a", ls="--", lw=0.8))
    ax.add_patch(patches.Polygon(T["bounds"], closed=True, fill=False, ec="#7b4fa8", lw=2, ls="--", zorder=5))
    chap_col = {}
    pal = ["#3f8fa8", "#d2321e", "#3fae7a", "#8a5a2b", "#7b4fa8", "#c9a040"]
    for s in steps:
        chap_col.setdefault(s["chapter"], pal[len(chap_col) % len(pal)])
    xs, zs = zip(*[s["pos"] for s in main_])
    ax.plot(xs, zs, c="#d2321e", lw=2.4, zorder=6, label=f"主线 {total:.0f} 米")
    lx, lz = zip(*[by[i]["pos"] for i in loop])
    ax.plot(lx, lz, c="#3f8fa8", lw=2, ls="--", zorder=6, label=f"可选小环（灵蚌池）{loop_m:.0f} 米")
    for s in steps:
        c = chap_col[s["chapter"]]
        ax.scatter([s["pos"][0]], [s["pos"][1]], s=150, c=c, edgecolors="#15181b", zorder=8)
        ax.text(s["pos"][0], s["pos"][1], str(s["seq"]), ha="center", va="center", fontsize=7, color="white", weight="bold", zorder=9)
        lab = s["goal"] + (f"\n[{'+'.join(s['spawn']['mobs'])}{' · 木盾' if s['spawn'].get('shield') else ''}]" if s.get("spawn") else "")
        off = {"loot": (8, -14), "pill": (-95, -22), "wolf_first": (8, 6), "cave": (8, -10), "elite": (10, 4), "golem": (8, -16), "ambush": (10, -18), "chest": (-95, 12), "bamboo": (-40, -26), "herb": (8, 2)}.get(s["id"], (8, 2))
        ax.annotate(lab, s["pos"], off, textcoords="offset points", fontsize=7.5, zorder=9, bbox=dict(fc="#ffffff", ec="none", alpha=0.7, pad=1))
    for p in D["props"]:
        if p["type"] in ("stele", "bones", "lantern") and -76 < p["pos"][0] < 22 and -2 < p["pos"][1] < 58:
            ax.scatter([p["pos"][0]], [p["pos"][1]], marker={"stele": "s", "bones": "x", "lantern": "^"}[p["type"]], s=40, c="#4a4540", zorder=7)
    ax.text(-74, 57, "紫虚线 = 序章围栏（外面是墨雾，不可走）；竹径坡口用倒伏巨竹封住；■ 路碑  × 狼骨  ▲ 石灯", fontsize=8, color="#f4f0e4")
    hs = [plt.Line2D([], [], marker="o", ls="", c=c, ms=9, label=k) for k, c in chap_col.items()]
    h2, l2 = ax.get_legend_handles_labels()
    ax.legend(hs + h2, list(chap_col) + l2, loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=8, frameon=False)
    fig.tight_layout()
    fig.savefig(os.path.join(ROOT, "img", "prologue_v2.png"), bbox_inches="tight")
    plt.close(fig)

    # ---------------- 图 2：节奏 ----------------
    fig, ax = plt.subplots(figsize=(13, 3.6), dpi=110)
    t0 = 0
    for r in rows:
        c = chap_col[r["chapter"]]
        for dur, alpha in ((r["t_walk"], 0.35), (r["t_read"], 0.55), (r["t_do"], 0.95)):
            if dur > 0:
                ax.barh(1, dur / 60, left=t0 / 60, color=c, alpha=alpha, edgecolor="white", lw=0.5)
                t0 += dur
        ax.text((r["t_end"] - 1) / 60, 1.48, r["id"], rotation=60, fontsize=7, ha="right", va="bottom")
        ax.barh(0, r["t_end"] * 1.3 / 60 - (rows[rows.index(r) - 1]["t_end"] * 1.3 / 60 if rows.index(r) else 0), left=(rows[rows.index(r) - 1]["t_end"] * 1.3 / 60 if rows.index(r) else 0), color=c, alpha=0.6, edgecolor="white", lw=0.5)
    ax.barh(0, loop_t * 1.3 / 60, left=rows[-1]["t_end"] * 1.3 / 60, color="#3f8fa8", alpha=0.25, hatch="//", edgecolor="#3f8fa8")
    ax.set_yticks([0, 1])
    ax.set_yticklabels(["新手 ×1.3\n（+ 可选小环）", "熟手"])
    ax.set_xlabel("分钟（每段颜色 = 小节；浅色 = 跑图，中色 = 读提示，深色 = 战斗 / 交互）")
    ax.axvspan(6, 9, color="#c9a040", alpha=0.12)
    ax.text(6.05, -0.6, "目标 6–9 分钟", fontsize=8, color="#7a5512")
    ax.set_xlim(0, 10)
    ax.set_ylim(-0.7, 2.6)
    ax.set_title(f"序章节奏：熟手 {t / 60:.1f} 分（含小环 {(t + loop_t) / 60:.1f}）· 新手 {t * 1.3 / 60:.1f} 分（含小环 {(t + loop_t) * 1.3 / 60:.1f}）", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(ROOT, "img", "prologue_v2_pacing.png"), bbox_inches="tight")
    plt.close(fig)

    print("问题:", issues or "无")
    print(f"主线 {total:.0f} 米（{total / SPEED:.0f} 秒跑图），小环 {loop_m:.0f} 米")
    print(f"熟手 {t / 60:.1f} 分 / 含小环 {(t + loop_t) / 60:.1f} 分；新手 {t * 1.3 / 60:.1f} / {(t + loop_t) * 1.3 / 60:.1f} 分")
    for r in rows:
        print(f"  {r['id']:<10} {r['chapter']:<14} 路 {r['walk']:5.0f} 米  跑 {r['t_walk']:4.0f}s 读 {r['t_read']}s 做 {r['t_do']:3.0f}s  累计 {r['t_end'] / 60:4.1f} 分")


if __name__ == "__main__":
    main()
