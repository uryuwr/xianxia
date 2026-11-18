# 墨途 · 敌人「竹林狼妖」生成脚本（Blender 4.5，后台运行）
#   blender.exe -b --factory-startup --python blender/build_wolf.py
# 产出：assets/models/wolf.glb（网格 + 骨骼 + 7 段动画）
#
# 约定（Blender 坐标）：Z 向上，狼面向 -Y，狼的左侧为 +X，单位米，原点在脚底。
# glTF 导出后为 +Y 向上、面向 +Z。肩高约 1.1 m。
# 造型：瘦长、长腿、深胸收腹；背脊、颈鬃、尾巴上是一簇簇"笔触"般的尖刺毛，从 45° 俯视也有清晰的锯齿剪影。
# 动画：正向运动学（每根骨骼绕"骨架空间"的轴旋转），尾巴用相位滞后的摆动模拟跟随。

import bpy
import math
import os
import time
from mathutils import Vector, Matrix, Quaternion, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_GLB = os.path.join(ROOT, "assets", "models", "wolf.glb")
OUT_BLEND = os.path.join(ROOT, "work", "wolf_build.blend")
FPS = 30
T0 = time.time()
V = Vector


def nrm(v):
    v = V(v)
    l = v.length
    return v / l if l > 1e-9 else V((0, 0, 1))


def lerp(a, b, t):
    return a + (b - a) * t


# ---- 材质（名称是与游戏的约定）----
MATS = [
    ("fur_ink", (0.06, 0.065, 0.07, 1)),
    ("fur_light", (0.32, 0.33, 0.34, 1)),
    ("eye_red", (0.85, 0.08, 0.04, 1)),
    ("claw", (0.88, 0.85, 0.78, 1)),
    ("aura_purple", (0.42, 0.22, 0.6, 1)),
]
MI = {m[0]: i for i, m in enumerate(MATS)}


# ---- 网格构建器 ----
class MB:
    def __init__(self):
        self.v, self.part, self.f, self.fm = [], [], [], []

    def vert(self, p, part):
        self.v.append(V(p))
        self.part.append(part)
        return len(self.v) - 1

    def face(self, idx, mat):
        self.f.append(tuple(idx))
        self.fm.append(MI[mat])


mb = MB()


def frame_from(t, ref):
    t = nrm(t)
    r = V(ref)
    u = r - t * r.dot(t)
    if u.length < 1e-6:
        r = V((1, 0, 0)) if abs(t.x) < 0.9 else V((0, 1, 0))
        u = r - t * r.dot(t)
    u.normalize()
    return u, t.cross(u)


def loft(centers, rx, ry, segs, mat, part, ref=(1, 0, 0), cap0=True, cap1=True):
    """沿中心线放样椭圆截面：rx 沿 u（贴近 ref，默认左右方向），ry 沿 v"""
    n = len(centers)
    rings = []
    for i, c in enumerate(centers):
        c = V(c)
        t = (V(centers[min(i + 1, n - 1)]) - V(centers[max(i - 1, 0)]))
        u, w = frame_from(t, ref)
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            ring.append(mb.vert(c + u * (rx[i] * math.cos(a)) + w * (ry[i] * math.sin(a)), part))
        rings.append(ring)
    for i in range(n - 1):
        A, B = rings[i], rings[i + 1]
        for j in range(segs):
            j2 = (j + 1) % segs
            mb.face((A[j], A[j2], B[j2], B[j]), mat)
    if cap0:
        c = mb.vert(centers[0], part)
        for j in range(segs):
            mb.face((c, rings[0][(j + 1) % segs], rings[0][j]), mat)
    if cap1:
        c = mb.vert(centers[-1], part)
        for j in range(segs):
            mb.face((c, rings[-1][j], rings[-1][(j + 1) % segs]), mat)


