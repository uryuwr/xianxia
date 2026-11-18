# -*- coding: utf-8 -*-
"""
关卡分析（基于游戏真实高度场）：
  node tools/export_hf.mjs 导出的网格 → 可走图（与 level.js flood 同规则：相邻格上 ≤0.55、下 ≤0.9、walk ≥ -0.8；
  二段跳点 jumps 双向连通）→ scipy Dijkstra → 路程 / 可达性 / 撤离压力；并按统一图例出图。
可选 wade=系数：涉水格（河 / 潭里、非桥面）移动代价乘系数（评审建议：涉水减速 ×0.6 速度 ≈ 代价 ×1.67）。
"""
import json
import math
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import patches
from matplotlib.colors import LightSource, LinearSegmentedColormap
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DengXian"]
plt.rcParams["axes.unicode_minus"] = False

SPEED = 6.0
STEP_UP, STEP_DOWN = 0.55, 0.9


class Map:
    def __init__(self, prefix):
        meta = json.load(open(prefix + ".json", encoding="utf-8"))
        self.__dict__.update({k: meta[k] for k in ("nx", "nz", "cell", "x0", "z0")})
        self.def_ = meta["def"]
        raw = np.fromfile(prefix + ".bin", dtype=np.float32)
        N = self.nx * self.nz
        self.walk = raw[:N].reshape(self.nz, self.nx)
        self.ground = raw[N : 2 * N].reshape(self.nz, self.nx)
        self.rdist = raw[2 * N :].reshape(self.nz, self.nx)
        self.water = (self.rdist < 0) & (self.walk <= self.ground + 0.05)
        self.ok = self.walk >= -0.8
        self.W, self.D = self.def_["size"]
        self._graph = {}

    # 坐标 ↔ 格
    def idx(self, x, z):
        ix = int(np.clip(round((x - self.x0) / self.cell), 0, self.nx - 1))
        iz = int(np.clip(round((z - self.z0) / self.cell), 0, self.nz - 1))
        return iz * self.nx + ix

    def h(self, x, z):
        return float(self.walk.flat[self.idx(x, z)])

    def graph(self, wade=1.0, jumps=True, extra_links=(), diag=False):
        # diag=False：与 level.js 的 flood 一致（4 邻接）；对角步用于更平滑的路程估计
        key = (wade, jumps, tuple(extra_links), diag)
        if key in self._graph:
            return self._graph[key]
        nx, nz, c = self.nx, self.nz, self.cell
        w = self.walk
        rows, cols, data = [], [], []
        I = np.arange(nx * nz).reshape(nz, nx)
        slow = np.where(self.water, wade, 1.0)
        for dz, dx in ((0, 1), (1, 0), (1, 1), (1, -1)) if diag else ((0, 1), (1, 0)):
            a = (slice(0, nz - dz), slice(max(0, -dx), nx - max(0, dx)))
            b = (slice(dz, nz), slice(max(0, dx), nx - max(0, -dx) if dx < 0 else nx))
            if dx < 0:
                b = (slice(dz, nz), slice(0, nx + dx))
            ha, hb = w[a], w[b]
            okab = self.ok[a] & self.ok[b]
            L = c * (1.4142 if dz and dx else 1.0)
            dh = hb - ha
            # 对角步按两个正交小步的上限放宽（与逐帧移动近似）
            up, dn = (STEP_UP, STEP_DOWN)
            fwd = okab & (dh <= up) & (-dh <= dn)
            bwd = okab & (-dh <= up) & (dh <= dn)
            ia, ib = I[a], I[b]
            cost_ab = L * 0.5 * (slow[a] + slow[b])
            rows += [ia[fwd], ib[bwd]]
            cols += [ib[fwd], ia[bwd]]
            data += [cost_ab[fwd], cost_ab[bwd]]
        links = []
        if jumps:
            for j in self.def_.get("points", {}).get("jumps", []):
                links.append((j["from"], j["to"], True))
        links += list(extra_links)
        for a, b, both in links:
            ia, ib = self.idx(*a), self.idx(*b)
            L = math.dist(a, b)
            rows.append(np.array([ia]))
            cols.append(np.array([ib]))
            data.append(np.array([L]))
            if both:
                rows.append(np.array([ib]))
                cols.append(np.array([ia]))
                data.append(np.array([L]))
        G = coo_matrix((np.concatenate(data), (np.concatenate(rows), np.concatenate(cols))), shape=(nx * nz, nx * nz)).tocsr()
        self._graph[key] = G
        return G

    def snap(self, p, r=4.0):
        """点就近落到可走格（同 settle 的意图）"""
        x, z = p
        if self.ok.flat[self.idx(x, z)] and not self.water.flat[self.idx(x, z)]:
            return self.idx(x, z)
        best = None
        for rr in np.arange(0.5, r + 0.01, 0.5):
            for k in range(16):
                a = k / 16 * 2 * math.pi
                q = (x + math.cos(a) * rr, z + math.sin(a) * rr)
                i = self.idx(*q)
                if self.ok.flat[i] and not self.water.flat[i]:
                    return i
        return self.idx(x, z)

    def dist(self, sources, **kw):
        G = self.graph(**kw)
        idx = [self.snap(p) for p in sources]
        d = dijkstra(G, directed=True, indices=idx, min_only=True)
        return d.reshape(self.nz, self.nx)

    def dist_each(self, sources, **kw):
        G = self.graph(**kw)
        idx = [self.snap(p) for p in sources]
        d = dijkstra(G, directed=True, indices=idx)
        return d.reshape(len(idx), self.nz, self.nx)

    def at(self, grid, p):
        return float(grid.flat[self.snap(p)])


