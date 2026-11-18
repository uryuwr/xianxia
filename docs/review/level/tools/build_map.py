# -*- coding: utf-8 -*-
"""构筑与成长 v1 · 04 投放图：分区道途、道途碑、法宝匣 / 阵盘匣、祭炼主材与阵纹刷点、补的亭子。
运行（docs/review/level 下，先有 _cache/bld_<id>）：./.venv/Scripts/python tools/build_map.py
输出：../../design/构筑与成长_v1/img/04_r1.png、04_r2.png
"""
import os, sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import patches
from matplotlib.path import Path

sys.path.insert(0, os.path.dirname(__file__))
from lvl import Map, base  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.normpath(os.path.join(ROOT, "..", "..", "design", "构筑与成长_v1", "img"))
# 五个流派：dataviz 默认分类色前 5 位（validate_palette.js light 全部 PASS；对比度 WARN → 一律配文字标签）
SC = {"剑势": "#2a78d6", "五行": "#eb6834", "身法": "#1baf7a", "雷暴": "#eda100", "守御": "#e87ba4"}
DAO = {
    "r1": {"zhulin": ["身法", "五行"], "donglu": ["剑势", "雷暴"], "miao": ["五行", "守御"], "luanshi": ["雷暴", "守御"], "beiling": ["身法", "剑势"]},
    "r2": {"xigu": ["身法", "五行"], "zhuhai_n": ["剑势", "五行"], "dongtai": ["守御", "雷暴"], "duanjian": ["身法", "守御"], "beiji": ["剑势", "雷暴"]},
}
STELE = {  # 碑 → 功法（STELE_ZONE；北岭断碑按本方案改止水诀）
    "s_miao": "落石诀", "s_luanshi": "掌心雷", "s_beiling": "止水诀*", "s_donglu": "凝锋诀",
    "s_zhuhai_s": "藤引", "s_dongtai": "地行术", "s_zhuhai_n": "火鸦", "s_beiji": "止水诀", "s_duanjian": "止水诀",
}
# (类型, 名称, 坐标)  类型：box 匣、array 阵台、mat 祭炼主材、pav 补的亭子
MARKS = {
    "r1": [
        ("box", "法宝匣（青牙首杀）", (50, -28.2)),
        ("mat", "狼王遗骨→飞剑", (-10, -60)), ("mat", "狼王遗骨→飞剑", (36, -30)),
        ("mat", "灵蚌珠→葫芦 / 止水页", (-17, 30)), ("mat", "灵蚌珠→葫芦 / 止水页", (4, -36)),
        ("mat", "石傀心→镇山印", (-36, -10)), ("mat", "石傀心→镇山印", (84, -8), (6, 6)), ("mat", "石傀心→镇山印", (-80, -50)),
        ("mat", "鸦羽→定风珠", (-72, 8)), ("mat", "鸦羽→定风珠", (80, 52)),
        ("pav", "灵蚌池亭（补）", (-26, 16)), ("pav", "乱石岗石亭（补）", (70, -18)),
    ],
    "r2": [
        ("box", "法宝匣 + 阵盘匣（剑修遗府首通）", (-9.5, -65)), ("box", "法宝匣·第四（碧鳞首杀）", (16, -34)),
        ("array", "阵台·孤峰下：阵盘匣首探 → 阵纹", (90, -58)), ("array", "阵台·东岭：阵盘匣首探 → 阵纹", (84, -20)),
        ("mat", "剑冢：剑胚→飞剑 4–5 重", (-50, -36)),
        ("mat", "水灵玉→葫芦", (-18, -57)), ("mat", "水灵玉→葫芦", (-73, 12)),
        ("mat", "千年竹心→定风珠", (-76, -8)), ("mat", "千年竹心→定风珠", (-86, -44)),
        ("mat", "岩髓→镇山印", (88, -42)), ("mat", "岩髓→镇山印", (110, -64)), ("mat", "岩髓→镇山印", (104, 16)),
        ("pav", "北脊亭（补）", (-90, -80)),
    ],
}
STY = {"box": dict(marker="*", s=420, c="#a8241a"), "array": dict(marker="h", s=230, c="#6250d6"), "mat": dict(marker="^", s=110, c="#f4f0e4"), "pav": dict(marker="s", s=120, c="#f4f0e4")}
LBL = {"box": "法宝匣 / 阵盘匣（key，进护身格）", "array": "阵台（首探给阵盘匣，之后出阵纹）", "mat": "祭炼主材刷点", "pav": "补的亭子候选"}