def ellipsoid(center, radii, segs, rings_n, mat, part):
    c = V(center)
    top = mb.vert(c + V((0, 0, radii[2])), part)
    bot = mb.vert(c - V((0, 0, radii[2])), part)
    rows = []
    for i in range(1, rings_n):
        ph = math.pi * i / rings_n
        row = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            row.append(mb.vert(c + V((radii[0] * math.sin(ph) * math.cos(th), radii[1] * math.sin(ph) * math.sin(th), radii[2] * math.cos(ph))), part))
        rows.append(row)
    for j in range(segs):
        j2 = (j + 1) % segs
        mb.face((top, rows[0][j], rows[0][j2]), mat)
        mb.face((bot, rows[-1][j2], rows[-1][j]), mat)
    for i in range(len(rows) - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            mb.face((rows[i][j], rows[i + 1][j], rows[i + 1][j2], rows[i][j2]), mat)


def spike(base, direction, length, radius, mat, part, flat=0.55, segs=4):
    """笔触尖刺：扁圆锥，从 base 沿 direction 伸出"""
    d = nrm(direction)
    u, w = frame_from(d, (1, 0, 0))
    ring = []
    for j in range(segs):
        a = 2 * math.pi * j / segs + math.pi / segs
        ring.append(mb.vert(V(base) + u * (radius * math.cos(a)) + w * (radius * flat * math.sin(a)), part))
    tip = mb.vert(V(base) + d * length, part)
    for j in range(segs):
        mb.face((ring[j], ring[(j + 1) % segs], tip), mat)


def catmull(pts, sub):
    out = []
    P = [V(p) for p in pts]
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for k in range(sub):
            t = k / sub
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return out


def interp(vals, n_out):
    """把关键值列表插值成 n_out 个"""
    out = []
    for k in range(n_out):
        x = k / (n_out - 1) * (len(vals) - 1)
        i = min(int(x), len(vals) - 2)
        out.append(lerp(vals[i], vals[i + 1], x - i))
    return out


# =============================================================================================
# 造型
# =============================================================================================
# 躯干：(y, z, 半宽 rx, 半高 ry)。深胸收腹，后腰最细
BODY = [
    (0.76, 1.00, 0.08, 0.09),
    (0.66, 1.02, 0.13, 0.14),
    (0.50, 1.04, 0.145, 0.16),
    (0.32, 1.05, 0.13, 0.14),
    (0.14, 1.07, 0.115, 0.12),
    (-0.04, 1.04, 0.13, 0.17),
    (-0.22, 0.99, 0.155, 0.235),
    (-0.40, 1.01, 0.16, 0.235),
    (-0.56, 1.10, 0.135, 0.17),
]
LEG_X = 0.135


def build_mesh():
    # 躯干
    pts = catmull([(0, y, z) for y, z, _, _ in BODY], 2)
    rx = interp([b[2] for b in BODY], len(pts))
    ry = interp([b[3] for b in BODY], len(pts))
    loft(pts, rx, ry, 10, "fur_ink", "body")
    # 颈
    neck = catmull([(0, -0.52, 1.12), (0, -0.66, 1.22), (0, -0.80, 1.36), (0, -0.88, 1.42)], 2)
    loft(neck, interp([0.12, 0.105, 0.09, 0.085], len(neck)), interp([0.15, 0.13, 0.11, 0.1], len(neck)), 8, "fur_ink", "neck", cap0=False)
    # 头：颅骨 + 长吻 + 下颌
    ellipsoid((0, -0.9, 1.44), (0.105, 0.12, 0.095), 10, 6, "fur_ink", "head")
    snout = [(0, -0.94, 1.43), (0, -1.04, 1.40), (0, -1.14, 1.37), (0, -1.21, 1.35)]
    loft(snout, [0.072, 0.058, 0.045, 0.032], [0.06, 0.05, 0.04, 0.028], 8, "fur_ink", "head")
    ellipsoid((0, -1.215, 1.355), (0.024, 0.02, 0.018), 6, 3, "fur_light", "head")  # 鼻头
    jaw = [(0, -0.93, 1.355), (0, -1.03, 1.335), (0, -1.12, 1.315), (0, -1.18, 1.305)]
    loft(jaw, [0.06, 0.048, 0.037, 0.026], [0.03, 0.028, 0.024, 0.018], 6, "fur_light", "jaw")
    for s in (1, -1):
        # 獠牙
        spike((0.028 * s, -1.15, 1.335), (0, -0.2, -1), 0.05, 0.009, "claw", "head", flat=1.0, segs=3)
        spike((0.022 * s, -1.12, 1.305), (0, -0.1, 1), 0.035, 0.008, "claw", "jaw", flat=1.0, segs=3)
        # 耳：高耸尖耳，略向后
        spike((0.06 * s, -0.86, 1.51), (0.25 * s, 0.35, 1), 0.2, 0.05, "fur_ink", "head", flat=0.45, segs=4)
        # 眼：朱红，细长
        ellipsoid((0.072 * s, -0.995, 1.455), (0.018, 0.034, 0.013), 6, 3, "eye_red", "head")
    # 腿：每条腿一根连续放样（关节处由权重平滑弯折），爪子嵌在腿端
    for s in (1, -1):
        x = LEG_X * s
        t = "L" if s > 0 else "R"
        fl = catmull([(x * 0.9, -0.40, 1.04), (x, -0.39, 0.82), (x * 1.04, -0.40, 0.6), (x * 1.04, -0.42, 0.36), (x * 1.04, -0.45, 0.15), (x * 1.04, -0.49, 0.07)], 2)
        loft(fl, interp([0.078, 0.064, 0.046, 0.036, 0.031, 0.034], len(fl)), interp([0.09, 0.072, 0.05, 0.038, 0.033, 0.03], len(fl)), 8, "fur_ink", "fleg_" + t)
        ellipsoid((x * 1.04, -0.52, 0.045), (0.05, 0.075, 0.042), 8, 4, "fur_ink", "fpaw_" + t)
        for k in (-1, 0, 1):
            spike((x * 1.04 + 0.025 * k, -0.585, 0.03), (0.15 * k, -1, -0.5), 0.05, 0.01, "claw", "fpaw_" + t, flat=1.0, segs=3)
        spike((x * 1.05, -0.36, 0.66), (0.1 * s, 1, 0.2), 0.14, 0.03, "fur_ink", "fleg_" + t)  # 肘后飞毛
        hl = catmull([(x * 0.85, 0.56, 1.04), (x, 0.5, 0.82), (x * 1.08, 0.43, 0.6), (x * 1.08, 0.55, 0.43), (x * 1.08, 0.66, 0.28), (x * 1.08, 0.63, 0.17), (x * 1.08, 0.59, 0.07)], 2)
        loft(hl, interp([0.095, 0.082, 0.056, 0.04, 0.032, 0.029, 0.031], len(hl)), interp([0.125, 0.1, 0.062, 0.045, 0.034, 0.03, 0.03], len(hl)), 8, "fur_ink", "hleg_" + t)
        ellipsoid((x * 1.08, 0.53, 0.042), (0.048, 0.075, 0.04), 8, 4, "fur_ink", "hpaw_" + t)
        for k in (-1, 0, 1):
            spike((x * 1.08 + 0.024 * k, 0.465, 0.03), (0.15 * k, -1, -0.5), 0.045, 0.01, "claw", "hpaw_" + t, flat=1.0, segs=3)
        spike((x * 1.12, 0.6, 0.38), (0.15 * s, 1, -0.1), 0.13, 0.03, "fur_ink", "hleg_" + t)  # 后腿飞毛
    # 尾：蓬松的笔锋
    tail = catmull([(0, 0.72, 1.01), (0, 0.95, 0.99), (0, 1.18, 0.9), (0, 1.38, 0.78), (0, 1.57, 0.66)], 2)
    loft(tail, interp([0.045, 0.085, 0.095, 0.075, 0.015], len(tail)), interp([0.05, 0.095, 0.105, 0.08, 0.015], len(tail)), 8, "fur_ink", "tail")
    # 背脊、颈鬃、胸毛、尾毛：一簇簇笔触尖刺
    for i in range(11):
        u = i / 10
        y = lerp(0.62, -0.58, u)
        z = 1.04 + 0.16 + 0.05 * math.sin(u * math.pi) + (0.08 if y < -0.35 else 0)
        L = 0.13 + 0.09 * math.sin(u * math.pi) + (0.06 if y < -0.3 else 0)
        spike((0, y, z - 0.03), (0, 0.9, 0.55), L, 0.05, "fur_ink", "body" if y > -0.5 else "neck")
    for k in range(10):
        a = math.radians(-80 + k * 160 / 9)
        b = V((math.sin(a) * 0.13, -0.62, 1.12 + math.cos(a) * 0.13))
        spike(b, (math.sin(a) * 0.6, 0.8, math.cos(a) * 0.6), 0.2, 0.05, "fur_light", "neck")
    for k in range(5):
        y = -0.2 - k * 0.08
        spike((0.04 * (k % 2 * 2 - 1), y, 0.78 + k * 0.02), (0, 0.3, -1), 0.11, 0.035, "fur_light", "body")
    for i, p in enumerate(tail[2:-1]):
        for s in (1, -1):
            spike(p + V((0.06 * s, 0, 0.03)), (0.6 * s, 1, 0.3), 0.15, 0.04, "fur_ink", "tail")
    return


# =============================================================================================
# 骨骼
# =============================================================================================
def define_bones():
    B = [
        ("root", (0, 0, 0), (0, 0.25, 0), None, False),
        ("hips", (0, 0.62, 1.03), (0, 0.15, 1.06), "root", True),
        ("spine", (0, 0.15, 1.06), (0, -0.3, 1.02), "hips", True),
        ("chest", (0, -0.3, 1.02), (0, -0.6, 1.13), "spine", True),
        ("neck", (0, -0.6, 1.13), (0, -0.86, 1.4), "chest", True),
        ("head", (0, -0.86, 1.4), (0, -1.2, 1.36), "neck", True),
        ("jaw", (0, -0.92, 1.33), (0, -1.18, 1.3), "head", True),
        ("tail1", (0, 0.7, 1.01), (0, 0.95, 0.99), "hips", True),
        ("tail2", (0, 0.95, 0.99), (0, 1.18, 0.9), "tail1", True),
        ("tail3", (0, 1.18, 0.9), (0, 1.38, 0.78), "tail2", True),
        ("tail4", (0, 1.38, 0.78), (0, 1.58, 0.65), "tail3", True),
    ]
    for s, t in ((1, "L"), (-1, "R")):
        x = LEG_X * s
        B += [
            ("fup_" + t, (x * 0.9, -0.40, 1.0), (x * 1.04, -0.40, 0.6), "chest", True),
            ("flow_" + t, (x * 1.04, -0.40, 0.6), (x * 1.04, -0.44, 0.1), "fup_" + t, True),
            ("fpaw_" + t, (x * 1.04, -0.44, 0.1), (x * 1.04, -0.58, 0.03), "flow_" + t, True),
            ("hup_" + t, (x * 0.85, 0.55, 1.0), (x * 1.08, 0.43, 0.6), "hips", True),
            ("hlow_" + t, (x * 1.08, 0.43, 0.6), (x * 1.08, 0.66, 0.28), "hup_" + t, True),
            ("hmeta_" + t, (x * 1.08, 0.66, 0.28), (x * 1.08, 0.6, 0.07), "hlow_" + t, True),
            ("hpaw_" + t, (x * 1.08, 0.6, 0.07), (x * 1.08, 0.46, 0.03), "hmeta_" + t, True),
        ]
    return [(n, V(h), V(tl), p, d) for n, h, tl, p, d in B]


PART_BONES = {
    "body": ["hips", "spine", "chest"],
    "neck": ["chest", "neck", "head"],
    "head": ["head"],
    "jaw": ["jaw"],
    "tail": ["hips", "tail1", "tail2", "tail3", "tail4"],
}
for t in ("L", "R"):
    PART_BONES["fleg_" + t] = ["chest", "fup_" + t, "flow_" + t, "fpaw_" + t]
    PART_BONES["hleg_" + t] = ["hips", "hup_" + t, "hlow_" + t, "hmeta_" + t, "hpaw_" + t]
    PART_BONES["fup_" + t] = ["chest", "fup_" + t, "flow_" + t]
    PART_BONES["flow_" + t] = ["fup_" + t, "flow_" + t, "fpaw_" + t]
    PART_BONES["fpaw_" + t] = ["fpaw_" + t]
    PART_BONES["hup_" + t] = ["hips", "hup_" + t, "hlow_" + t]
    PART_BONES["hlow_" + t] = ["hup_" + t, "hlow_" + t, "hmeta_" + t]
    PART_BONES["hmeta_" + t] = ["hlow_" + t, "hmeta_" + t, "hpaw_" + t]
    PART_BONES["hpaw_" + t] = ["hpaw_" + t]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.dot(ab), 1e-9)))
    return (p - (a + ab * t)).length