# ---------------------------------------------------------------- 出图
INK = LinearSegmentedColormap.from_list("ink", ["#f4f0e4", "#ddd6c2", "#b3ab95", "#837b69", "#5b5548"])


def base(ax, M, title=None, extent=None):
    ext = [M.x0, M.x0 + (M.nx - 1) * M.cell, M.z0 + (M.nz - 1) * M.cell, M.z0]
    hh = np.where(M.ok, M.walk, np.nan)
    ls = LightSource(azdeg=315, altdeg=45)
    shade = ls.hillshade(np.nan_to_num(M.walk, nan=-30), vert_exag=2.5, dx=M.cell, dy=M.cell)
    ax.imshow(hh, cmap=INK, extent=ext, vmin=-1, vmax=max(9, np.nanmax(hh)), interpolation="bilinear")
    ax.imshow(np.where(M.ok, shade, np.nan), cmap="gray", alpha=0.25, extent=ext, interpolation="bilinear")
    ax.imshow(np.ma.masked_where(~(M.water & M.ok), np.ones_like(M.walk)), cmap=LinearSegmentedColormap.from_list("w", ["#78aec6"] * 2), extent=ext, alpha=0.85, interpolation="nearest")
    ax.imshow(np.ma.masked_where(M.ok, np.ones_like(M.walk)), cmap=LinearSegmentedColormap.from_list("v", ["#2a2d31"] * 2), extent=ext, alpha=0.88, interpolation="nearest")
    # 崖线：相邻格高差超过可走范围
    w = M.walk
    cl = np.zeros(w.shape, bool)
    cl[:, 1:] |= np.abs(np.diff(w, axis=1)) > STEP_UP
    cl[1:, :] |= np.abs(np.diff(w, axis=0)) > STEP_UP
    cl &= M.ok
    ax.imshow(np.ma.masked_where(~cl, np.ones_like(w)), cmap=LinearSegmentedColormap.from_list("c", ["#111417"] * 2), extent=ext, interpolation="nearest")
    for br in M.def_.get("bridges", []):
        (ax0, az0), (bx0, bz0) = br["a"], br["b"]
        ax.plot([ax0, bx0], [az0, bz0], c="#8a5a2b", lw=max(2.5, br["width"] * 2.2), solid_capstyle="butt", alpha=0.9, zorder=3)
    if extent:
        ax.set_xlim(extent[0], extent[1])
        ax.set_ylim(extent[3], extent[2])
    else:
        ax.set_xlim(-M.W / 2, M.W / 2)
        ax.set_ylim(M.D / 2, -M.D / 2)
    ax.set_aspect("equal")
    ax.tick_params(labelsize=7)
    ax.grid(alpha=0.12)
    if title:
        ax.set_title(title, fontsize=11)


STY = {
    "entry": dict(marker="v", c="#15181b", s=120, label="入口候选"),
    "gate": dict(marker="*", c="#2f7fa8", s=360, label="常驻古传送阵"),
    "ruin": dict(marker="*", c="#9cc3d2", s=170, label="残阵候选（真 / 假）"),
    "bossexit": dict(marker="*", c="#c9a040", s=230, label="Boss 出口"),
    "chest": dict(marker="s", c="#8a5a2b", s=30, label="宝箱候选"),
    "chest_r": dict(marker="s", c="#d8b04a", s=60, label="灵光宝箱优先位"),
    "glow": dict(marker="o", c="#e9bb57", s=230, label="灵光点候选", alpha=0.8),
    "gather": dict(marker="^", c="#3fae7a", s=34, label="采集候选"),
    "elite": dict(marker="D", c="#7b4fa8", s=70, label="精英候选"),
    "den": dict(marker="P", c="#15181b", s=220, label="遗府入口"),
    "boss": dict(marker="X", c="#d2321e", s=280, label="Boss"),
    "spawn": dict(marker="o", c="#d2321e", s=22, label="妖兽群（数字=只数）", alpha=0.65),
    "night": dict(marker=">", c="#3a3f6b", s=90, label="夜·妖潮来向"),
    "enc": dict(marker="h", c="#e07b9a", s=140, label="奇遇候选"),
    "jump": dict(marker="o", c="#2f7fa8", s=10, label=None),
}


