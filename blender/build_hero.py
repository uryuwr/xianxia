# 墨途 · 主角「白衣散修」生成脚本（Blender 4.5，后台运行）
#   blender.exe -b --factory-startup --python blender/build_hero.py
# 产出：assets/models/hero.glb（网格 + 骨骼 + 7 段动画）
#
# 约定（Blender 坐标）：Z 向上，角色面向 -Y，角色左侧为 +X，单位米，原点在脚底。
# glTF 导出后为 +Y 向上、面向 +Z。
# 全部几何、权重、动画都由本脚本程序化生成，可反复重建。

import bpy
import bmesh
import math
import os
import sys
import time
from mathutils import Vector, Matrix, Quaternion, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_GLB = os.path.join(ROOT, "assets", "models", "hero.glb")
OUT_BLEND = os.path.join(ROOT, "work", "hero_build.blend")
FPS = 30
T0 = time.time()

V = Vector


def nrm(v):
    v = V(v)
    l = v.length
    return v / l if l > 1e-9 else V((0, 0, 1))


def lerp(a, b, t):
    return a + (b - a) * t


# =============================================================================================
# 材质（名称是与游戏的约定，游戏按名称替换为水墨 / 卡通着色器）
# =============================================================================================
MATS = [
    ("robe_white", (0.90, 0.88, 0.83, 1), 0.0, 0.8),
    ("robe_inner", (0.66, 0.66, 0.65, 1), 0.0, 0.8),
    ("sash_dark", (0.10, 0.10, 0.11, 1), 0.0, 0.7),
    ("skin", (0.92, 0.78, 0.68, 1), 0.0, 0.6),
    ("hair_black", (0.025, 0.025, 0.03, 1), 0.0, 0.5),
    ("ribbon_red", (0.72, 0.08, 0.05, 1), 0.0, 0.6),
    ("boots_black", (0.05, 0.05, 0.055, 1), 0.0, 0.6),
    ("sword_steel", (0.72, 0.75, 0.78, 1), 0.9, 0.25),
    ("sword_hilt", (0.16, 0.11, 0.07, 1), 0.2, 0.5),
    ("tassel_red", (0.72, 0.08, 0.05, 1), 0.0, 0.8),
]
MAT_INDEX = {m[0]: i for i, m in enumerate(MATS)}


# =============================================================================================
# 网格构建器：所有部件写进一个顶点 / 面列表，顶点带"部件"标签（用于蒙皮权重）
# =============================================================================================
class MB:
    def __init__(self):
        self.v = []
        self.part = []
        self.f = []
        self.fm = []
        self.fs = []

    def vert(self, p, part):
        self.v.append(V(p))
        self.part.append(part)
        return len(self.v) - 1

    def face(self, idx, mat, smooth=True):
        self.f.append(tuple(idx))
        self.fm.append(MAT_INDEX[mat])
        self.fs.append(smooth)

    def face_oriented(self, idx, mat, want, smooth=True):
        a, b, c = (self.v[i] for i in idx[:3])
        n = (b - a).cross(c - a)
        if n.dot(want) < 0:
            idx = list(reversed(idx))
        self.face(idx, mat, smooth)


mb = MB()


def frame_from(t, ref):
    """沿管线方向 t 的截面坐标系：u 贴近 ref，v = t × u"""
    t = nrm(t)
    r = V(ref)
    u = r - t * r.dot(t)
    if u.length < 1e-6:
        r = V((1, 0, 0)) if abs(t.x) < 0.9 else V((0, 1, 0))
        u = r - t * r.dot(t)
    u.normalize()
    return u, t.cross(u)


def loft(centers, rx, ry, segs, mat, part, ref=(1, 0, 0), cap0=False, cap1=False, arc=None, phase=0.0, smooth=True):
    """沿中心线放样椭圆截面。rx 沿 u（贴近 ref），ry 沿 v。
    arc=(a0, a1)（度）时生成开口弧面。ref 可以是单个向量或逐环列表。返回各环的顶点下标。"""
    n = len(centers)
    rx = rx if isinstance(rx, (list, tuple)) else [rx] * n
    ry = ry if isinstance(ry, (list, tuple)) else [ry] * n
    refs = ref if (isinstance(ref, list) and len(ref) == n and not isinstance(ref[0], (int, float))) else [ref] * n
    rings = []
    for i, c in enumerate(centers):
        c = V(c)
        if i == 0:
            t = V(centers[1]) - c
        elif i == n - 1:
            t = c - V(centers[i - 1])
        else:
            t = V(centers[i + 1]) - V(centers[i - 1])
        u, w = frame_from(t, refs[i])
        ring = []
        if arc is None:
            for j in range(segs):
                a = 2 * math.pi * j / segs + math.radians(phase)
                ring.append(mb.vert(c + u * (rx[i] * math.cos(a)) + w * (ry[i] * math.sin(a)), part))
        else:
            for j in range(segs + 1):
                a = math.radians(lerp(arc[0], arc[1], j / segs))
                ring.append(mb.vert(c + u * (rx[i] * math.cos(a)) + w * (ry[i] * math.sin(a)), part))
        rings.append(ring)
    m = len(rings[0])
    jr = range(m) if arc is None else range(m - 1)
    for i in range(n - 1):
        A, B = rings[i], rings[i + 1]
        for j in jr:
            j2 = (j + 1) % m
            mb.face((A[j], A[j2], B[j2], B[j]), mat, smooth)
    if arc is None:
        if cap0:
            c = mb.vert(centers[0], part)
            for j in range(m):
                mb.face((c, rings[0][(j + 1) % m], rings[0][j]), mat, smooth)
        if cap1:
            c = mb.vert(centers[-1], part)
            for j in range(m):
                mb.face((c, rings[-1][j], rings[-1][(j + 1) % m]), mat, smooth)
    return rings


def ellipsoid(center, radii, segs, rings_n, mat, part, basis=None, keep=None, smooth=True):
    """椭球。basis 为 3x3 矩阵（局部 → 世界）；keep(n) 根据局部单位方向决定保留哪些面。"""
    center = V(center)
    B = basis if basis is not None else Matrix.Identity(3)
    grid = []
    dirs = []
    for i in range(rings_n + 1):
        th = math.pi * i / rings_n
        row, drow = [], []
        for j in range(segs):
            ph = 2 * math.pi * j / segs
            n = V((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
            p = center + B @ V((n.x * radii[0], n.y * radii[1], n.z * radii[2]))
            row.append(mb.vert(p, part))
            drow.append(n)
        grid.append(row)
        dirs.append(drow)
    for i in range(rings_n):
        for j in range(segs):
            j2 = (j + 1) % segs
            q = (grid[i][j], grid[i + 1][j], grid[i + 1][j2], grid[i][j2])
            if keep is not None:
                if not all(keep(d) for d in (dirs[i][j], dirs[i + 1][j], dirs[i + 1][j2], dirs[i][j2])):
                    continue
            mb.face(q, mat, smooth)


def thick_panel(z_list, rx_fn, ry_fn, ang_fn, cols, thick, mat, part, center_fn):
    """裙摆：开口弧面加厚成闭合壳（外层、内层、四周封边）"""
    rows = len(z_list)
    outer, inner = [], []
    for z in z_list:
        a0, a1 = ang_fn(z)
        c = center_fn(z)
        ro, ri = [], []
        for j in range(cols + 1):
            a = math.radians(lerp(a0, a1, j / cols))
            dx, dy = math.cos(a), math.sin(a)
            rx, ry = rx_fn(z), ry_fn(z)
            ro.append(mb.vert(c + V((rx * dx, ry * dy, 0)), part))
            ri.append(mb.vert(c + V(((rx - thick) * dx, (ry - thick) * dy, 0)), part))
        outer.append(ro)
        inner.append(ri)
    for i in range(rows - 1):
        zc = (z_list[i] + z_list[i + 1]) / 2
        for j in range(cols):
            a = math.radians(lerp(*ang_fn(zc), (j + 0.5) / cols))
            out = V((math.cos(a), math.sin(a), 0))
            mb.face_oriented((outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]), mat, out)
            mb.face_oriented((inner[i][j], inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j]), mat, -out)
    for j in range(cols):
        mb.face_oriented((outer[0][j], outer[0][j + 1], inner[0][j + 1], inner[0][j]), mat, V((0, 0, 1)))
        mb.face_oriented((outer[-1][j], outer[-1][j + 1], inner[-1][j + 1], inner[-1][j]), mat, V((0, 0, -1)))
    for i in range(rows - 1):
        for side, j in ((-1, 0), (1, cols)):
            a0, a1 = ang_fn(z_list[i])
            a = math.radians(a0 if side < 0 else a1)
            tang = V((-math.sin(a), math.cos(a), 0)) * side
            mb.face_oriented((outer[i][j], outer[i + 1][j], inner[i + 1][j], inner[i][j]), mat, tang)