def compute_weights(bones):
    segs = {n: (h, t) for n, h, t, _, _ in bones}
    out = []
    for p, part in zip(mb.v, mb.part):
        c = PART_BONES[part]
        if len(c) == 1:
            out.append([(c[0], 1.0)])
            continue
        ws = sorted(((n, 1.0 / (seg_dist(p, *segs[n]) + 0.01) ** 4) for n in c), key=lambda x: -x[1])[:2]
        tot = sum(w for _, w in ws)
        out.append([(n, w / tot) for n, w in ws if w / tot > 0.02])
    return out


def make_objects(bones, weights):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    mats = []
    for name, col in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Roughness"].default_value = 0.8
        m.diffuse_color = col
        mats.append(m)
    me = bpy.data.meshes.new("wolf")
    me.from_pydata([tuple(v) for v in mb.v], [], mb.f)
    for m in mats:
        me.materials.append(m)
    for i, poly in enumerate(me.polygons):
        poly.material_index = mb.fm[i]
        poly.use_smooth = True
    me.validate()
    me.update()
    obj = bpy.data.objects.new("wolf", me)
    scene.collection.objects.link(obj)
    # 统一法线朝外
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    ad = bpy.data.armatures.new("wolf_rig")
    arm = bpy.data.objects.new("wolf_rig", ad)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    ebs = {}
    for n, h, t, p, d in bones:
        eb = ad.edit_bones.new(n)
        eb.head, eb.tail = h, t
        eb.roll = 0
        eb.use_deform = d
        if p:
            eb.parent = ebs[p]
        ebs[n] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    for n, _, _, _, d in bones:
        if d:
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
# 动画：每根骨骼一个"骨架空间"欧拉角（度）+ 臀部位移
#   X 轴：前后摆 / 俯仰（腿 +X 向后摆；头颈 +X 低头；尾 +X 上翘）
#   Z 轴：左右偏转（头 +Z 转向狼的左侧）  Y 轴：沿身体的滚转
# =============================================================================================
def P0():
    return {"off": V((0, 0, 0)), "rot": {}}