def pts(ax, M, P, extra=None, labels=True, show=None):
    used = set()

    def sc(k, x, z, **kw):
        st = dict(STY[k])
        lab = st.pop("label")
        if k not in used and lab:
            st["label"] = lab
            used.add(k)
        ax.scatter([x], [z], edgecolors="#15181b", linewidths=0.6, zorder=6, **st, **kw)

    def want(k):
        return show is None or k in show

    xz = lambda p: (p[0], p[1]) if not isinstance(p, dict) else (p["pos"][0], p["pos"][1])
    if want("entry"):
        for p in P.get("entries", []):
            sc("entry", *xz(p))
    if want("gate"):
        for g in P.get("gates", []):
            sc("gate", *g["pos"])
            if labels:
                ax.annotate(g["name"].split("·")[0], g["pos"], (6, 6), textcoords="offset points", fontsize=8, color="#1e5c80", weight="bold")
    if want("ruin"):
        for p in P.get("ruins", {}).get("from", []):
            sc("ruin", *xz(p))
    if want("chest"):
        prio = set(map(tuple, P.get("chests", {}).get("glowFrom", [])))
        for p in P.get("chests", {}).get("from", []):
            sc("chest_r" if tuple(xz(p)) in prio else "chest", *xz(p))
        for p in P.get("chests", {}).get("glowFrom", []):
            sc("chest_r", *xz(p))
    if want("glow"):
        for g in P.get("glows", {}).get("from", []):
            sc("glow", *g["pos"])
            if labels:
                ax.annotate(g["label"], g["pos"], (7, -10), textcoords="offset points", fontsize=7, color="#7a5512")
    if want("gather"):
        for g in P.get("gathers", []):
            for p in g["from"]:
                sc("gather", *xz(p))
    if want("elite"):
        for p in P.get("elites", {}).get("from", []):
            sc("elite", *xz(p))
    if want("den"):
        for d in P.get("dens", []):
            sc("den", *d["pos"])
            if labels:
                ax.annotate(d["name"], d["pos"], (7, 4), textcoords="offset points", fontsize=8, weight="bold")
    if want("boss") and P.get("boss"):
        b = P["boss"]
        sc("boss", *b["pos"])
        if b.get("exit"):
            sc("bossexit", *b["exit"])
        if labels:
            ax.annotate(b["name"], b["pos"], (8, 8), textcoords="offset points", fontsize=9, color="#a8241a", weight="bold")
        if b.get("arena"):
            c = b.get("lake") or b["pos"]
            ax.add_patch(patches.Circle(c, b["arena"], fill=False, ec="#d2321e", ls="--", lw=1))
    if want("spawn"):
        for s in P.get("spawns", []):
            sc("spawn", *s["pos"])
            ax.annotate(str(s["pack"]), s["pos"], (3, 2), textcoords="offset points", fontsize=6, color="#a8241a")
    if want("jump"):
        for j in P.get("jumps", []):
            ax.annotate("", xy=j["to"], xytext=j["from"], arrowprops=dict(arrowstyle="<->", color="#2f7fa8", lw=1.8), zorder=7)
    if extra:
        if want("night"):
            for n in extra.get("night", []):
                sc("night", *n["pos"])
        if want("enc"):
            for e in extra.get("encounters", []):
                sc("enc", *e["pos"])
        if want("patrol"):
            for p in extra.get("patrols", []):
                xs, zs = zip(*p["path"])
                ax.plot(xs, zs, ls="--", lw=1.1, c="#7b4fa8", alpha=0.75, zorder=5)
        if want("landmark"):
            for l in extra.get("landmarks", []):
                ax.text(l["pos"][0], l["pos"][1], "◆" + l["name"], fontsize=8, color="#5a2e86", weight="bold", ha="center", va="bottom", zorder=8, bbox=dict(fc="#ffffff", ec="none", alpha=0.55, pad=1))
        if want("zone"):
            for zn in extra.get("zones", []):
                poly = zn["poly"]
                xs, zs = zip(*(poly + [poly[0]]))
                ax.plot(xs, zs, lw=0.9, c="#4a4540", alpha=0.55, ls=":")
                cx, cz = zn.get("label", (np.mean(xs[:-1]), np.mean(zs[:-1])))
                ax.text(cx, cz, f"{zn['name']}\n风险 {zn['risk']}", fontsize=8, ha="center", va="center", color="#4a4540", alpha=0.9, zorder=4)