def catmull(points, sub):
    pts = [V(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for k in range(sub):
            t = k / sub
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


def basis_z(dirz, hint=(0, 1, 0)):
    z = nrm(dirz)
    x = V(hint).cross(z)
    if x.length < 1e-6:
        x = V((1, 0, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


# =============================================================================================
# 比例与关键点（身高约 1.75 m，头身比约 6）
# =============================================================================================
A_POSE = math.radians(44)
SH_Z, SH_X = 1.40, 0.19
UPPER, FORE, HAND = 0.27, 0.25, 0.10


def arm_pts(s):
    d = V((s * math.cos(A_POSE), 0, -math.sin(A_POSE)))
    S = V((SH_X * s, 0, SH_Z))
    E = S + d * UPPER
    W = E + d * FORE
    return d, S, E, W


HIP_X = 0.095
HIP_Z = 0.86
KNEE = lambda s: V((0.1 * s, -0.008, 0.47))
ANKLE = lambda s: V((0.1 * s, 0.0, 0.09))

TORSO = [(0.95, 0.150, 0.110), (1.05, 0.155, 0.112), (1.16, 0.165, 0.118), (1.27, 0.180, 0.122), (1.35, 0.192, 0.115), (1.405, 0.172, 0.092), (1.445, 0.11, 0.07), (1.47, 0.068, 0.058)]


def torso_r(z):
    for i in range(len(TORSO) - 1):
        z0, rx0, ry0 = TORSO[i]
        z1, rx1, ry1 = TORSO[i + 1]
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return lerp(rx0, rx1, t), lerp(ry0, ry1, t)
    return TORSO[-1][1], TORSO[-1][2]


def torso_surf(x, z, off=0.004):
    rx, ry = torso_r(z)
    q = max(0.0, 1 - (x / rx) ** 2)
    p = V((x, -ry * math.sqrt(q) - off, z))
    n = nrm(V((x / rx ** 2, -math.sqrt(q) / ry, 0.0)))
    return p, n


# =============================================================================================
# 几何
# =============================================================================================
def build_mesh():
    # ---- 头部 ----
    ellipsoid((0, -0.005, 1.605), (0.108, 0.118, 0.138), 18, 12, "skin", "head")
    # 发冠：前额与面部留空，后脑与两侧覆盖到耳下
    ellipsoid((0, 0.004, 1.612), (0.114, 0.125, 0.144), 20, 14, "hair_black", "head",
              keep=lambda n: n.z > 0.18 or (n.y > -0.2 and n.z > -0.32) or (n.y > 0.35 and n.z > -0.62) or (n.y > -0.62 and n.z > 0.0))
    # 发髻 + 系发的红绳
    ellipsoid((0, 0.025, 1.785), (0.047, 0.05, 0.05), 12, 8, "hair_black", "head")
    loft([(0, 0.025, 1.738), (0, 0.025, 1.76)], 0.041, 0.043, 12, "ribbon_red", "head", ref=(1, 0, 0), cap0=True, cap1=True)
    # 鬓发两缕
    for s in (1, -1):
        loft([(0.098 * s, -0.05, 1.66), (0.103 * s, -0.058, 1.57), (0.097 * s, -0.06, 1.5)], [0.013, 0.011, 0.004], [0.009, 0.008, 0.004], 6,
             "hair_black", "head", ref=(1, 0, 0), cap0=True, cap1=True)
    # 眉眼：几笔墨点
    for s in (1, -1):
        ellipsoid((0.042 * s, -0.106, 1.598), (0.017, 0.006, 0.0095), 8, 4, "hair_black", "head",
                  basis=basis_z(V((0.25 * s, -1, 0)), hint=(0, 0, 1)) @ Matrix(((1, 0, 0), (0, 0, 1), (0, 1, 0))))
        loft([(0.022 * s, -0.111, 1.627), (0.045 * s, -0.106, 1.634), (0.068 * s, -0.094, 1.629)], 0.0035, [0.004, 0.006, 0.002], 4,
             "hair_black", "head", ref=(0, -1, 0), cap0=True, cap1=True)
    # 颈
    loft([(0, 0.0, 1.40), (0, 0.0, 1.47), (0, 0.0, 1.53)], 0.046, 0.044, 10, "skin", "neck", ref=(1, 0, 0))

    # ---- 发带：两条飘带，从发髻后方垂到背部 ----
    rib = [V((0, 0.065, 1.77)), V((0, 0.1, 1.6)), V((0, 0.13, 1.42)), V((0, 0.15, 1.24)), V((0, 0.16, 1.06))]
    for s in (1, -1):
        pts = [p + V((s * (0.014 + 0.045 * i / 4), 0, 0)) for i, p in enumerate(rib)]
        cur = catmull(pts, 3)
        w = [lerp(0.022, 0.03, i / (len(cur) - 1)) for i in range(len(cur))]
        loft(cur, w, 0.0028, 6, "ribbon_red", "ribbon", ref=(1, 0, 0), cap0=True, cap1=True)
    # 飘带尾端的燕尾剪口用两个小尖角表现
    for s in (1, -1):
        p = rib[-1] + V((s * 0.059, 0, 0))
        loft([p, p + V((0, 0.006, -0.07))], [0.03, 0.002], 0.0026, 6, "ribbon_red", "ribbon", ref=(1, 0, 0), cap0=True, cap1=True)

    # ---- 躯干（外袍上身）----
    loft([(0, 0, z) for z, _, _ in TORSO], [r[1] for r in TORSO], [r[2] for r in TORSO], 18, "robe_white", "torso", ref=(1, 0, 0), cap0=True, cap1=True)
    # 交领右衽：左襟压右襟，领口斜线从左肩颈处斜下到右腋
    lap = [(0.035, 1.455), (0.0, 1.37), (-0.055, 1.27), (-0.1, 1.17), (-0.128, 1.07)]
    pts, refs = [], []
    for q in catmull([V((x, 0, z)) for x, z in lap], 3):
        p, n = torso_surf(q[0], q[2])
        pts.append(p)
        refs.append(n)
    loft(pts, 0.0045, 0.02, 4, "robe_inner", "torso", ref=refs, cap0=True, cap1=True, phase=45)
    lap2 = [(-0.035, 1.455), (-0.012, 1.40), (0.004, 1.355)]
    pts, refs = [], []
    for q in catmull([V((x, 0, z)) for x, z in lap2], 3):
        p, n = torso_surf(q[0], q[2], 0.002)
        pts.append(p)
        refs.append(n)
    loft(pts, 0.004, 0.017, 4, "robe_inner", "torso", ref=refs, cap0=True, cap1=True, phase=45)
    # 后领
    loft([(0, 0.005, 1.43), (0, 0.005, 1.47)], 0.068, 0.064, 14, "robe_inner", "torso", ref=(1, 0, 0), cap0=False, cap1=False)

    # ---- 腰带 ----
    loft([(0, 0, 0.925), (0, 0, 1.0), (0, 0, 1.08)], [0.19, 0.186, 0.172], [0.15, 0.146, 0.132], 18, "sash_dark", "sash", ref=(1, 0, 0), cap0=True, cap1=True)
    ellipsoid((0.045, -0.15, 1.005), (0.032, 0.02, 0.026), 8, 6, "sash_dark", "sash")
    for k, (dx, ln) in enumerate(((0.03, 0.30), (0.065, 0.24))):
        a = V((dx, -0.153, 0.995))
        b = a + V((0.012 + 0.01 * k, -0.025, -ln))
        loft(catmull([a, (a + b) / 2 + V((0, -0.012, 0)), b], 3), 0.004, [0.018] * 6 + [0.022], 4, "sash_dark", "sash_end", ref=(0, -1, 0), cap0=True, cap1=True, phase=45)

    # ---- 下摆：前后两片，腰部合拢，膝下两侧开衩 ----
    zl = [lerp(1.0, 0.11, i / 11) for i in range(12)]

    def span(z):
        if z >= 0.74:
            return 96.0
        return lerp(64.0, 96.0, (z - 0.11) / (0.74 - 0.11)) ** 1.0

    rxf = lambda z: 0.168 + (1.0 - z) * 0.165
    ryf = lambda z: 0.128 + (1.0 - z) * 0.165
    thick_panel(zl, rxf, ryf, lambda z: (-90 - span(z), -90 + span(z)), 12, 0.012, "robe_white", "skirt_f", lambda z: V((0, -0.005, z)))
    thick_panel(zl, lambda z: rxf(z) * 0.965, lambda z: ryf(z) * 0.965, lambda z: (90 - span(z), 90 + span(z)), 12, 0.012, "robe_white", "skirt_b",
                lambda z: V((0, 0.005, z)))

    # ---- 腿：中衣裤管 + 黑靴 ----
    for s, tag in ((1, "L"), (-1, "R")):
        loft([(HIP_X * s, 0, 0.93), (0.098 * s, -0.004, 0.70), KNEE(s), (0.1 * s, -0.004, 0.31)], [0.088, 0.078, 0.062, 0.057], [0.088, 0.078, 0.062, 0.057], 10,
             "robe_inner", "leg_" + tag, ref=(1, 0, 0), cap0=True, cap1=True)
        loft([(0.1 * s, -0.004, 0.36), (0.1 * s, -0.002, 0.22), (0.1 * s, 0.0, 0.08)], [0.062, 0.059, 0.056], [0.062, 0.059, 0.056], 10, "boots_black", "boot_" + tag,
             ref=(1, 0, 0), cap0=True, cap1=True)
        loft([(0.1 * s, 0.055, 0.05), (0.1 * s, -0.01, 0.052), (0.1 * s, -0.11, 0.042), (0.1 * s, -0.175, 0.03)], [0.05, 0.052, 0.04, 0.02], [0.05, 0.058, 0.054, 0.03], 10,
             "boots_black", "foot_" + tag, ref=(0, 0, 1), cap0=True, cap1=True)

    # ---- 手臂：宽袖 + 护腕 + 手 ----
    for s, tag in ((1, "L"), (-1, "R")):
        d, S, E, W = arm_pts(s)
        dd = nrm(V((0, 0, -1)) - d * V((0, 0, -1)).dot(d))
        ls = [0.02, 0.09, 0.20, 0.30, 0.39, 0.46]
        droop = [0.0, 0.004, 0.012, 0.028, 0.048, 0.066]
        rh = [0.056, 0.064, 0.08, 0.102, 0.128, 0.15]
        rw = [0.058, 0.064, 0.074, 0.088, 0.097, 0.104]
        cs = [S + d * l + dd * dr for l, dr in zip(ls, droop)]
        loft(cs, rh, rw, 14, "robe_white", "sleeve_" + tag, ref=dd, cap0=True, cap1=False)
        # 袖口内衬一圈（让开口处有深浅层次）
        loft([cs[-1] - d * 0.004, cs[-1] + d * 0.002], [rh[-1] - 0.006] * 2, [rw[-1] - 0.006] * 2, 14, "robe_inner", "sleeve_" + tag, ref=dd)
        loft([S + d * 0.40, S + d * 0.47, W + d * 0.012], [0.043, 0.042, 0.039], [0.043, 0.042, 0.039], 10, "sash_dark", "wrist_" + tag, ref=dd, cap0=True, cap1=True)
        hc = W + d * 0.056
        ellipsoid(hc, (0.042, 0.036, 0.062), 10, 8, "skin", "hand_" + tag, basis=basis_z(d, hint=(0, 1, 0)))
        # 拇指
        ellipsoid(hc + V((0, -0.04, 0.0)) + d * -0.01, (0.016, 0.016, 0.03), 8, 5, "skin", "hand_" + tag, basis=basis_z(d * 0.6 + V((0, -1, 0)) * 0.8, hint=(0, 0, 1)))

    # ---- 剑：握在右手，静止姿势下剑尖指向前方（-Y），刃口朝上下 ----
    d, S, E, W = arm_pts(-1)
    hc = W + d * 0.056
    b0, e0 = V((0, -1, 0)), V((0, 0, 1))
    loft([hc - b0 * 0.115, hc + b0 * 0.085], 0.0145, 0.0145, 8, "sword_hilt", "sword", ref=e0, cap0=True, cap1=True)
    ellipsoid(hc - b0 * 0.13, (0.021, 0.021, 0.021), 8, 6, "sword_hilt", "sword")
    loft([hc + b0 * 0.085, hc + b0 * 0.105], 0.062 * 1.414, 0.017 * 1.414, 4, "sword_hilt", "sword", ref=e0, cap0=True, cap1=True, phase=45, smooth=False)
    bl = [0.105, 0.3, 0.6, 0.76, 0.815]
    loft([hc + b0 * l for l in bl], [0.019, 0.018, 0.0165, 0.012, 0.0006], [0.0045, 0.0045, 0.004, 0.003, 0.0005], 4, "sword_steel", "sword", ref=e0, cap0=True,
         smooth=False)
    # 剑穗
    P = hc - b0 * 0.15
    loft([P + V((0, 0, 0.01)), P + V((0, 0, -0.05))], 0.0045, 0.0045, 6, "tassel_red", "tassel", ref=(1, 0, 0), cap0=True, cap1=True)
    loft([P + V((0, 0, -0.045)), P + V((0, 0, -0.07)), P + V((0, 0, -0.12)), P + V((0, 0, -0.16))], [0.011, 0.018, 0.026, 0.031], [0.011, 0.018, 0.026, 0.031], 8,
         "tassel_red", "tassel", ref=(1, 0, 0), cap0=True, cap1=True)
    return hc, P, rib


# =============================================================================================
# 骨骼
# =============================================================================================
def define_bones(hc, tassel_p, rib):
    B = []  # (name, head, tail, parent, deform)

    def bone(n, h, t, p, deform=True):
        B.append((n, V(h), V(t), p, deform))

    bone("root", (0, 0, 0), (0, 0, 0.25), None, False)
    bone("hips", (0, 0, HIP_Z), (0, 0, 1.0), "root")
    bone("spine", (0, 0, 1.0), (0, 0, 1.17), "hips")
    bone("chest", (0, 0, 1.17), (0, 0, 1.38), "spine")
    bone("neck", (0, 0, 1.38), (0, 0, 1.49), "chest")
    bone("head", (0, 0, 1.49), (0, 0, 1.75), "neck")
    for i in range(4):
        bone("ribbon%d" % (i + 1), rib[i], rib[i + 1], "head" if i == 0 else "ribbon%d" % i)
    for s, tag in ((1, "L"), (-1, "R")):
        d, S, E, W = arm_pts(s)
        bone("shoulder_" + tag, (0.03 * s, 0, 1.385), S, "chest")
        bone("upperarm_" + tag, S, E, "shoulder_" + tag)
        bone("forearm_" + tag, E, W, "upperarm_" + tag)
        bone("hand_" + tag, W, W + d * HAND, "forearm_" + tag)
        sh = S + d * 0.42
        bone("sleeve_" + tag, sh, sh + V((0, 0, -0.13)) + d * 0.02, "forearm_" + tag)
    for s, tag in ((1, "L"), (-1, "R")):
        bone("thigh_" + tag, (HIP_X * s, 0, HIP_Z), KNEE(s), "hips")
        bone("shin_" + tag, KNEE(s), ANKLE(s), "thigh_" + tag)
        bone("foot_" + tag, ANKLE(s), (0.1 * s, -0.15, 0.03), "shin_" + tag)
    bone("skirt_f1", (0, -0.135, 0.9), (0, -0.2, 0.52), "hips")
    bone("skirt_f2", (0, -0.2, 0.52), (0, -0.26, 0.12), "skirt_f1")
    bone("skirt_b1", (0, 0.13, 0.9), (0, 0.19, 0.52), "hips")
    bone("skirt_b2", (0, 0.19, 0.52), (0, 0.24, 0.12), "skirt_b1")
    bone("sword", hc, hc + V((0, -0.35, 0)), "hand_R")
    bone("tassel1", tassel_p, tassel_p + V((0, 0, -0.07)), "sword")
    bone("tassel2", tassel_p + V((0, 0, -0.07)), tassel_p + V((0, 0, -0.16)), "tassel1")
    return B


PART_BONES = {
    "head": ["head"],
    "neck": ["neck", "head", "chest"],
    "torso": ["hips", "spine", "chest", "neck", "shoulder_L", "shoulder_R"],
    "sash": ["hips", "spine"],
    "sash_end": ["hips", "skirt_f1"],
    "skirt_f": ["hips", "skirt_f1", "skirt_f2"],
    "skirt_b": ["hips", "skirt_b1", "skirt_b2"],
    "ribbon": ["head", "ribbon1", "ribbon2", "ribbon3", "ribbon4"],
    "sword": ["sword"],
    "tassel": ["tassel1", "tassel2"],
}
for t in ("L", "R"):
    PART_BONES["leg_" + t] = ["hips", "thigh_" + t, "shin_" + t]
    PART_BONES["boot_" + t] = ["shin_" + t, "foot_" + t]
    PART_BONES["foot_" + t] = ["foot_" + t, "shin_" + t]
    PART_BONES["sleeve_" + t] = ["shoulder_" + t, "upperarm_" + t, "forearm_" + t, "sleeve_" + t]
    PART_BONES["wrist_" + t] = ["forearm_" + t, "hand_" + t]
    PART_BONES["hand_" + t] = ["hand_" + t]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.dot(ab), 1e-9)))
    return (p - (a + ab * t)).length


def compute_weights(bone_defs):
    segs = {n: (h, t) for n, h, t, _, _ in bone_defs}
    out = []
    for p, part in zip(mb.v, mb.part):
        cands = PART_BONES[part]
        if len(cands) == 1:
            out.append([(cands[0], 1.0)])
            continue
        ws = []
        for c in cands:
            d = seg_dist(p, *segs[c])
            if c in ("sleeve_L", "sleeve_R"):
                d *= 0.85
            ws.append((c, 1.0 / (d + 0.006) ** 5))
        ws.sort(key=lambda x: -x[1])
        ws = ws[:3]
        tot = sum(w for _, w in ws)
        out.append([(c, w / tot) for c, w in ws if w / tot > 0.01])
    return out


# =============================================================================================
# 建立 Blender 对象
# =============================================================================================
def make_objects(bone_defs, weights):
    for m in bpy.data.objects:
        bpy.data.objects.remove(m, do_unlink=True)
    scene = bpy.context.scene
    scene.render.fps = FPS

    mats = []
    for name, col, metal, rough in MATS:
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        m.diffuse_color = col
        m.use_backface_culling = False
        mats.append(m)

    me = bpy.data.meshes.new("hero")
    me.from_pydata([tuple(v) for v in mb.v], [], mb.f)
    for m in mats:
        me.materials.append(m)
    for i, poly in enumerate(me.polygons):
        poly.material_index = mb.fm[i]
        poly.use_smooth = mb.fs[i]
    me.validate()
    me.update()
    obj = bpy.data.objects.new("hero", me)
    scene.collection.objects.link(obj)

    ad = bpy.data.armatures.new("hero_rig")
    arm = bpy.data.objects.new("hero_rig", ad)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    ebs = {}
    for n, h, t, p, deform in bone_defs:
        eb = ad.edit_bones.new(n)
        eb.head, eb.tail = h, t
        eb.use_deform = deform
        if p:
            eb.parent = ebs[p]
        ebs[n] = eb
    bpy.ops.object.mode_set(mode="OBJECT")

    for n, _, _, _, deform in bone_defs:
        if deform:
            obj.vertex_groups.new(name=n)
    for vi, ws in enumerate(weights):
        for n, w in ws:
            obj.vertex_groups[n].add([vi], w, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return obj, arm


# =============================================================================================
# 姿势求解：世界轴旋转 + 两骨 IK + 次级动态（飘带 / 剑穗 / 袖 / 裙摆）
# =============================================================================================
class Rig:
    def __init__(self, arm, bone_defs):
        self.arm = arm
        self.order = [b[0] for b in bone_defs]
        self.parent = {b[0]: b[3] for b in bone_defs}
        self.rest = {n: arm.data.bones[n].matrix_local.copy() for n in self.order}
        self.rest_inv = {n: m.inverted() for n, m in self.rest.items()}
        self.rest_head = {n: arm.data.bones[n].head_local.copy() for n in self.order}
        self.rest_tail = {n: arm.data.bones[n].tail_local.copy() for n in self.order}
        self.len = {n: (self.rest_tail[n] - self.rest_head[n]).length for n in self.order}
        self.chains = {
            "ribbon": dict(bones=["ribbon1", "ribbon2", "ribbon3", "ribbon4"], parent="head", damp=0.9, stiff=0.012, grav=1.0, wind=1.0, coll="body"),
            "tassel": dict(bones=["tassel1", "tassel2"], parent="sword", damp=0.9, stiff=0.02, grav=1.0, wind=0.7, coll=None),
            "sleeve_L": dict(bones=["sleeve_L"], parent="forearm_L", damp=0.86, stiff=0.12, grav=0.8, wind=0.4, coll=None),
            "sleeve_R": dict(bones=["sleeve_R"], parent="forearm_R", damp=0.86, stiff=0.12, grav=0.8, wind=0.4, coll=None),
            "skirt_f": dict(bones=["skirt_f1", "skirt_f2"], parent="hips", damp=0.82, stiff=0.22, grav=0.6, wind=0.15, coll="front"),
            "skirt_b": dict(bones=["skirt_b1", "skirt_b2"], parent="hips", damp=0.82, stiff=0.22, grav=0.6, wind=0.25, coll="back"),
        }
        self.chain_of_first = {c["bones"][0]: k for k, c in self.chains.items()}
        self.chain_member = {b: k for k, c in self.chains.items() for b in c["bones"]}
        for k, c in self.chains.items():
            pts = [self.rest_head[c["bones"][0]]] + [self.rest_tail[b] for b in c["bones"]]
            c["rest_pts"] = pts
            c["lens"] = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
        self.state = {}
        # IK 静止坐标系
        self.arm_pole_rest = V((0, 1, 0))
        self.leg_pole_rest = V((0, -1, 0))
        self.b0, self.e0 = V((0, -1, 0)), V((0, 0, 1))

    # ---- 工具 ----
    @staticmethod
    def F(dirv, pole):
        y = nrm(dirv)
        x = y.cross(V(pole))
        if x.length < 1e-6:
            x = y.cross(V((0, 0, 1)) if abs(y.z) < 0.9 else V((1, 0, 0)))
        x.normalize()
        z = x.cross(y)
        return Matrix((x, y, z)).transposed()

    @staticmethod
    def G(b, e):
        b = nrm(b)
        e = V(e) - b * V(e).dot(b)
        if e.length < 1e-6:
            e = V((0, 0, 1)) - b * b.z
        e.normalize()
        return Matrix((b, e, b.cross(e))).transposed()

    def carried(self, n, world):
        p = self.parent[n]
        if p is None:
            return self.rest[n].copy()
        return world[p] @ self.rest_inv[p] @ self.rest[n]

    def ik2(self, root, target, la, lb, pole):
        d = target - root
        dist = min(max(d.length, abs(la - lb) + 1e-3), (la + lb) * 0.9995)
        u = nrm(d)
        p = V(pole)
        v = p - u * p.dot(u)
        if v.length < 1e-6:
            v = V((0, 0, 1)) - u * u.z
        v.normalize()
        ca = (la * la + dist * dist - lb * lb) / (2 * la * dist)
        ca = max(-1.0, min(1.0, ca))
        sa = math.sqrt(max(0.0, 1 - ca * ca))
        elbow = root + (u * ca + v * sa) * la
        end = root + u * dist
        return elbow, end, v

    # ---- 次级动态 ----
    def chain_targets(self, c, world):
        p = c["parent"] if isinstance(c["parent"], str) else None
        M = world[c["parent"]] @ self.rest_inv[c["parent"]]
        return [M @ q for q in c["rest_pts"]]

    def sim_chain(self, key, c, world, dt, wind, reset):
        tg = self.chain_targets(c, world)
        st = self.state.get(key)
        if st is None or reset:
            st = {"x": [t.copy() for t in tg], "xp": [t.copy() for t in tg]}
            self.state[key] = st
        x, xp = st["x"], st["xp"]
        sub = 4
        h = dt / sub
        g = V((0, 0, -9.8 * c["grav"])) + V(wind) * c["wind"]
        for _ in range(sub):
            x[0] = tg[0].copy()
            for i in range(1, len(x)):
                vel = (x[i] - xp[i]) * c["damp"]
                xp[i] = x[i].copy()
                x[i] = x[i] + vel + g * (h * h)
                x[i] = x[i] + (tg[i] - x[i]) * c["stiff"]
            for _it in range(2):
                for i in range(1, len(x)):
                    dv = x[i] - x[i - 1]
                    x[i] = x[i - 1] + nrm(dv) * c["lens"][i - 1]
                self.collide(c, x, world)
        return x

    def collide(self, c, x, world):
        mode = c["coll"]
        if mode == "body":
            # 飘带不高过发髻太多（剧烈动作时避免竖直甩到头顶）
            for i in range(1, len(x)):
                cap = x[0].z + 0.04 - 0.02 * i
                if x[i].z > cap:
                    x[i].z = cap
            spheres = []
            hm = world["head"]
            spheres.append((hm @ (self.rest_inv["head"] @ V((0, 0.0, 1.6))), 0.135))
            cm = world["chest"] @ self.rest_inv["chest"]
            spheres.append((cm @ V((0, 0.005, 1.3)), 0.19))
            spheres.append((cm @ V((0, 0.0, 1.17)), 0.19))
            hp = world["hips"] @ self.rest_inv["hips"]
            spheres.append((hp @ V((0, 0.0, 0.98)), 0.19))
            for i in range(1, len(x)):
                for cc, r in spheres:
                    dv = x[i] - cc
                    if dv.length < r:
                        x[i] = cc + nrm(dv) * r
        elif mode in ("front", "back"):
            Mh = world["hips"] @ self.rest_inv["hips"]
            Mi = Mh.inverted()
            knees = [Mi @ (world["shin_" + t].translation) for t in ("L", "R")]
            thighs = [Mi @ ((world["thigh_" + t].translation + world["shin_" + t].translation) * 0.5) for t in ("L", "R")]
            for i in range(1, len(x)):
                q = Mi @ x[i]
                if mode == "front":
                    lim = min(k.y for k in knees + thighs) - 0.1
                    if q.y > lim:
                        q.y = lim
                else:
                    lim = max(k.y for k in knees + thighs) + 0.1
                    if q.y < lim:
                        q.y = lim
                x[i] = Mh @ q

    # ---- 一帧 ----
    def solve(self, P, dt, reset=False):
        world, basis = {}, {}
        ik = {}
        aims = {}
        for n in self.order:
            C = self.carried(n, world)
            head = C.translation.copy()
            W = None
            if n in self.chain_of_first:
                key = self.chain_of_first[n]
                c = self.chains[key]
                x = self.sim_chain(key, c, world, dt, P["wind"], reset)
                for i, b in enumerate(c["bones"]):
                    aims[b] = x[i + 1]
            if n in ("upperarm_L", "upperarm_R"):
                t = n[-1]
                hs = P["hand_" + t]
                la, lb = self.len["upperarm_" + t], self.len["forearm_" + t]
                E, Wt, v = self.ik2(head, V(hs["w"]), la, lb, hs["pole"])
                Fr = self.F(self.rest_tail["upperarm_" + t] - self.rest_head["upperarm_" + t], self.arm_pole_rest)
                R = self.F(E - head, v) @ Fr.transposed() @ self.rest[n].to_3x3()
                Fr2 = self.F(self.rest_tail["forearm_" + t] - self.rest_head["forearm_" + t], self.arm_pole_rest)
                ik["forearm_" + t] = self.F(Wt - E, v) @ Fr2.transposed() @ self.rest["forearm_" + t].to_3x3()
                W = Matrix.Translation(head) @ R.to_4x4()
            elif n in ik:
                W = Matrix.Translation(head) @ ik[n].to_4x4()
            elif n in ("thigh_L", "thigh_R"):
                t = n[-1]
                fs = P["foot_" + t]
                la, lb = self.len["thigh_" + t], self.len["shin_" + t]
                K, A, v = self.ik2(head, V(fs["a"]), la, lb, fs["pole"])
                Fr = self.F(self.rest_tail[n] - self.rest_head[n], self.leg_pole_rest)
                R = self.F(K - head, v) @ Fr.transposed() @ self.rest[n].to_3x3()
                Fr2 = self.F(self.rest_tail["shin_" + t] - self.rest_head["shin_" + t], self.leg_pole_rest)
                ik["shin_" + t] = self.F(A - K, v) @ Fr2.transposed() @ self.rest["shin_" + t].to_3x3()
                W = Matrix.Translation(head) @ R.to_4x4()
            elif n in ("foot_L", "foot_R"):
                Q = Euler([math.radians(a) for a in P["foot_" + n[-1]]["r"]], "XYZ").to_matrix()
                W = Matrix.Translation(head) @ (Q @ self.rest[n].to_3x3()).to_4x4()
            elif n == "hand_R":
                hs = P["hand_R"]
                R = self.G(hs["b"], hs["e"]) @ self.G(self.b0, self.e0).transposed() @ self.rest[n].to_3x3()
                W = Matrix.Translation(head) @ R.to_4x4()
            elif n in aims:
                cur = (C.to_3x3() @ V((0, 1, 0))).normalized()
                Q = cur.rotation_difference(nrm(aims[n] - head)).to_matrix().to_4x4()
                W = Matrix.Translation(head) @ Q @ Matrix.Translation(-head) @ C
            else:
                r = P["rot"].get(n)
                if r is not None and any(abs(a) > 1e-6 for a in r):
                    Q = Euler([math.radians(a) for a in r], "XYZ").to_matrix().to_4x4()
                    W = Matrix.Translation(head) @ Q @ Matrix.Translation(-head) @ C
                else:
                    W = C
            if n == "hips":
                W = Matrix.Translation(V(P["hips_off"])) @ W
            world[n] = W
            basis[n] = C.inverted() @ W
        return world, basis


# =============================================================================================
# 姿势参数与动画
# =============================================================================================
def blank_pose():
    return {
        "hips_off": V((0, 0, 0)),
        "rot": {n: V((0, 0, 0)) for n in ("hips", "spine", "chest", "neck", "head", "shoulder_L", "shoulder_R", "hand_L")},
        "hand_R": {"w": V((0, 0, 0)), "pole": V((0, 0, 0)), "b": V((0, -1, 0)), "e": V((0, 0, 1))},
        "hand_L": {"w": V((0, 0, 0)), "pole": V((0, 0, 0))},
        "foot_L": {"a": V((0, 0, 0)), "r": V((0, 0, 0)), "pole": V((0, -1, 0.1))},
        "foot_R": {"a": V((0, 0, 0)), "r": V((0, 0, 0)), "pole": V((0, -1, 0.1))},
        "wind": V((0, 0, 0)),
    }


def flat(P):
    out = list(P["hips_off"])
    for k in sorted(P["rot"]):
        out += list(P["rot"][k])
    for k in ("hand_R", "hand_L", "foot_L", "foot_R"):
        for kk in sorted(P[k]):
            out += list(P[k][kk])
    out += list(P["wind"])
    return out


def unflat(a):
    P = blank_pose()
    i = 0

    def take():
        nonlocal i
        v = V(a[i:i + 3])
        i += 3
        return v

    P["hips_off"] = take()
    for k in sorted(P["rot"]):
        P["rot"][k] = take()
    for k in ("hand_R", "hand_L", "foot_L", "foot_R"):
        for kk in sorted(P[k]):
            P[k][kk] = take()
    P["wind"] = take()
    return P


def pose(base=None, **kw):
    P = unflat(flat(base)) if base else blank_pose()
    for k, v in kw.items():
        if k in ("hips_off", "wind"):
            P[k] = V(v)
        elif k == "rot":
            for b, r in v.items():
                P["rot"][b] = V(r)
        else:
            for kk, vv in v.items():
                P[k][kk] = V(vv)
    return P


def blend(A, B, t):
    a, b = flat(A), flat(B)
    return unflat([lerp(x, y, t) for x, y in zip(a, b)])


def spline(keys, t):
    """keys: [(time, pose, hold)]。三次 Hermite，内部关键帧切线连续（保证挥剑弧线不在中途停顿）。"""
    ts = [k[0] for k in keys]
    vs = [flat(k[1]) for k in keys]
    if t <= ts[0]:
        return unflat(vs[0])
    if t >= ts[-1]:
        return unflat(vs[-1])
    i = max(j for j in range(len(ts) - 1) if ts[j] <= t)
    n = len(vs[0])

    def tan(j):
        if j == 0 or j == len(ts) - 1 or keys[j][2]:
            return [0.0] * n
        return [(vs[j + 1][c] - vs[j - 1][c]) / (ts[j + 1] - ts[j - 1]) for c in range(n)]

    h = ts[i + 1] - ts[i]
    s = (t - ts[i]) / h
    m0, m1 = tan(i), tan(i + 1)
    h00 = 2 * s ** 3 - 3 * s ** 2 + 1
    h10 = s ** 3 - 2 * s ** 2 + s
    h01 = -2 * s ** 3 + 3 * s ** 2
    h11 = s ** 3 - s ** 2
    return unflat([h00 * vs[i][c] + h10 * h * m0[c] + h01 * vs[i + 1][c] + h11 * h * m1[c] for c in range(n)])


# ---- 循环动作 ----
def idle(t):
    ph = 2 * math.pi * t / 2.0
    br = math.sin(ph)
    return pose(
        hips_off=(0.004 * math.sin(ph + 0.6), 0, -0.035 + 0.006 * br),
        rot={"hips": (0, 0, -7), "spine": (4, 0, 0), "chest": (2 + 1.6 * br, 0, 5 + 0.8 * math.sin(ph + 1)), "neck": (-2, 0, 0),
             "head": (-3 + 0.8 * math.sin(ph + 0.4), 0, 3), "hand_L": (0, 0, -6)},
        hand_R={"w": (-0.23, -0.07, 0.93 + 0.006 * br), "pole": (-0.6, 0.5, -0.6), "b": (-0.18, -0.56, -0.81), "e": (0, -1, 0.25)},
        hand_L={"w": (0.245, -0.03, 0.945 + 0.005 * br), "pole": (0.35, 0.85, 0)},
        foot_L={"a": (0.12, -0.07, 0.09), "r": (0, 0, 9)},
        foot_R={"a": (-0.115, 0.07, 0.09), "r": (0, 0, -16)},
        wind=(0.25 * math.sin(ph * 0.5), 0.5, 0),
    )


def run(t):
    ph = 2 * math.pi * t / 0.7
    s, c = math.sin(ph), math.cos(ph)
    P = pose(
        hips_off=(0, -0.02, -0.068 + 0.028 * math.cos(2 * ph)),
        rot={"hips": (7, 0, 10 * s), "spine": (9, 0, 0), "chest": (5, 0, -15 * s), "neck": (-6, 0, 3 * s), "head": (-9, 0, 4 * s), "hand_L": (0, 0, 0)},
        hand_R={"w": (-0.27, 0.17, 1.0 + 0.018 * math.sin(2 * ph)), "pole": (-0.5, 0.4, -0.35), "b": (-0.18, 0.72, -0.67), "e": (0, 0.6, 0.8)},
        hand_L={"w": (0.23, 0.2 * s - 0.04, 1.03 + 0.05 * abs(s)), "pole": (0.3, 0.8, -0.2)},
        wind=(0, 9.0, 0),
    )
    for tag, phs in (("L", ph), ("R", ph + math.pi)):
        ss, cc = math.sin(phs), math.cos(phs)
        x = 0.1 if tag == "L" else -0.1
        lift = 0.2 * max(0.0, cc) ** 1.3
        P["foot_" + tag]["a"] = V((x, -0.31 * ss + 0.03, 0.09 + lift))
        P["foot_" + tag]["r"] = V((-22 * ss + 18 * max(0.0, cc), 0, 0))
        P["foot_" + tag]["pole"] = V((0.15 * (1 if tag == "L" else -1), -1, 0.1))
    return P


def guard(t):
    ph = 2 * math.pi * t / 1.0
    br = math.sin(ph)
    return pose(
        hips_off=(0, 0, -0.085 + 0.004 * br),
        rot={"hips": (0, 0, -22), "spine": (5, 0, 4), "chest": (3 + br, 0, 6), "neck": (-3, 0, 6), "head": (-4, 0, 6), "shoulder_R": (0, 0, 0), "hand_L": (0, 30, 0)},
        hand_R={"w": (-0.1, -0.33, 1.28 + 0.004 * br), "pole": (-0.7, 0.2, -0.55), "b": (1.0, -0.18, 0.12), "e": (0, 0.1, 1)},
        hand_L={"w": (0.23, -0.37, 1.255 + 0.004 * br), "pole": (0.7, 0.25, -0.5)},
        foot_L={"a": (0.17, -0.13, 0.09), "r": (0, 0, 12), "pole": (0.3, -1, 0.1)},
        foot_R={"a": (-0.15, 0.13, 0.09), "r": (0, 0, -25), "pole": (-0.3, -1, 0.1)},
        wind=(0, 0.4, 0),
    )


READY = idle(0.0)


def slash1_keys():
    wind = pose(READY, hips_off=(0, 0.02, -0.04), rot={"hips": (0, 0, -16), "spine": (-3, 0, 0), "chest": (0, 0, -26), "head": (-3, 0, 14)},
                hand_R={"w": (-0.32, 0.03, 1.47), "pole": (-0.6, 0.3, -0.5), "b": (-0.25, 0.35, 0.9), "e": (0.6, -0.6, -0.5)},
                hand_L={"w": (0.27, -0.22, 1.12), "pole": (0.5, 0.5, -0.4)})
    mid = pose(wind, hips_off=(0, -0.05, -0.06), rot={"hips": (0, 0, -2), "spine": (8, 0, 0), "chest": (2, 0, 0), "head": (-5, 0, 2)},
               hand_R={"w": (-0.08, -0.46, 1.2), "pole": (-0.6, 0.5, -0.3), "b": (0.35, -0.9, 0.24), "e": (0.7, 0, -0.7)},
               hand_L={"w": (0.28, -0.05, 1.05)})
    hit = pose(mid, hips_off=(0, -0.09, -0.08), rot={"hips": (0, 0, 13), "spine": (12, 0, 0), "chest": (4, 0, 30), "neck": (0, 0, -10), "head": (-6, 0, -12)},
               hand_R={"w": (0.13, -0.31, 0.95), "pole": (-0.2, 0.7, -0.6), "b": (0.82, -0.22, -0.53), "e": (0.3, 0.6, -0.7)},
               hand_L={"w": (0.3, 0.16, 1.05), "pole": (0.4, 0.8, 0)},
               foot_L={"a": (0.13, -0.2, 0.09), "r": (0, 0, 14)})
    follow = pose(hit, rot={"chest": (4, 0, 34)}, hand_R={"w": (0.17, -0.26, 0.92), "b": (0.86, -0.08, -0.5)})
    end = blend(READY, follow, 0.4)
    return [(0, READY, True), (0.1, wind, True), (0.16, mid, False), (0.22, hit, False), (0.32, follow, True), (0.45, end, True)], follow


def slash2_keys(start):
    wind = pose(start, hips_off=(0, -0.03, -0.06), rot={"hips": (0, 0, 10), "chest": (0, 0, 32), "head": (-4, 0, -14)},
                hand_R={"w": (0.15, -0.16, 1.42), "pole": (-0.2, 0.6, -0.7), "b": (0.45, 0.3, 0.84), "e": (-0.6, -0.6, -0.4)},
                hand_L={"w": (0.32, 0.1, 1.08)})
    mid = pose(wind, hips_off=(0, -0.06, -0.07), rot={"hips": (0, 0, -2), "spine": (10, 0, 0), "chest": (3, 0, 0), "neck": (0, 0, 0), "head": (-5, 0, 0)},
               hand_R={"w": (-0.05, -0.47, 1.16), "pole": (-0.7, 0.4, -0.3), "b": (-0.35, -0.9, 0.14), "e": (-0.7, 0, -0.7)},
               hand_L={"w": (0.3, -0.2, 1.1), "pole": (0.5, 0.5, -0.3)})
    hit = pose(mid, hips_off=(0, -0.08, -0.08), rot={"hips": (0, 0, -16), "spine": (12, 0, 0), "chest": (4, 0, -32), "neck": (0, 0, 8), "head": (-6, 0, 12)},
               hand_R={"w": (-0.37, -0.22, 0.95), "pole": (-0.8, 0.4, -0.2), "b": (-0.83, -0.2, -0.52), "e": (-0.3, 0.6, -0.7)},
               hand_L={"w": (0.33, -0.28, 1.12), "pole": (0.6, 0.4, -0.3)},
               foot_R={"a": (-0.13, -0.16, 0.09), "r": (0, 0, -8)}, foot_L={"a": (0.12, 0.08, 0.09), "r": (0, 0, 14)})
    follow = pose(hit, rot={"chest": (4, 0, -36)}, hand_R={"w": (-0.39, -0.15, 0.92), "b": (-0.86, -0.02, -0.5)})
    end = blend(READY, follow, 0.4)
    return [(0, start, True), (0.09, wind, True), (0.15, mid, False), (0.21, hit, False), (0.3, follow, True), (0.45, end, True)], follow


def slash3_keys(start):
    up = pose(start, hips_off=(0, 0.05, -0.03), rot={"hips": (0, 0, -6), "spine": (-8, 0, 0), "chest": (-4, 0, -8), "neck": (0, 0, 0), "head": (-2, 0, 4)},
              hand_R={"w": (-0.1, 0.06, 1.74), "pole": (-0.8, 0.2, 0.2), "b": (0.05, 0.45, 0.85), "e": (0, -0.9, 0.3)},
              hand_L={"w": (-0.02, 0.03, 1.7), "pole": (0.8, 0.2, 0.2)},
              foot_L={"a": (0.12, -0.06, 0.09)}, foot_R={"a": (-0.115, 0.08, 0.09)})
    mid = pose(up, hips_off=(0, -0.12, -0.08), rot={"spine": (8, 0, 0), "chest": (2, 0, -4)},
               hand_R={"w": (-0.06, -0.42, 1.42), "pole": (-0.8, 0.3, -0.2), "b": (0.0, -0.9, 0.42), "e": (0, -0.4, -1)},
               hand_L={"w": (0.02, -0.4, 1.4), "pole": (0.8, 0.3, -0.2)})
    hit = pose(mid, hips_off=(0, -0.22, -0.15), rot={"hips": (0, 0, -8), "spine": (18, 0, 0), "chest": (6, 0, -4), "head": (-12, 0, 2)},
               hand_R={"w": (-0.06, -0.52, 1.0), "pole": (-0.8, 0.4, -0.2), "b": (0.0, -0.76, -0.65), "e": (0, 0.6, -0.8)},
               hand_L={"w": (0.03, -0.48, 1.03), "pole": (0.8, 0.4, -0.2)},
               foot_L={"a": (0.12, -0.42, 0.09), "r": (0, 0, 6)}, foot_R={"a": (-0.12, 0.22, 0.1), "r": (28, 0, -10)})
    follow = pose(hit, hips_off=(0, -0.24, -0.16), hand_R={"w": (-0.06, -0.55, 0.95)}, hand_L={"w": (0.03, -0.51, 0.98)})
    end = blend(READY, follow, 0.45)
    return [(0, start, True), (0.12, up, True), (0.2, mid, False), (0.26, hit, False), (0.36, follow, True), (0.5, end, True)]


def dodge_keys():
    crouch = pose(READY, hips_off=(0, 0.03, -0.13), rot={"spine": (12, 0, 0), "head": (-10, 0, 0)},
                  hand_R={"w": (-0.26, -0.02, 0.92)}, hand_L={"w": (0.25, 0.0, 0.9)})
    dash = pose(crouch, hips_off=(0, -0.12, -0.1), rot={"hips": (8, 0, -4), "spine": (26, 0, 0), "chest": (8, 0, 0), "neck": (-8, 0, 0), "head": (-20, 0, 0)},
                hand_R={"w": (-0.25, 0.3, 1.0), "pole": (-0.5, 0.3, -0.5), "b": (-0.1, 0.75, -0.65), "e": (0, 0.6, 0.8)},
                hand_L={"w": (0.25, 0.3, 1.0), "pole": (0.5, 0.3, -0.5)},
                foot_L={"a": (0.1, -0.36, 0.09), "r": (-18, 0, 0)}, foot_R={"a": (-0.1, 0.3, 0.22), "r": (35, 0, 0)}, wind=(0, 16, 0))
    brake = pose(dash, hips_off=(0, -0.05, -0.09), rot={"spine": (14, 0, 0), "chest": (4, 0, 0), "head": (-12, 0, 0)},
                 foot_L={"a": (0.11, -0.15, 0.09), "r": (0, 0, 6)}, foot_R={"a": (-0.11, 0.1, 0.09), "r": (0, 0, -10)}, wind=(0, 5, 0))
    end = blend(READY, brake, 0.25)
    return [(0, READY, True), (0.06, crouch, True), (0.16, dash, False), (0.28, brake, False), (0.4, end, True)]


# ---- 施法与受击（v0.3）：法术栏用三种施法手势，另加受击、倒地 ----
def cast_point_keys():
    """点：单手前刺，剑尖指向前方（放飞剑、剑气、符箓等投射类法术）。"""
    wind = pose(READY, hips_off=(0, 0.04, -0.05), rot={"hips": (0, 0, -12), "chest": (0, 0, -20), "head": (-3, 0, 12)},
                hand_R={"w": (-0.27, 0.14, 1.18), "pole": (-0.7, 0.3, -0.4), "b": (0.0, -1.0, 0.08), "e": (0, 0, 1)},
                hand_L={"w": (0.2, -0.16, 1.3), "pole": (0.6, 0.3, -0.3)})
    thrust = pose(wind, hips_off=(0, -0.12, -0.07), rot={"hips": (0, 0, 4), "spine": (8, 0, 0), "chest": (2, 0, 12), "head": (-6, 0, -4)},
                  hand_R={"w": (-0.12, -0.64, 1.3), "pole": (-0.7, 0.2, -0.3), "b": (0.04, -1.0, 0.05), "e": (0, 0, 1)},
                  hand_L={"w": (0.17, -0.14, 1.33), "pole": (0.6, 0.3, -0.4)},
                  foot_L={"a": (0.12, -0.27, 0.09), "r": (0, 0, 8)}, wind=(0, 6, 0))
    hold = pose(thrust, hips_off=(0, -0.13, -0.075), hand_R={"w": (-0.12, -0.66, 1.31)})
    end = blend(READY, hold, 0.4)
    return [(0, READY, True), (0.08, wind, True), (0.16, thrust, False), (0.3, hold, True), (0.45, end, True)]


def cast_sweep_keys():
    """扫：压低身形，剑贴着腰际由右向左平扫（扇形剑气、横扫类法术）。"""
    wind = pose(READY, hips_off=(0, 0.03, -0.1), rot={"hips": (0, 0, -22), "spine": (6, 0, 0), "chest": (2, 0, -34), "head": (-4, 0, 22)},
                hand_R={"w": (-0.5, 0.05, 1.08), "pole": (-0.6, 0.4, -0.4), "b": (-1.0, 0.25, 0.05), "e": (0, -1, 0)},
                hand_L={"w": (0.24, -0.1, 1.05), "pole": (0.5, 0.5, -0.3)})
    mid = pose(wind, hips_off=(0, -0.06, -0.13), rot={"hips": (0, 0, -2), "chest": (4, 0, 0), "head": (-5, 0, 2)},
               hand_R={"w": (-0.15, -0.58, 1.08), "pole": (-0.6, 0.5, -0.2), "b": (0.0, -1.0, 0.04), "e": (1, 0, 0)})
    hit = pose(mid, hips_off=(0, -0.08, -0.14), rot={"hips": (0, 0, 18), "spine": (8, 0, 0), "chest": (4, 0, 34), "head": (-5, 0, -20)},
               hand_R={"w": (0.36, -0.38, 1.08), "pole": (-0.2, 0.7, -0.4), "b": (0.92, -0.35, 0.04), "e": (0.3, 1, 0)},
               hand_L={"w": (0.32, 0.12, 1.08), "pole": (0.5, 0.7, 0)},
               foot_R={"a": (-0.16, -0.12, 0.09), "r": (0, 0, -18)}, wind=(0, 7, 0))
    follow = pose(hit, rot={"chest": (4, 0, 40)}, hand_R={"w": (0.42, -0.18, 1.06), "b": (0.9, 0.3, 0.02)})
    end = blend(READY, follow, 0.4)
    return [(0, READY, True), (0.1, wind, True), (0.18, mid, False), (0.24, hit, False), (0.36, follow, True), (0.55, end, True)]


def cast_raise_keys():
    """举：右手擎剑直指天空，左手捏剑诀于胸前（布阵、召唤、增益类法术）。"""
    up = pose(READY, hips_off=(0, 0.02, -0.02), rot={"spine": (-6, 0, 0), "chest": (-4, 0, 0), "head": (-2, 0, 0)},
              hand_R={"w": (-0.12, -0.08, 1.88), "pole": (-0.8, 0.2, 0.2), "b": (0.02, -0.08, 1.0), "e": (1, 0, 0)},
              hand_L={"w": (0.12, -0.24, 1.36), "pole": (0.7, 0.3, -0.4)},
              foot_L={"a": (0.13, -0.05, 0.09)}, foot_R={"a": (-0.13, 0.06, 0.09)}, wind=(0, 0, 3))
    hold = pose(up, hips_off=(0, 0.02, -0.03), hand_R={"w": (-0.12, -0.08, 1.9)}, wind=(0, 0, 5))
    end = blend(READY, hold, 0.35)
    return [(0, READY, True), (0.14, up, False), (0.42, hold, True), (0.6, end, True)]


def hit_keys():
    """受击：被击退半步，上身后仰。"""
    recoil = pose(READY, hips_off=(0, 0.1, -0.07), rot={"hips": (-6, 0, 6), "spine": (-14, 0, 0), "chest": (-6, 0, 10), "neck": (4, 0, 0), "head": (8, 0, -6)},
                  hand_R={"w": (-0.32, 0.12, 1.02), "pole": (-0.7, 0.4, -0.4)}, hand_L={"w": (0.3, 0.1, 1.05)},
                  foot_L={"a": (0.13, 0.05, 0.09)}, wind=(0, -6, 0))
    end = blend(READY, recoil, 0.25)
    return [(0, READY, True), (0.08, recoil, False), (0.35, end, True)]


def die_keys():
    """倒地：踉跄后单膝跪下，以剑拄地伏身。"""
    stag = pose(READY, hips_off=(0, 0.12, -0.08), rot={"spine": (-16, 0, 0), "chest": (-6, 0, 8), "head": (10, 0, 0)},
                hand_R={"w": (-0.33, 0.12, 1.0)}, hand_L={"w": (0.32, 0.1, 1.0)}, wind=(0, -4, 0))
    kneel = pose(stag, hips_off=(0, 0.0, -0.42), rot={"hips": (0, 0, -6), "spine": (32, 0, 0), "chest": (10, 0, 0), "neck": (10, 0, 0), "head": (16, 0, 0)},
                 hand_R={"w": (-0.3, -0.42, 0.62), "pole": (-0.7, 0.3, -0.4), "b": (0.0, -0.25, -0.97), "e": (0, -1, 0)},
                 hand_L={"w": (0.2, -0.3, 0.55), "pole": (0.6, 0.4, -0.3)},
                 foot_L={"a": (0.13, -0.32, 0.09), "pole": (0, -1, 0.2)}, foot_R={"a": (-0.13, 0.32, 0.09), "r": (-60, 0, 0), "pole": (0, -1, -0.4)})
    slump = pose(kneel, hips_off=(0, -0.04, -0.5), rot={"spine": (40, 0, 0), "head": (24, 0, 0)}, hand_R={"w": (-0.3, -0.45, 0.55)})
    return [(0, READY, True), (0.18, stag, False), (0.6, kneel, False), (1.2, slump, True)]


# ---- 首领处决（青牙 v2，docs/design/boss_青牙_v2.md §7；美术管线 2026-11-17 追加，原有 12 段不变）----
# 原地动画、无根运动：位移 / 抬高（跃上狼背）由处决系统 src/game/execution.js 插值。
def execute_leap_keys():
    """威折处决·跃起（0.55）：下蹲蓄力 → 腾空，双手反握剑高举、剑尖朝下，准备插下。"""
    crouch = pose(READY, hips_off=(0, 0.04, -0.2), rot={"hips": (0, 0, -6), "spine": (16, 0, 0), "chest": (6, 0, 0), "head": (-12, 0, 0)},
                  hand_R={"w": (-0.24, 0.12, 0.82), "pole": (-0.6, 0.4, -0.4), "b": (-0.2, 0.6, -0.77), "e": (0, 0.8, 0.6)},
                  hand_L={"w": (0.22, 0.05, 0.8), "pole": (0.5, 0.5, -0.4)},
                  foot_L={"a": (0.13, -0.12, 0.09)}, foot_R={"a": (-0.13, 0.12, 0.09)}, wind=(0, 2, 0))
    air = pose(crouch, hips_off=(0, -0.06, 0.42), rot={"hips": (-4, 0, 0), "spine": (-8, 0, 0), "chest": (-6, 0, 0), "neck": (4, 0, 0), "head": (8, 0, 0)},
               hand_R={"w": (-0.04, -0.42, 2.12), "pole": (-0.8, 0.2, 0.2), "b": (0.0, -0.45, -0.89), "e": (0, -0.89, 0.45)},
               hand_L={"w": (0.06, -0.42, 2.1), "pole": (0.8, 0.2, 0.2)},
               foot_L={"a": (0.13, -0.08, 0.66), "r": (30, 0, 0), "pole": (0, -1, 0.3)}, foot_R={"a": (-0.13, 0.16, 0.6), "r": (40, 0, 0), "pole": (0, -1, 0.3)},
               wind=(0, 0, -8))
    apex = pose(air, hips_off=(0, -0.1, 0.34), rot={"spine": (6, 0, 0), "head": (14, 0, 0)},
                hand_R={"w": (-0.04, -0.46, 2.04)}, hand_L={"w": (0.06, -0.46, 2.02)},
                foot_L={"a": (0.13, -0.12, 0.52)}, foot_R={"a": (-0.13, 0.08, 0.5)}, wind=(0, 0, 6))
    return [(0, READY, True), (0.14, crouch, True), (0.32, air, False), (0.55, apex, True)], apex


def execute_stab_keys(start):
    """威折处决·插甲（0.40，剑尖插入 = 0.20）：从跃起的最高点落下，单膝跪在狼背上，双手把剑竖直插进骨甲裂缝。"""
    drop = pose(start, hips_off=(0, -0.12, 0.05), rot={"spine": (14, 0, 0), "chest": (6, 0, 0), "head": (16, 0, 0)},
                hand_R={"w": (-0.03, -0.3, 1.5)}, hand_L={"w": (0.05, -0.3, 1.48)},
                foot_L={"a": (0.13, -0.2, 0.09), "r": (0, 0, 0)}, foot_R={"a": (-0.13, 0.25, 0.2), "r": (30, 0, 0)}, wind=(0, 0, 8))
    stab = pose(drop, hips_off=(0, -0.08, -0.36), rot={"hips": (6, 0, 0), "spine": (28, 0, 0), "chest": (10, 0, 0), "neck": (6, 0, 0), "head": (10, 0, 0)},
                hand_R={"w": (-0.03, -0.4, 0.66), "pole": (-0.8, 0.3, -0.2), "b": (0.0, -0.08, -1.0), "e": (0, -1, 0.08)},
                hand_L={"w": (0.05, -0.4, 0.7), "pole": (0.8, 0.3, -0.2)},
                foot_L={"a": (0.13, -0.32, 0.09), "pole": (0, -1, 0.2)}, foot_R={"a": (-0.13, 0.3, 0.09), "r": (-60, 0, 0), "pole": (0, -1, -0.4)}, wind=(0, 0, 4))
    hold = pose(stab, hips_off=(0, -0.08, -0.4), rot={"spine": (32, 0, 0), "head": (14, 0, 0)},
                hand_R={"w": (-0.03, -0.4, 0.6)}, hand_L={"w": (0.05, -0.4, 0.64)}, wind=(0, 3, 1))
    return [(0, start, True), (0.12, drop, False), (0.2, stab, True), (0.4, hold, True)]


def execute_draw_keys():
    """终结处决·居合（1.38）：收剑于左腰（0–0.6）→ 拔斩一线（0.6–0.78，斩出 = 0.78）→ 收势残心（0.78–1.38）。"""
    sheath = pose(READY, hips_off=(0, 0.02, -0.06), rot={"hips": (0, 0, 18), "spine": (4, 0, 0), "chest": (2, 0, 22), "head": (-4, 0, -16), "hand_L": (0, 0, 0)},
                  hand_R={"w": (0.16, -0.12, 0.98), "pole": (-0.2, 0.8, -0.4), "b": (0.25, 0.96, -0.12), "e": (0, 0.1, 1)},
                  hand_L={"w": (0.24, -0.02, 0.94), "pole": (0.6, 0.6, -0.3)},
                  foot_L={"a": (0.14, -0.2, 0.09), "r": (0, 0, 10)}, foot_R={"a": (-0.14, 0.18, 0.09), "r": (0, 0, -20)}, wind=(0, 0.4, 0))
    coil = pose(sheath, hips_off=(0, 0.04, -0.15), rot={"hips": (0, 0, 24), "spine": (12, 0, 0), "chest": (4, 0, 28), "head": (-10, 0, -22)},
                hand_R={"w": (0.17, -0.1, 0.92)}, hand_L={"w": (0.25, 0.0, 0.88)},
                foot_L={"a": (0.16, -0.3, 0.09), "r": (0, 0, 12)}, foot_R={"a": (-0.16, 0.26, 0.09), "r": (0, 0, -24)})
    mid = pose(coil, hips_off=(0, -0.08, -0.16), rot={"hips": (0, 0, 2), "spine": (10, 0, 0), "chest": (3, 0, 0), "head": (-8, 0, 0)},
               hand_R={"w": (0.1, -0.6, 1.06), "pole": (-0.5, 0.6, -0.3), "b": (0.0, -1.0, 0.04), "e": (-1, 0, 0)},
               hand_L={"w": (0.26, -0.05, 0.9)}, wind=(0, 6, 0))
    hit = pose(mid, hips_off=(0, -0.14, -0.17), rot={"hips": (0, 0, -18), "spine": (10, 0, 0), "chest": (4, 0, -34), "head": (-8, 0, 16)},
               hand_R={"w": (-0.44, -0.4, 1.1), "pole": (-0.8, 0.4, -0.3), "b": (-0.92, -0.35, 0.04), "e": (-0.33, 0.9, 0)},
               hand_L={"w": (0.3, 0.02, 0.92), "pole": (0.5, 0.7, 0)},
               foot_L={"a": (0.16, -0.36, 0.09), "r": (0, 0, 8)}, foot_R={"a": (-0.16, 0.28, 0.09), "r": (0, 0, -24)}, wind=(0, 9, 0))
    follow = pose(hit, rot={"chest": (4, 0, -40)}, hand_R={"w": (-0.5, -0.22, 1.08), "b": (-0.86, 0.3, 0.02)})
    zanshin = pose(follow, hips_off=(0, -0.12, -0.13), rot={"chest": (3, 0, -32), "head": (-6, 0, 10)},
                   hand_R={"w": (-0.42, -0.2, 0.96), "b": (-0.7, 0.2, -0.55), "e": (-0.4, 0.9, 0)}, wind=(0, 1.5, 0))
    end = blend(READY, zanshin, 0.45)
    return [(0, READY, True), (0.3, sheath, True), (0.6, coil, True), (0.7, mid, False), (0.78, hit, False), (0.9, follow, True), (1.14, zanshin, True), (1.38, end, True)]


# =============================================================================================
# 烘焙动作
# =============================================================================================
def bake_action(rig, name, fn, dur, loop, warm_fn=None):
    arm = rig.arm
    n = int(round(dur * FPS))
    dt = 1.0 / FPS
    rig.state = {}
    frames = []
    if loop:
        warm = n * 3
        for f in range(-warm, n + 1):
            t = (f % n) / FPS
            _, basis = rig.solve(fn(t), dt, reset=(f == -warm))
            if f >= 0:
                frames.append(basis)
        # 次级骨骼在循环接缝处平滑过渡，保证首尾一致
        sec = [b for b in rig.order if b in rig.chain_member]
        k = min(8, n // 2)
        for j in range(1, k + 1):
            f = n - k + j
            w = (j / k) ** 2
            for b in sec:
                q0 = frames[0][b].to_quaternion()
                q1 = frames[f][b].to_quaternion()
                frames[f][b] = q1.slerp(q0, w).to_matrix().to_4x4()
    else:
        warm = FPS
        for f in range(-warm, n + 1):
            if f < 0:
                P = (warm_fn or idle)(2.0 + f / FPS)
            else:
                P = fn(f / FPS)
            _, basis = rig.solve(P, dt, reset=(f == -warm))
            if f >= 0:
                frames.append(basis)

    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    for f, basis in enumerate(frames):
        for pb in arm.pose.bones:
            b = pb.name
            M = basis[b]
            q = M.to_quaternion()
            if b in prev and prev[b].dot(q) < 0:
                q.negate()
            prev[b] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if b == "hips":
                pb.location = M.translation
                pb.keyframe_insert("location", frame=f)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = n
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.action_frame_end = n
    tr.mute = True
    arm.animation_data.action = None
    print("[hero] action %-7s %3d frames (%.2fs) %s" % (name, n, n / FPS, "loop" if loop else ""))
    return act


def bake_all(rig):
    k1, follow1 = slash1_keys()
    k2, follow2 = slash2_keys(follow1)
    k3 = slash3_keys(follow2)
    kd = dodge_keys()
    bake_action(rig, "idle", idle, 2.0, True)
    bake_action(rig, "run", run, 0.7, True)
    bake_action(rig, "guard", guard, 1.0, True)
    bake_action(rig, "slash1", lambda t: spline(k1, t), 0.45, False)
    bake_action(rig, "slash2", lambda t: spline(k2, t), 0.45, False, warm_fn=lambda t: follow1)
    bake_action(rig, "slash3", lambda t: spline(k3, t), 0.5, False, warm_fn=lambda t: follow2)
    bake_action(rig, "dodge", lambda t: spline(kd, t), 0.4, False)
    for name, keys, dur in (("cast_point", cast_point_keys(), 0.45), ("cast_sweep", cast_sweep_keys(), 0.55), ("cast_raise", cast_raise_keys(), 0.6),
                            ("hit", hit_keys(), 0.35), ("die", die_keys(), 1.2)):
        bake_action(rig, name, (lambda k: (lambda t: spline(k, t)))(keys), dur, False)
    # 首领处决（青牙 v2）：execute_stab 接 execute_leap 的最高点
    kl, apex = execute_leap_keys()
    ks = execute_stab_keys(apex)
    kx = execute_draw_keys()
    bake_action(rig, "execute_leap", lambda t: spline(kl, t), 0.55, False)
    bake_action(rig, "execute_stab", lambda t: spline(ks, t), 0.4, False, warm_fn=lambda t: apex)
    bake_action(rig, "execute_draw", lambda t: spline(kx, t), 1.38, False)


def export(obj, arm):
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = V()
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_skins=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )
    print("[hero] exported", OUT_GLB, os.path.getsize(OUT_GLB) // 1024, "KB")


def main():
    hc, tp, rib = build_mesh()
    bones = define_bones(hc, tp, rib)
    weights = compute_weights(bones)
    tris = sum(len(f) - 2 for f in mb.f)
    print("[hero] verts %d, tris %d" % (len(mb.v), tris))
    obj, arm = make_objects(bones, weights)
    rig = Rig(arm, bones)
    bake_all(rig)
    export(obj, arm)
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("[hero] done in %.1fs" % (time.time() - T0))


main()