def R(P, bone, x=0, y=0, z=0):
    r = P["rot"].get(bone, V((0, 0, 0)))
    P["rot"][bone] = r + V((x, y, z))


def S(a, ph=0.0):
    return math.sin(a + ph)


def tail_follow(P, t, amp_y=10, amp_x=6, freq=1.0, base_x=0, lag=0.6, speed=1.0):
    """尾巴：沿链逐节相位滞后的摆动"""
    for i in range(4):
        R(P, "tail%d" % (i + 1), x=base_x * (0.6 if i else 1) + amp_x * S(2 * math.pi * freq * t * speed, -lag * i), z=amp_y * (0.5 + 0.25 * i) * S(2 * math.pi * freq * t * speed + 1.3, -lag * i))


def stand(P, crouch=0.0):
    """站姿：前腿略微后收、后腿屈膝"""
    for t in ("L", "R"):
        R(P, "hup_" + t, x=-8 - crouch * 25)
        R(P, "hlow_" + t, x=6 + crouch * 30)
        R(P, "hmeta_" + t, x=-2 - crouch * 8)
        R(P, "fup_" + t, x=-4 - crouch * 10)
        R(P, "flow_" + t, x=3 + crouch * 14)
    P["off"] += V((0, 0, -0.12 * crouch))