LPOS = {"luanshi": (94, -4), "langgu": (47, -15), "beiji": (-100, -88)}


def label_at(M, poly):
    X = M.x0 + np.arange(0, M.nx, 6) * M.cell
    Zs = M.z0 + np.arange(0, M.nz, 6) * M.cell
    gx, gz = np.meshgrid(X, Zs)
    m = Path(poly).contains_points(np.c_[gx.ravel(), gz.ravel()])
    okm = M.ok[::6, ::6].ravel()[: m.size] & m
    return (np.median(gx.ravel()[okm]), np.median(gz.ravel()[okm])) if okm.any() else None


def draw(rid):
    M = Map(os.path.join(ROOT, "_cache", "bld_" + rid))
    D, P = M.def_, M.def_["points"]
    W, H = D["size"]
    fig, ax = plt.subplots(figsize=(W / 18, H / 18 + 0.4), dpi=110)
    base(ax, M)
    for z in D["zones"]:
        dao = DAO[rid].get(z["id"], [])
        ax.add_patch(patches.Polygon(np.array(z["poly"]), closed=True, fc="none", ec="#4a4540", alpha=0.7, lw=1.0, ls="--", zorder=2))
        c = LPOS.get(z["id"]) or label_at(M, z["poly"])
        if not c:
            continue
        t = f"{z['name']} · 险{z['danger']}"
        ax.text(c[0], c[1] + 4, t, ha="center", va="center", fontsize=8.5, weight="bold", color="#2a2016", zorder=9, bbox=dict(fc="#fff8e8", ec="none", alpha=0.8, pad=1.5))
        for i, d in enumerate(dao):
            ax.text(c[0] + (i - (len(dao) - 1) / 2) * 13, c[1] - 3, d, ha="center", va="center", fontsize=8, weight="bold", color="#0b0b0b", zorder=9, bbox=dict(fc=SC[d], ec="#0b0b0b", lw=0.5, alpha=0.9, pad=1.2))
    for q in P["steles"]["from"]:
        x, z = q["pos"]
        ax.scatter([x], [z], marker="D", s=90, c="#15181b", edgecolors="#fcfcfb", lw=1.2, zorder=10)
        ax.annotate(f"{q['name']}：{STELE[q['id']]}", (x, z), (6, 6), textcoords="offset points", fontsize=7.5, color="#15181b", zorder=11, bbox=dict(fc="#ffffff", ec="none", alpha=0.75, pad=0.8))
    seen = set()
    for k, name, (x, z), *off in MARKS[rid]:
        st = STY[k]
        ax.scatter([x], [z], edgecolors="#15181b", linewidths=0.9, zorder=10, label=LBL[k] if k not in seen else None, **st)
        seen.add(k)
        ax.annotate(name, (x, z), off[0] if off else (6, -11), textcoords="offset points", fontsize=7, color="#3a2a1a", zorder=11, bbox=dict(fc="#fff8e8", ec="none", alpha=0.75, pad=0.8))
    for p in P["entries"]:
        ax.scatter([p[0]], [p[1]], marker="v", s=90, c="#15181b", zorder=9)
    for g in P["gates"]:
        ax.scatter([g["pos"][0]], [g["pos"][1]], marker="o", s=110, facecolors="none", edgecolors="#15181b", lw=2, zorder=9)
    from matplotlib.lines import Line2D
    h, l = ax.get_legend_handles_labels()
    h += [Line2D([], [], marker="D", ls="", c="#15181b", ms=7), Line2D([], [], marker="v", ls="", c="#15181b", ms=8), Line2D([], [], marker="o", ls="", mfc="none", mec="#15181b", mew=2, ms=9)]
    l += ["道途碑（碑名：出哪门残页；* = 本方案改投）", "入口", "常驻古阵"]
    h += [patches.Patch(fc=c, ec="#0b0b0b", lw=0.5) for c in SC.values()]
    l += [f"道途：{k}" for k in SC]
    ax.legend(h, l, loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=8, frameon=False)
    ax.set_title(f"{D['name']}（{rid}）· 构筑件投放与道途分区", fontsize=11)
    ax.set_xticks([]), ax.set_yticks([])
    fig.tight_layout()
    os.makedirs(OUT, exist_ok=True)
    fig.savefig(os.path.join(OUT, f"04_{rid}.png"), bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    for rid in ("r1", "r2"):
        draw(rid)
    print("ok", OUT)