def idle(t):
    P = P0()
    a = 2 * math.pi * t / 2.0
    stand(P, 0.08 + 0.03 * S(a))
    R(P, "spine", x=1.5 * S(a))
    R(P, "chest", x=-1.5 * S(a))
    R(P, "neck", x=8 + 3 * S(a, 0.6))  # 低头压着身子，伺机而动
    R(P, "head", x=-6 + 2 * S(a, 1.0), z=5 * S(a * 0.5))
    R(P, "jaw", x=-4 - 3 * max(0, S(a * 2)))
    tail_follow(P, t, amp_y=12, amp_x=4, freq=0.5, base_x=-6)
    return P


def run(t, dur=0.6):
    """奔跑：旋转式疾驰，前后腿成对交错，脊柱伸缩"""
    P = P0()
    a = 2 * math.pi * t / dur
    for t_, ph in (("L", 0.0), ("R", 0.45)):
        # 前腿：+X 后摆（蹬地），-X 前伸；回收时小臂上折
        R(P, "fup_" + t_, x=-6 + 42 * S(a, ph))
        R(P, "flow_" + t_, x=10 + 45 * max(0, S(a, ph - 1.4)))
        R(P, "fpaw_" + t_, x=25 * max(0, S(a, ph - 1.2)))
        # 后腿：与前腿反相
        R(P, "hup_" + t_, x=-14 + 40 * S(a, ph + math.pi))
        R(P, "hlow_" + t_, x=12 + 30 * max(0, S(a, ph + math.pi - 1.3)))
        R(P, "hmeta_" + t_, x=-6 - 18 * max(0, S(a, ph + math.pi - 1.0)))
    # 脊柱伸缩与身体起伏
    R(P, "hips", x=-6 * S(a, 0.3))
    R(P, "spine", x=7 * S(a, 0.8))
    R(P, "chest", x=-5 * S(a, 1.2))
    R(P, "neck", x=-6 + 6 * S(a, 1.8))
    R(P, "head", x=8 - 5 * S(a, 2.1))
    R(P, "jaw", x=-10)
    P["off"] += V((0, 0, 0.06 * S(2 * a, 0.4) - 0.03))
    tail_follow(P, t, amp_y=6, amp_x=10, freq=1.0 / dur, base_x=22, lag=0.7)
    return P


def keys_spline(keys, t):
    """关键姿势（时间, 姿势）之间平滑插值"""
    for i in range(len(keys) - 1):
        t0, A = keys[i]
        t1, B = keys[i + 1]
        if t <= t1 or i == len(keys) - 2:
            u = max(0.0, min(1.0, (t - t0) / max(1e-6, t1 - t0)))
            u = u * u * (3 - 2 * u)
            out = P0()
            out["off"] = A["off"].lerp(B["off"], u)
            for b in set(A["rot"]) | set(B["rot"]):
                out["rot"][b] = A["rot"].get(b, V((0, 0, 0))).lerp(B["rot"].get(b, V((0, 0, 0))), u)
            return out
    return keys[-1][1]


def pose(**kw):
    P = P0()
    stand(P, kw.pop("crouch", 0.1))
    off = kw.pop("off", None)
    if off:
        P["off"] += V(off)
    for b, r in kw.items():
        R(P, b, *r)
    return P


def with_tail(fn, amp=8, base_x=0, freq=1.2):
    def g(t):
        P = fn(t)
        tail_follow(P, t, amp_y=amp, amp_x=6, freq=freq, base_x=base_x)
        return P
    return g


BITE = [
    (0.00, pose(crouch=0.1, neck=(8, 0, 0), head=(-6, 0, 0))),
    (0.22, pose(crouch=0.45, off=(0, 0.12, -0.05), spine=(-6, 0, 0), neck=(-10, 0, 0), head=(-12, 0, 0), jaw=(-8, 0, 0), fup_L=(10, 0, 0), fup_R=(10, 0, 0))),  # 蓄势：压低后坐
    (0.32, pose(crouch=0.0, off=(0, -0.28, 0.1), spine=(8, 0, 0), chest=(-8, 0, 0), neck=(-22, 0, 0), head=(4, 0, 0), jaw=(-38, 0, 0),
                fup_L=(-55, 0, 0), fup_R=(-48, 0, 0), flow_L=(-10, 0, 0), flow_R=(-6, 0, 0), hup_L=(30, 0, 0), hup_R=(34, 0, 0), hlow_L=(-10, 0, 0), hlow_R=(-10, 0, 0))),  # 扑出、张嘴
    (0.38, pose(crouch=0.15, off=(0, -0.3, 0.02), neck=(-6, 0, 0), head=(14, 0, 0), jaw=(2, 0, 0), fup_L=(-25, 0, 0), fup_R=(-20, 0, 0))),  # 咬合
    (0.60, pose(crouch=0.1, neck=(8, 0, 0), head=(-6, 0, 0))),
]
CLAW = [
    (0.00, pose(crouch=0.1, neck=(8, 0, 0))),
    (0.18, pose(crouch=0.2, off=(0, 0.06, 0.08), hips=(-6, 0, 0), chest=(-8, -10, 0), neck=(-6, 0, 10), head=(-4, 0, 12), jaw=(-20, 0, 0),
                fup_L=(-70, 0, 28), flow_L=(40, 0, 0), fpaw_L=(-20, 0, 0))),  # 抬左前爪
    (0.28, pose(crouch=0.25, off=(0, -0.12, -0.02), hips=(4, 0, 0), chest=(10, 12, 0), neck=(4, 0, -12), head=(6, 0, -16), jaw=(-26, 0, 0),
                fup_L=(-20, 0, -40), flow_L=(-5, 0, -10), fpaw_L=(15, 0, 0))),  # 横扫过去
    (0.50, pose(crouch=0.1, neck=(8, 0, 0))),
]
HIT = [
    (0.00, pose(crouch=0.1, neck=(8, 0, 0))),
    (0.06, pose(crouch=0.3, off=(0, 0.14, 0.02), hips=(0, 0, 0), spine=(-6, 4, 0), chest=(-10, 6, 0), neck=(-18, 0, 8), head=(-14, 0, 10), jaw=(-18, 0, 0))),
    (0.35, pose(crouch=0.1, neck=(8, 0, 0))),
]
DIE = [
    (0.00, pose(crouch=0.1)),
    (0.12, pose(crouch=0.3, off=(0, 0.1, 0.05), spine=(-8, 0, 0), neck=(-25, 0, 0), head=(-20, 0, 0), jaw=(-30, 0, 0))),
    (0.55, pose(crouch=0.5, off=(0.25, 0.15, -0.55), hips=(0, -78, 0), spine=(4, 0, 0), neck=(10, 0, 10), head=(18, 0, 6), jaw=(-14, 0, 0),
                fup_L=(-20, 0, 0), fup_R=(-5, 0, 0), hup_L=(10, 0, 0), hup_R=(-5, 0, 0), tail1=(-10, 0, 0))),
    (1.00, pose(crouch=0.5, off=(0.3, 0.15, -0.6), hips=(0, -84, 0), spine=(4, 0, 0), neck=(14, 0, 12), head=(22, 0, 8), jaw=(-10, 0, 0),
                fup_L=(-25, 0, 0), fup_R=(-8, 0, 0), flow_L=(20, 0, 0), hup_L=(14, 0, 0), hup_R=(-8, 0, 0), tail1=(-12, 0, 0))),
]
HOWL = [
    (0.00, pose(crouch=0.1, neck=(8, 0, 0))),
    (0.25, pose(crouch=0.05, off=(0, 0.1, 0.0), hips=(-12, 0, 0), spine=(-8, 0, 0), chest=(-10, 0, 0), neck=(-40, 0, 0), head=(-30, 0, 0), jaw=(-30, 0, 0),
                hup_L=(-30, 0, 0), hup_R=(-30, 0, 0), hlow_L=(40, 0, 0), hlow_R=(40, 0, 0), tail1=(-20, 0, 0))),
    (0.75, pose(crouch=0.05, off=(0, 0.1, 0.02), hips=(-14, 0, 0), spine=(-8, 0, 0), chest=(-12, 0, 0), neck=(-46, 0, 4), head=(-34, 0, -4), jaw=(-36, 0, 0),
                hup_L=(-32, 0, 0), hup_R=(-32, 0, 0), hlow_L=(42, 0, 0), hlow_R=(42, 0, 0), tail1=(-22, 0, 0))),
    (1.00, pose(crouch=0.1, neck=(8, 0, 0))),
]


# =============================================================================================
# 烘焙与导出
# =============================================================================================
class Baker:
    def __init__(self, arm, bones):
        self.arm = arm
        self.rest3 = {n: arm.data.bones[n].matrix_local.to_3x3() for n, *_ in bones}

    def basis(self, P):
        out = {}
        for n, r3 in self.rest3.items():
            e = P["rot"].get(n)
            if e is None or e.length < 1e-6:
                q = Quaternion()
            else:
                Rd = Euler((math.radians(e.x), math.radians(e.y), math.radians(e.z)), "YXZ").to_matrix()
                q = (r3.inverted() @ Rd @ r3).to_quaternion()
            loc = V((0, 0, 0))
            if n == "hips":
                loc = r3.inverted() @ P["off"]
            out[n] = (q, loc)
        return out


def bake_action(bk, name, fn, dur, loop):
    arm = bk.arm
    n = int(round(dur * FPS))
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    for f in range(n + 1):
        t = (f % n) / FPS if loop else f / FPS
        B = bk.basis(fn(t))
        for pb in arm.pose.bones:
            q, loc = B[pb.name]
            if pb.name in prev and prev[pb.name].dot(q) < 0:
                q.negate()
            prev[pb.name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name == "hips":
                pb.location = loc
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
    print("[wolf] action %-12s %3d frames (%.2fs)%s" % (name, n, n / FPS, " loop" if loop else ""))


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
        filepath=OUT_GLB, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_skins=True,
        export_morph=False, export_cameras=False, export_lights=False, export_materials="EXPORT",
    )
    print("[wolf] exported", OUT_GLB, os.path.getsize(OUT_GLB) // 1024, "KB")


def main():
    build_mesh()
    bones = define_bones()
    weights = compute_weights(bones)
    print("[wolf] verts %d, tris %d" % (len(mb.v), sum(len(f) - 2 for f in mb.f)))
    obj, arm = make_objects(bones, weights)
    bk = Baker(arm, bones)
    bake_action(bk, "idle", idle, 2.0, True)
    bake_action(bk, "run", run, 0.6, True)
    bake_action(bk, "attack_bite", with_tail(lambda t: keys_spline(BITE, t), 6, 10), 0.6, False)
    bake_action(bk, "attack_claw", with_tail(lambda t: keys_spline(CLAW, t), 8, 4), 0.5, False)
    bake_action(bk, "hit", with_tail(lambda t: keys_spline(HIT, t), 10, -4), 0.35, False)
    bake_action(bk, "die", lambda t: keys_spline(DIE, t), 1.0, False)
    bake_action(bk, "howl", with_tail(lambda t: keys_spline(HOWL, t), 5, -12, 0.8), 1.0, False)
    export(obj, arm)
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("[wolf] done in %.1fs" % (time.time() - T0))


main()
