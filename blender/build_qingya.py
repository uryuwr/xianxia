# 墨途 · 首领「狼王青牙」v2 生成脚本（Blender 4.5，后台运行；基于 lib_creature.py）
#   blender.exe -b --factory-startup --python blender/build_qingya.py
#   blender.exe -b --factory-startup --python blender/render_creature.py -- qingya --scale=2.6 --hide=qingya_crack,qingya_eyefire --zoom=1.7
#   blender.exe -b --factory-startup --python blender/render_creature.py -- qingya --scale=2.6 --hide=qingya_armor --tag=_p2 --poses=0
# 产出：assets/models/qingya.glb（4 个蒙皮网格共用一副骨骼 + 27 段动画），另存 work/qingya_build.blend
#
# 设计依据：docs/design/boss_青牙_v2.md §9.1–9.2。按"狼单位"建模，游戏里 scale 2.6（描边随缩放变粗 = 大物粗笔）。
# 造型（主管 2026-11-17 第一版意见后重做）：肩宽胸厚、颈粗、前肢粗壮、重心压低、头大前探；腿短而粗，不是放大的竹林狼。
# 约定同 lib_creature：Blender 中 Z 向上、面向 -Y、左侧 +X、原点脚底；导出后 +Y 向上、面向 +Z。骨骼名与 wolf.glb 一致。
#
# 网格（glTF 节点名 = 对象名，游戏里 src/fx/boss_look.js 按名字切换显隐）：
#   qingya          本体：墨青身（青灰淡腹）、青白长鬃、青玉獠牙、灵光青眼、头骨冠、双肩骨甲、骨白爪（两个阶段都在）
#   qingya_armor    一阶段：背上 4 块有厚度的弧形骨板（边缘参差、中脊隆起）+ 脊刺点缀（转阶段崩裂后隐藏）
#   qingya_crack    二阶段：同样 4 块骨板从脊线裂成左右两半、断口与中缝透出青光（弱点位置，平时隐藏）
#   qingya_eyefire  二阶段：眼中青焰的实体火芯（自发光）；外面那一缕半透明火焰面片由 boss_look.js 运行时加（不写深度、不投影）
# 材质名（与 enemy.js PALETTE 的契约，互不为前缀）：fur_qing（青牙专用墨青毛，带一点自发光托底，暗面不压成黑团）fur_belly fur_light fang_jade bone_armor eye_jade crack_glow eye_fire
#   爪子并进 bone_armor（少一个图元 = 少两次绘制）
import sys
import os
import math
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *  # noqa: E402,F401

MATS = [
    ("fur_qing", (0.2, 0.25, 0.23, 1)),
    ("fur_belly", (0.42, 0.48, 0.46, 1)),
    ("fur_light", (0.66, 0.78, 0.72, 1)),
    ("fang_jade", (0.36, 0.9, 0.68, 1)),
    ("bone_armor", (0.8, 0.8, 0.74, 1)),
    ("eye_jade", (0.55, 1.0, 0.8, 1)),
    ("crack_glow", (0.4, 1.0, 0.78, 1)),
    ("eye_fire", (0.75, 1.0, 0.9, 1)),
]
mb = MB(MATS)
rnd = random.Random(7)

# 躯干 (y, z, 半宽, 半高)：胸厚肩宽、腰收、臀窄；整体重心比竹林狼低约 0.15
BODY = [
    (0.74, 0.86, 0.11, 0.12),
    (0.62, 0.89, 0.19, 0.2),
    (0.46, 0.91, 0.215, 0.22),
    (0.28, 0.91, 0.2, 0.21),
    (0.10, 0.91, 0.205, 0.23),
    (-0.08, 0.9, 0.24, 0.29),
    (-0.26, 0.89, 0.275, 0.34),
    (-0.44, 0.93, 0.28, 0.34),
    (-0.60, 1.01, 0.23, 0.27),
]
LEG_X = 0.2
HEAD_C = V((0, -1.04, 1.2))


def body_at(y):
    """躯干在 y 处的 (中心 z, 半宽, 半高)"""
    if y >= BODY[0][0]:
        return BODY[0][1], BODY[0][2], BODY[0][3]
    for i in range(len(BODY) - 1):
        y0, z0, a0, b0 = BODY[i]
        y1, z1, a1, b1 = BODY[i + 1]
        if y1 <= y <= y0:
            u = (y0 - y) / (y0 - y1)
            return lerp(z0, z1, u), lerp(a0, a1, u), lerp(b0, b1, u)
    return BODY[-1][1], BODY[-1][2], BODY[-1][3]


def loft(*a, **k):
    return mb.loft(*a, **k)


def belly_mat(segs):
    """躯干放样的材质函数：下方一圈是淡腹"""
    def f(i, j):
        a = 2 * math.pi * (j + 0.5) / segs
        return "fur_belly" if math.sin(a) < -0.55 else "fur_qing"
    return f


def shell(yc, ylen, th0, th1, d_out, thick, mat, part, jag=0.025, keel=0.0, rim_mat=None, rim_side=None, nth=7, nu=3):
    """贴着躯干的有厚度骨板：θ 从 th0 到 th1（0 = 脊线，正 = 左侧 +X），沿 y 长 ylen。
    外层 + 内层 + 边沿一圈；边沿顶点随机参差（jag）；keel 让脊线一带隆起成中脊。
    rim_side = "th0" / "th1" 时，那一侧的断面用 rim_mat（二阶段裂开的骨板：断口透青光）。"""
    def surf(th, u, d):
        y = yc + u * ylen * 0.5 * (1 - 0.18 * (th / max(abs(th0), abs(th1), 1e-3)) ** 2)
        zc, ax, az = body_at(y)
        k = keel * max(0.0, 1 - abs(th) / 0.5)
        return V((math.sin(th) * (ax + d + k), y, zc + math.cos(th) * (az + d + k)))

    outer, inner = [], []
    for i in range(nth):
        th = lerp(th0, th1, i / (nth - 1))
        ro, ri = [], []
        for j in range(nu):
            u = -1 + 2 * j / (nu - 1)
            edge = i in (0, nth - 1) or j in (0, nu - 1)
            dj = V((0, rnd.uniform(-jag, jag), 0)) if edge else V()
            dth = rnd.uniform(-0.12, 0.12) if edge and i in (0, nth - 1) else 0.0
            po = surf(th + dth, u, d_out) + dj
            pi = surf(th + dth, u, d_out - thick) + dj
            ro.append(mb.vert(po, part))
            ri.append(mb.vert(pi, part))
        outer.append(ro)
        inner.append(ri)
    for i in range(nth - 1):
        for j in range(nu - 1):
            mb.face((outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1]), mat)
            mb.face((inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j], inner[i][j]), mat)
    # 边沿：沿外圈走一周
    loop = [(i, 0) for i in range(nth)] + [(nth - 1, j) for j in range(1, nu)] + [(i, nu - 1) for i in range(nth - 2, -1, -1)] + [(0, j) for j in range(nu - 2, 0, -1)]
    for k in range(len(loop)):
        a, b = loop[k], loop[(k + 1) % len(loop)]
        m = mat
        if rim_mat and ((rim_side == "th0" and a[0] == 0 and b[0] == 0) or (rim_side == "th1" and a[0] == nth - 1 and b[0] == nth - 1)):
            m = rim_mat
        mb.face((outer[a[0]][a[1]], inner[a[0]][a[1]], inner[b[0]][b[1]], outer[b[0]][b[1]]), m)


PLATES = [(0.47, 0.3, 0.17), (0.2, 0.32, 0.2), (-0.1, 0.34, 0.24), (-0.4, 0.34, 0.26)]  # (中心 y, 长, 脊刺长)


def build_mesh():
    # ---------------- 本体 ----------------
    mb.cur = None
    pts = catmull([(0, y, z) for y, z, _, _ in BODY], 2)
    loft(pts, interp([b[2] for b in BODY], len(pts)), interp([b[3] for b in BODY], len(pts)), 9, belly_mat(9), "body")
    # 颈：粗、前探、低
    neck = catmull([(0, -0.56, 1.0), (0, -0.72, 1.08), (0, -0.88, 1.15), (0, -0.98, 1.19)], 2)
    loft(neck, interp([0.21, 0.19, 0.16, 0.14], len(neck)), interp([0.25, 0.22, 0.18, 0.15], len(neck)), 8, belly_mat(8), "neck", cap0=False)
    # 头：大、宽颅、厚吻
    mb.ellipsoid(HEAD_C, (0.17, 0.18, 0.14), 8, 4, "fur_qing", "head")
    snout = [(0, -1.1, 1.2), (0, -1.24, 1.17), (0, -1.37, 1.13), (0, -1.47, 1.1)]
    loft(snout, [0.12, 0.1, 0.078, 0.052], [0.095, 0.08, 0.064, 0.044], 7, "fur_qing", "head")
    jaw = [(0, -1.08, 1.08), (0, -1.21, 1.06), (0, -1.33, 1.04), (0, -1.43, 1.03)]
    loft(jaw, [0.1, 0.08, 0.06, 0.04], [0.045, 0.04, 0.034, 0.025], 6, "fur_belly", "jaw")
    # 头骨冠：额顶骨片（吻背到后脑）+ 两根后掠骨角
    loft([(0, -1.34, 1.18), (0, -1.2, 1.25), (0, -1.06, 1.33), (0, -0.94, 1.32)], [0.035, 0.07, 0.11, 0.08], [0.018, 0.028, 0.045, 0.035], 6, "bone_armor", "head")
    for s in (1, -1):
        mb.spike((0.09 * s, -0.95, 1.31), (0.4 * s, 1.0, 0.45), 0.34, 0.045, "bone_armor", "head", flat=0.7, segs=4)
        mb.spike((0.12 * s, -0.98, 1.26), (0.5 * s, 0.4, 1), 0.22, 0.06, "fur_qing", "head", flat=0.45, segs=4)  # 耳
        # 青玉獠牙：下颌一对上翻长牙（远超唇线，45° 俯视也看得见）+ 上颌一对下垂犬齿
        mb.spike((0.07 * s, -1.36, 1.05), (0.35 * s, -0.55, 1), 0.34, 0.04, "fang_jade", "jaw", flat=1.0, segs=4)
        mb.spike((0.055 * s, -1.4, 1.1), (0.1 * s, -0.25, -1), 0.2, 0.03, "fang_jade", "head", flat=1.0, segs=4)
        mb.ellipsoid((0.11 * s, -1.15, 1.24), (0.028, 0.055, 0.022), 6, 3, "eye_jade", "head")
    # 腿：短、粗，前肢尤其壮
    for s in (1, -1):
        x = LEG_X * s
        t = "L" if s > 0 else "R"
        fl = catmull([(x * 0.85, -0.42, 0.9), (x, -0.42, 0.7), (x * 1.04, -0.43, 0.48), (x * 1.04, -0.45, 0.28), (x * 1.04, -0.48, 0.12), (x * 1.04, -0.5, 0.06)], 2)
        loft(fl, interp([0.16, 0.135, 0.095, 0.072, 0.064, 0.07], len(fl)), interp([0.18, 0.15, 0.1, 0.075, 0.066, 0.06], len(fl)), 6, "fur_qing", "fleg_" + t)
        mb.ellipsoid((x * 1.04, -0.55, 0.055), (0.095, 0.12, 0.06), 6, 3, "fur_qing", "fpaw_" + t)
        for k in (-1, 0, 1):
            mb.spike((x * 1.04 + 0.04 * k, -0.65, 0.04), (0.15 * k, -1, -0.5), 0.09, 0.018, "bone_armor", "fpaw_" + t, flat=1.0, segs=3)
        mb.spike((x * 1.08, -0.36, 0.52), (0.1 * s, 1, 0.1), 0.2, 0.045, "fur_qing", "fleg_" + t)  # 肘后飞毛
        hl = catmull([(x * 0.8, 0.52, 0.9), (x, 0.44, 0.68), (x * 1.06, 0.38, 0.5), (x * 1.06, 0.5, 0.34), (x * 1.06, 0.6, 0.22), (x * 1.06, 0.58, 0.13), (x * 1.06, 0.55, 0.06)], 2)
        loft(hl, interp([0.17, 0.14, 0.095, 0.07, 0.056, 0.05, 0.055], len(hl)), interp([0.2, 0.16, 0.1, 0.074, 0.058, 0.05, 0.05], len(hl)), 6, "fur_qing", "hleg_" + t)
        mb.ellipsoid((x * 1.06, 0.5, 0.05), (0.085, 0.11, 0.055), 6, 3, "fur_qing", "hpaw_" + t)
        for k in (-1, 0, 1):
            mb.spike((x * 1.06 + 0.035 * k, 0.4, 0.035), (0.15 * k, -1, -0.5), 0.08, 0.016, "bone_armor", "hpaw_" + t, flat=1.0, segs=3)
        mb.spike((x * 1.1, 0.56, 0.36), (0.15 * s, 1, -0.1), 0.18, 0.045, "fur_qing", "hleg_" + t)
        # 肩甲：包住前肢根部外侧的一块厚骨板（两个阶段都在）
        shell(-0.4, 0.36, 0.55 * s, 1.45 * s, 0.07, 0.05, "bone_armor", "body", jag=0.03, keel=0.0, nth=4, nu=3)
    # 尾：粗大的笔锋
    tail = catmull([(0, 0.7, 0.9), (0, 0.94, 0.88), (0, 1.18, 0.78), (0, 1.38, 0.64), (0, 1.56, 0.5)], 2)
    loft(tail, interp([0.07, 0.12, 0.13, 0.1, 0.02], len(tail)), interp([0.075, 0.13, 0.14, 0.105, 0.02], len(tail)), 7, "fur_qing", "tail")
    for i, p in enumerate(tail[2:-1:2]):
        for s in (1, -1):
            mb.spike(p + V((0.08 * s, 0, 0.03)), (0.6 * s, 1, 0.3), 0.2, 0.05, "fur_light" if i == 2 else "fur_qing", "tail")
    # 青白长鬃：颈后与颈侧两圈大笔触，向后上方扬起（45° 俯视里是头后一大团浅色，压在墨身上）
    for k in range(15):
        a = math.radians(-110 + k * 220 / 14)
        b = V((math.sin(a) * 0.22, -0.66, 1.0 + math.cos(a) * 0.25))
        mb.spike(b, (math.sin(a) * 0.8, 0.8, math.cos(a) * 0.55 + 0.15), 0.4 if abs(k - 7) < 5 else 0.3, 0.085, "fur_light", "neck")
    for k in range(9):
        a = math.radians(-85 + k * 21)
        b = V((math.sin(a) * 0.17, -0.86, 1.12 + math.cos(a) * 0.17))
        mb.spike(b, (math.sin(a) * 0.6, 0.9, 0.45), 0.32, 0.07, "fur_light", "neck")
    # 胸前垂毛（淡腹色）
    for k in range(3):
        y = -0.3 - k * 0.12
        mb.spike((0.06 * (k % 2 * 2 - 1), y, 0.58 + k * 0.03), (0, 0.3, -1), 0.16, 0.05, "fur_belly", "body")
    # 两肋青灰飞毛：打破墨身大色块
    for i in range(3):
        y = lerp(0.42, -0.08, i / 2)
        zc, ax, az = body_at(y)
        for s in (1, -1):
            mb.spike((s * ax * 0.9, y, zc - az * 0.1), (s * 0.7, 0.8, -0.35), 0.18, 0.05, "fur_light", "body")

    # ---------------- 一阶段：背部狼王骨甲 ----------------
    mb.cur = "armor"
    for yc, ylen, h in PLATES:
        shell(yc, ylen, -1.2, 1.2, 0.075, 0.055, "bone_armor", "body", keel=0.03)
        zc, ax, az = body_at(yc)
        mb.spike(V((0, yc + 0.06, zc + az + 0.1)), (0, 0.9, 1), h, 0.06, "bone_armor", "body", flat=0.5, segs=4)

    # ---------------- 二阶段：骨板从脊线裂开，断口与中缝透出青光 ----------------
    mb.cur = "crack"
    for yc, ylen, h in PLATES:
        for s in (1, -1):
            # 两半各自往外掀开一点；靠脊线的断面用 crack_glow
            shell(yc + rnd.uniform(-0.02, 0.02), ylen * 0.92, 0.22 * s, 1.2 * s, 0.09, 0.055, "bone_armor", "body", jag=0.035, keel=0.0,
                  rim_mat="crack_glow", rim_side="th0", nth=4, nu=3)
    cr = []
    n = 9
    for i in range(n):
        y = lerp(0.62, -0.57, i / (n - 1))
        zc, ax, az = body_at(y)
        cr.append((0.04 * (1 if i % 2 else -1) * (0.4 + 0.6 * math.sin(math.pi * i / (n - 1))), y, zc + az + 0.03))
    wid = [0.04, 0.09, 0.11, 0.09, 0.12, 0.1, 0.11, 0.08, 0.035]
    loft(cr, wid, [0.02] * n, 4, "crack_glow", "body", ref=(1, 0, 0))

    # ---------------- 二阶段：眼中青焰（实体火芯）----------------
    mb.cur = "eyefire"
    for s in (1, -1):
        e = V((0.12 * s, -1.15, 1.25))
        for d, L, r in (((0.3 * s, 1.0, 0.6), 0.3, 0.04), ((0.6 * s, 0.9, 0.25), 0.2, 0.03)):
            mb.spike(e, d, L, r, "eye_fire", "head", flat=0.55, segs=4)
    mb.cur = None


# ---------------- 骨骼（与 wolf.glb 同名同层级，位置按新体型）----------------
BONES = [
    ("root", (0, 0, 0), (0, 0.25, 0), None, False),
    ("hips", (0, 0.6, 0.9), (0, 0.12, 0.92), "root", True),
    ("spine", (0, 0.12, 0.92), (0, -0.3, 0.9), "hips", True),
    ("chest", (0, -0.3, 0.9), (0, -0.62, 1.0), "spine", True),
    ("neck", (0, -0.62, 1.0), (0, -0.96, 1.18), "chest", True),
    ("head", (0, -0.96, 1.18), (0, -1.46, 1.12), "neck", True),
    ("jaw", (0, -1.08, 1.08), (0, -1.43, 1.03), "head", True),
    ("tail1", (0, 0.7, 0.9), (0, 0.94, 0.88), "hips", True),
    ("tail2", (0, 0.94, 0.88), (0, 1.18, 0.78), "tail1", True),
    ("tail3", (0, 1.18, 0.78), (0, 1.38, 0.64), "tail2", True),
    ("tail4", (0, 1.38, 0.64), (0, 1.57, 0.49), "tail3", True),
]
for s, t in ((1, "L"), (-1, "R")):
    x = LEG_X * s
    BONES += [
        ("fup_" + t, (x * 0.85, -0.42, 0.88), (x * 1.04, -0.43, 0.48), "chest", True),
        ("flow_" + t, (x * 1.04, -0.43, 0.48), (x * 1.04, -0.48, 0.1), "fup_" + t, True),
        ("fpaw_" + t, (x * 1.04, -0.48, 0.1), (x * 1.04, -0.66, 0.03), "flow_" + t, True),
        ("hup_" + t, (x * 0.8, 0.52, 0.88), (x * 1.06, 0.38, 0.5), "hips", True),
        ("hlow_" + t, (x * 1.06, 0.38, 0.5), (x * 1.06, 0.6, 0.22), "hup_" + t, True),
        ("hmeta_" + t, (x * 1.06, 0.6, 0.22), (x * 1.06, 0.56, 0.07), "hlow_" + t, True),
        ("hpaw_" + t, (x * 1.06, 0.56, 0.07), (x * 1.06, 0.4, 0.03), "hmeta_" + t, True),
    ]

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
    PART_BONES["fpaw_" + t] = ["fpaw_" + t]
    PART_BONES["hpaw_" + t] = ["hpaw_" + t]


# =============================================================================================
# 动画：骨架空间欧拉角（度）+ hips 位移。约定同 build_wolf.py：
#   X：腿 +X 向后摆；头颈 +X 低头；尾 +X 上翘；脊柱 −X 拱背（hips/spine/chest 的 −X 让前身抬起）
#   Z：头 +Z 转向狼的左侧（+X 侧）；Y：沿身体滚转（倒向一侧）
# =============================================================================================
def stand(P, crouch=0.0):
    for t in ("L", "R"):
        R(P, "hup_" + t, x=-8 - crouch * 25)
        R(P, "hlow_" + t, x=6 + crouch * 30)
        R(P, "hmeta_" + t, x=-2 - crouch * 8)
        R(P, "fup_" + t, x=-4 - crouch * 10)
        R(P, "flow_" + t, x=3 + crouch * 14)
    P["off"] += V((0, 0, -0.12 * crouch))


def pose(**kw):
    P = P0()
    stand(P, kw.pop("crouch", 0.1))
    off = kw.pop("off", None)
    if off:
        P["off"] += V(off)
    for b, r in kw.items():
        R(P, b, *r)
    return P


def sym(**kw):
    """左右对称的腿：fup=(x,y,z) 同时写 _L / _R（y、z 反号）"""
    out = {}
    for b, r in kw.items():
        out[b + "_L"] = r
        out[b + "_R"] = (r[0], -r[1], -r[2])
    return out


def tail_follow(P, t, amp_y=10, amp_x=6, freq=1.0, base_x=0, lag=0.6):
    for i in range(4):
        R(P, "tail%d" % (i + 1), x=base_x * (0.6 if i else 1) + amp_x * S(2 * math.pi * freq * t, -lag * i),
          z=amp_y * (0.5 + 0.25 * i) * S(2 * math.pi * freq * t + 1.3, -lag * i))


def with_tail(keys, amp=8, base_x=0, freq=1.0):
    return keys_fn(keys, lambda t, P: tail_follow(P, t, amp_y=amp, amp_x=5, freq=freq, base_x=base_x))


def idle(t):
    P = P0()
    a = 2 * math.pi * t / 2.0
    stand(P, 0.22 + 0.03 * S(a))  # 低伏守谷：重心压低、头向前平视
    R(P, "spine", x=1.5 * S(a))
    R(P, "chest", x=-2 * S(a))
    for t_ in ("L", "R"):
        R(P, "fup_" + t_, z=(-5 if t_ == "L" else 5))  # 前肢略外撑
    R(P, "neck", x=6 + 3 * S(a, 0.6))
    R(P, "head", x=-8 + 2 * S(a, 1.0), z=6 * S(a * 0.5))
    R(P, "jaw", x=-3 - 3 * max(0, S(a * 2)))
    tail_follow(P, t, amp_y=10, amp_x=4, freq=0.5, base_x=-4)
    return P


def run(t, dur=0.6):
    P = P0()
    a = 2 * math.pi * t / dur
    for t_, ph in (("L", 0.0), ("R", 0.45)):
        R(P, "fup_" + t_, x=-6 + 40 * S(a, ph))
        R(P, "flow_" + t_, x=10 + 45 * max(0, S(a, ph - 1.4)))
        R(P, "fpaw_" + t_, x=25 * max(0, S(a, ph - 1.2)))
        R(P, "hup_" + t_, x=-14 + 38 * S(a, ph + math.pi))
        R(P, "hlow_" + t_, x=12 + 30 * max(0, S(a, ph + math.pi - 1.3)))
        R(P, "hmeta_" + t_, x=-6 - 18 * max(0, S(a, ph + math.pi - 1.0)))
    R(P, "hips", x=-6 * S(a, 0.3))
    R(P, "spine", x=6 * S(a, 0.8))
    R(P, "chest", x=-5 * S(a, 1.2))
    R(P, "neck", x=-4 + 5 * S(a, 1.8))
    R(P, "head", x=8 - 4 * S(a, 2.1))
    R(P, "jaw", x=-12)
    P["off"] += V((0, 0, 0.06 * S(2 * a, 0.4) - 0.03))
    tail_follow(P, t, amp_y=6, amp_x=10, freq=1.0 / dur, base_x=20, lag=0.7)
    return P


STAND = pose(crouch=0.22, neck=(6, 0, 0), head=(-8, 0, 0), fup_L=(0, 0, -5), fup_R=(0, 0, 5))

# 卧（狮身式）：胸腹贴地，前腿向前伸平，后腿折叠在身侧
LIE = pose(crouch=0.0, off=(0, 0.0, -0.5), hips=(4, 0, 0), spine=(2, 0, 0), chest=(-4, 0, 0), neck=(18, 0, 0), head=(-4, 0, 0), jaw=(-2, 0, 0),
           **sym(fup=(-78, 0, -4), flow=(-6, 0, 0), fpaw=(20, 0, 0), hup=(-70, 0, -12), hlow=(105, 0, 0), hmeta=(-50, 0, 0), hpaw=(30, 0, 0)),
           tail1=(-14, 0, 22), tail2=(-6, 0, 18), tail3=(0, 0, 14))
LIE_UP = pose(crouch=0.0, off=(0, 0.0, -0.44), hips=(4, 0, 0), spine=(-2, 0, 0), chest=(-10, 0, 0), neck=(-18, 0, 0), head=(-6, 0, 0), jaw=(-6, 0, 0),
              **sym(fup=(-60, 0, -4), flow=(-4, 0, 0), fpaw=(20, 0, 0), hup=(-70, 0, -12), hlow=(105, 0, 0), hmeta=(-50, 0, 0), hpaw=(30, 0, 0)),
              tail1=(-14, 0, 22), tail2=(-6, 0, 18), tail3=(0, 0, 14))


def lie(t):
    """卧在狼王石上：慢呼吸，偶尔动耳（头微转），尾尖轻扫"""
    a = 2 * math.pi * t / 3.0
    P = add_pose(LIE, mkpose(spine=(1.2 * S(a), 0, 0), chest=(-1.5 * S(a), 0, 0), neck=(1.5 * S(a, 0.8), 0, 0), head=(0, 0, 4 * S(a * 0.5, 0.4))))
    R(P, "tail3", z=6 * S(a, 0.5))
    R(P, "tail4", z=10 * S(a, 0.2))
    P["off"] += V((0, 0, 0.006 * S(a)))
    return P


def lerp_pose(A, B, u):
    return keys_spline([(0, A), (1, B)], u)


SIT = pose(crouch=0.05, off=(0, 0.12, -0.08), hips=(-26, 0, 0), spine=(-10, 0, 0), chest=(-8, 0, 0), neck=(-6, 0, 0), head=(-4, 0, 0),
           **sym(hup=(-46, 0, 0), hlow=(70, 0, 0), hmeta=(-20, 0, 0), fup=(16, 0, 0), flow=(-4, 0, 0)), tail1=(-30, 0, 0))

# 一阶段招式（与竹林狼同骨架，幅度更大、更沉）
BITE = [
    (0.00, STAND),
    (0.22, pose(crouch=0.45, off=(0, 0.14, -0.05), spine=(-6, 0, 0), neck=(-10, 0, 0), head=(-12, 0, 0), jaw=(-10, 0, 0), **sym(fup=(10, 0, 0)))),
    (0.32, pose(crouch=0.0, off=(0, -0.3, 0.1), spine=(8, 0, 0), chest=(-8, 0, 0), neck=(-22, 0, 0), head=(4, 0, 0), jaw=(-40, 0, 0),
                fup_L=(-55, 0, 0), fup_R=(-48, 0, 0), flow_L=(-10, 0, 0), flow_R=(-6, 0, 0), hup_L=(30, 0, 0), hup_R=(34, 0, 0), hlow_L=(-10, 0, 0), hlow_R=(-10, 0, 0))),
    (0.38, pose(crouch=0.15, off=(0, -0.32, 0.02), neck=(-6, 0, 0), head=(14, 0, 0), jaw=(2, 0, 0), fup_L=(-25, 0, 0), fup_R=(-20, 0, 0))),
    (0.60, STAND),
]
CLAW = [
    (0.00, STAND),
    (0.18, pose(crouch=0.2, off=(0, 0.06, 0.08), hips=(-6, 0, 0), chest=(-8, -10, 0), neck=(-6, 0, 10), head=(-4, 0, 12), jaw=(-22, 0, 0),
                fup_L=(-75, 0, 30), flow_L=(42, 0, 0), fpaw_L=(-20, 0, 0))),
    (0.28, pose(crouch=0.25, off=(0, -0.12, -0.02), hips=(4, 0, 0), chest=(10, 12, 0), neck=(4, 0, -12), head=(6, 0, -16), jaw=(-28, 0, 0),
                fup_L=(-20, 0, -42), flow_L=(-5, 0, -10), fpaw_L=(15, 0, 0))),
    (0.36, pose(crouch=0.25, off=(0, -0.13, -0.03), hips=(5, 0, 0), chest=(11, 14, 0), neck=(4, 0, -14), head=(6, 0, -18), jaw=(-14, 0, 0),
                fup_L=(-14, 0, -46), flow_L=(-4, 0, -10), fpaw_L=(15, 0, 0))),
    (0.60, STAND),
]
# 青焰双噬：拆成两段（combo: 2，anims: [bite_double_a, bite_double_b]），第二口前的停顿由数据表 comboWindup 给
BITE2_END = pose(crouch=0.3, off=(0, -0.1, -0.02), neck=(-4, 0, 6), head=(-6, 0, 8), jaw=(-16, 0, 0), **sym(fup=(-14, 0, 0)))  # a 的收势：半蹲、嘴角微张、头偏一点
BITE_A = [
    (0.00, STAND),
    (0.20, pose(crouch=0.45, off=(0, 0.12, -0.05), spine=(-6, 0, 0), neck=(-10, 0, 0), head=(-12, 0, 0), jaw=(-14, 0, 0), **sym(fup=(10, 0, 0)))),
    (0.30, pose(crouch=0.0, off=(0, -0.28, 0.1), spine=(8, 0, 0), chest=(-8, 0, 0), neck=(-22, 0, 0), head=(4, 0, 0), jaw=(-40, 0, 0),
                fup_L=(-52, 0, 0), fup_R=(-46, 0, 0), hup_L=(28, 0, 0), hup_R=(32, 0, 0))),
    (0.36, pose(crouch=0.15, off=(0, -0.3, 0.02), neck=(-6, 0, 0), head=(14, 0, 0), jaw=(2, 0, 0), fup_L=(-25, 0, 0), fup_R=(-20, 0, 0))),
    (0.55, BITE2_END),
]
BITE_B = [
    (0.00, BITE2_END),
    (0.15, pose(crouch=0.5, off=(0, 0.08, -0.06), spine=(-8, 0, 0), neck=(-12, 0, 4), head=(-14, 0, 4), jaw=(-30, 0, 0), **sym(fup=(12, 0, 0)))),
    (0.25, pose(crouch=0.0, off=(0, -0.3, 0.1), spine=(8, 0, 0), chest=(-8, 0, 0), neck=(-24, 0, 0), head=(4, 0, 0), jaw=(-44, 0, 0),
                fup_L=(-58, 0, 0), fup_R=(-50, 0, 0), hup_L=(32, 0, 0), hup_R=(36, 0, 0))),
    (0.32, pose(crouch=0.15, off=(0, -0.32, 0.02), neck=(-6, 0, 0), head=(14, 0, 0), jaw=(2, 0, 0), fup_L=(-25, 0, 0), fup_R=(-20, 0, 0))),
    (0.60, STAND),
]
# 回首咬：起手尾巴竖起抖动（预警），扭身把头甩向左后方咬下
TURN_BITE = [
    (0.00, STAND),
    (0.20, pose(crouch=0.25, off=(0, 0.02, -0.02), hips=(0, 0, 8), spine=(0, 0, -6), chest=(0, 0, 10), neck=(-6, 0, 22), head=(-6, 0, 18), jaw=(-10, 0, 0),
                tail1=(45, 0, 0), tail2=(10, 0, 0))),
    (0.40, pose(crouch=0.2, off=(0.06, 0.04, 0.0), hips=(0, -6, -18), spine=(0, 0, 20), chest=(0, 0, 32), neck=(-8, 0, 58), head=(4, 0, 42), jaw=(-2, 0, 0),
                fup_L=(-10, 0, 20), fup_R=(-20, 0, 10), hup_L=(10, 0, -16), tail1=(30, 0, -30))),
    (0.48, pose(crouch=0.2, off=(0.06, 0.04, 0.0), hips=(0, -6, -18), spine=(0, 0, 20), chest=(0, 0, 32), neck=(-4, 0, 56), head=(10, 0, 40), jaw=(4, 0, 0),
                fup_L=(-10, 0, 20), fup_R=(-20, 0, 10), hup_L=(10, 0, -16), tail1=(20, 0, -30))),
    (0.70, STAND),
]


def turn_bite_fn(t):
    P = keys_spline(TURN_BITE, t)
    # 尾巴竖起抖动：前 0.4 秒快速颤动（12 Hz），之后跟随
    k = max(0.0, 1 - t / 0.42)
    for i in range(4):
        R(P, "tail%d" % (i + 1), x=k * (30 if i == 0 else 8), z=k * 10 * S(2 * math.pi * 12 * t, -0.5 * i))
    return P


# 召狼长嚎：0→0.3 坐起仰头吸气（预警 1.6 秒时会被放慢约 5 倍 = 慢慢坐起），0.3 张口长嚎，保持到 0.85
HOWL_UP = add_pose(SIT, mkpose(off=(0, 0.02, 0.02), chest=(-4, 0, 0), neck=(-46, 0, 0), head=(-30, 0, 0), jaw=(-34, 0, 0)))
HOWL = [
    (0.00, STAND),
    (0.30, add_pose(SIT, mkpose(neck=(-38, 0, 0), head=(-24, 0, 0), jaw=(-12, 0, 0)))),
    (0.40, HOWL_UP),
    (0.85, add_pose(HOWL_UP, mkpose(neck=(-4, 0, 4), head=(-2, 0, -4), jaw=(-4, 0, 0)))),
    (1.00, STAND),
]


def howl_fn(t):
    P = keys_spline(HOWL, t)
    if 0.35 < t < 0.9:
        R(P, "jaw", x=-4 * S(2 * math.pi * 9 * t))  # 嚎声颤动
        R(P, "head", z=2 * S(2 * math.pi * 3 * t))
    tail_follow(P, t, amp_y=4, amp_x=3, freq=0.8, base_x=-8)
    return P


# 啸月：坐下（0.5）→ 仰头蓄力、胸口起伏（0.5–2.0，可循环段）→ 2.2 冲天长啸（墨环冲击波）→ 2.6
MOON_SIT = add_pose(SIT, mkpose(off=(0, 0.04, -0.04), hips=(-4, 0, 0), **sym(hup=(-6, 0, 0), hlow=(8, 0, 0))))
MOON_GATHER = add_pose(MOON_SIT, mkpose(chest=(-6, 0, 0), neck=(-30, 0, 0), head=(-16, 0, 0), jaw=(-8, 0, 0)))
MOON_PEAK = add_pose(MOON_SIT, mkpose(off=(0, 0.03, 0.05), spine=(-4, 0, 0), chest=(-10, 0, 0), neck=(-56, 0, 0), head=(-36, 0, 0), jaw=(-44, 0, 0), **sym(fup=(-8, 0, 0))))
HOWL_MOON = [
    (0.0, STAND),
    (0.5, MOON_SIT),
    (1.0, MOON_GATHER),
    (2.0, add_pose(MOON_GATHER, mkpose(neck=(-12, 0, 0), head=(-8, 0, 0), jaw=(-6, 0, 0)))),
    (2.2, MOON_PEAK),
    (2.6, add_pose(MOON_PEAK, mkpose(neck=(-2, 0, 0), jaw=(4, 0, 0)))),
]


def howl_moon_fn(t):
    P = keys_spline(HOWL_MOON, t)
    if 0.5 < t < 2.15:
        b = S(2 * math.pi * t / 0.9)
        R(P, "chest", x=-3 * b)
        R(P, "spine", x=1.5 * b)
        R(P, "neck", x=-2 * b)
    if t > 2.2:
        R(P, "jaw", x=-5 * S(2 * math.pi * 10 * t))
    tail_follow(P, t, amp_y=4, amp_x=3, freq=0.5, base_x=-6)
    return P


# 影袭：化墨渗入（整只沉到地下）/ 破墨而出（出招瞬间起播，0.05 就咬）
SUNK = pose(crouch=0.9, off=(0, 0, -1.7), neck=(10, 0, 0), head=(10, 0, 0), **sym(fup=(-40, 0, -20), hup=(10, 0, -20)), tail1=(-20, 0, 0))
SINK = [
    (0.0, STAND),
    (0.25, pose(crouch=0.8, off=(0, 0.05, -0.12), neck=(12, 0, 0), head=(6, 0, 0), jaw=(-10, 0, 0), **sym(fup=(-20, 0, -10)), tail1=(-10, 0, 0))),
    (0.8, SUNK),
]
EMERGE = [
    (0.0, add_pose(SUNK, mkpose(off=(0, 0, 0.5), neck=(-30, 0, 0), head=(-10, 0, 0), jaw=(-30, 0, 0)))),
    (0.05, pose(crouch=0.1, off=(0, -0.2, 0.12), spine=(8, 0, 0), chest=(-8, 0, 0), neck=(-24, 0, 0), head=(6, 0, 0), jaw=(-42, 0, 0),
                **sym(fup=(-55, 0, 0), hup=(30, 0, 0)))),
    (0.15, pose(crouch=0.15, off=(0, -0.24, 0.04), neck=(-6, 0, 0), head=(14, 0, 0), jaw=(2, 0, 0), **sym(fup=(-25, 0, 0)))),
    (0.6, STAND),
]
# 撞柱：迎面撞上 → 头猛地后弹、前身抬起后坐
CRASH = [
    (0.0, pose(crouch=0.0, off=(0, -0.2, 0.08), spine=(6, 0, 0), neck=(-20, 0, 0), head=(4, 0, 0), jaw=(-30, 0, 0), **sym(fup=(-50, 0, 0), hup=(30, 0, 0)))),
    (0.1, pose(crouch=0.4, off=(0, 0.2, 0.02), hips=(-6, 0, 0), spine=(-6, 0, 0), chest=(-8, 0, 0), neck=(-18, 0, 8), head=(-22, 0, 10), jaw=(-26, 0, 0),
               **sym(fup=(-30, 0, -10), flow=(20, 0, 0)))),
    (0.5, pose(crouch=0.55, off=(0, 0.28, -0.06), hips=(0, 6, 0), spine=(4, 0, 0), neck=(16, 0, -10), head=(14, 0, -12), jaw=(-12, 0, 0), **sym(fup=(-6, 0, -12)))),
]
DIZZY_BASE = CRASH[-1][1]


def dizzy(t):
    a = 2 * math.pi * t / 1.2
    P = add_pose(DIZZY_BASE, mkpose(hips=(0, 6 * S(a), 0), spine=(0, 0, 4 * S(a, 0.5)), neck=(4 * S(2 * a), 0, 12 * S(a, 1.0)), head=(3 * S(2 * a, 0.7), 8 * S(a, 1.4), 14 * S(a, 1.4)),
                                    jaw=(-8 - 6 * S(2 * a), 0, 0)))
    P["off"] += V((0.03 * S(a, 0.3), 0, 0))
    tail_follow(P, t, amp_y=6, amp_x=3, freq=1 / 1.2, base_x=-20)
    return P


STAGGER = [
    (0.0, STAND),
    (0.12, pose(crouch=0.35, off=(-0.06, 0.18, 0.0), hips=(0, 10, 6), spine=(-6, 0, 8), chest=(-10, 6, 10), neck=(-20, 0, 14), head=(-16, 0, 14), jaw=(-22, 0, 0),
                fup_L=(-30, 0, 16), fup_R=(10, 0, -10), hup_L=(-20, 0, 10))),
    (0.4, pose(crouch=0.5, off=(0.05, 0.25, -0.06), hips=(0, -8, -6), spine=(4, 0, -6), neck=(8, 0, -10), head=(10, 0, -8), jaw=(-14, 0, 0),
               fup_L=(-10, 0, -10), fup_R=(-26, 0, 14), hup_R=(-20, 0, -10))),
    (0.8, STAND),
]
# 威折倒地 / 伏地 / 起身：前腿向两侧一软，胸腹砸地，头搁在地上
DOWN_POSE = pose(crouch=0.0, off=(0.02, 0.06, -0.52), hips=(4, 8, 0), spine=(4, 0, 0), chest=(4, 0, 0), neck=(16, 0, 8), head=(-2, 0, 12), jaw=(-6, 0, 0),
                 **sym(fup=(-70, 0, -26), flow=(10, 0, 0), fpaw=(18, 0, 0), hup=(-66, 0, -22), hlow=(100, 0, 0), hmeta=(-46, 0, 0), hpaw=(30, 0, 0)),
                 tail1=(-16, 0, 26), tail2=(-6, 0, 16))
DOWN = [
    (0.0, STAND),
    (0.18, pose(crouch=0.6, off=(0, 0.05, -0.2), spine=(6, 0, 0), neck=(16, 0, 0), head=(6, 0, 0), jaw=(-20, 0, 0), **sym(fup=(-30, 0, -20)))),
    (0.45, add_pose(DOWN_POSE, mkpose(off=(0, 0, -0.03), neck=(6, 0, 0)))),
    (0.6, DOWN_POSE),
]


def down_loop(t):
    a = 2 * math.pi * t / 1.0  # 粗重喘息
    P = add_pose(DOWN_POSE, mkpose(spine=(1.8 * S(a), 0, 0), chest=(-2.5 * S(a), 0, 0), neck=(-1.5 * S(a, 0.5), 0, 0), jaw=(-6 - 6 * max(0, S(a)), 0, 0)))
    R(P, "tail3", z=8 * S(a * 0.5))
    R(P, "tail4", z=12 * S(a * 0.5, 0.4))
    return P


RISE = [
    (0.0, DOWN_POSE),
    (0.3, pose(crouch=0.7, off=(0, 0.06, -0.36), hips=(2, 4, 0), spine=(2, 0, 0), chest=(-6, 0, 0), neck=(-6, 0, 4), head=(-4, 0, 4), jaw=(-10, 0, 0), **sym(fup=(-26, 0, -10)))),
    (0.6, pose(crouch=0.35, off=(0, 0.02, -0.04), neck=(-8, 0, 0), head=(-4, 0, 0), jaw=(-12, 0, 0))),
    (0.9, STAND),
]
# 转阶段：跃上狼王石（原地起跳、落地；位置由控制器插值）/ 骨甲崩裂（0.5 秒那一刻炸开，对应 look.armorBurst()）
LEAP = [
    (0.0, STAND),
    (0.22, pose(crouch=0.85, off=(0, 0.12, -0.08), spine=(4, 0, 0), neck=(-12, 0, 0), head=(-8, 0, 0), **sym(fup=(16, 0, 0)))),
    (0.42, pose(crouch=0.0, off=(0, -0.05, 0.55), hips=(10, 0, 0), spine=(-6, 0, 0), chest=(-12, 0, 0), neck=(-20, 0, 0), head=(6, 0, 0), jaw=(-10, 0, 0),
                **sym(fup=(-70, 0, 0), flow=(70, 0, 0), fpaw=(30, 0, 0), hup=(50, 0, 0), hlow=(-30, 0, 0), hmeta=(20, 0, 0)), tail1=(10, 0, 0))),
    (0.62, pose(crouch=0.7, off=(0, -0.04, -0.04), spine=(6, 0, 0), neck=(4, 0, 0), head=(6, 0, 0), jaw=(-6, 0, 0), **sym(fup=(-20, 0, 0)))),
    (0.8, STAND),
]
BURST_ARCH = pose(crouch=0.5, off=(0, 0.04, -0.06), hips=(6, 0, 0), spine=(-14, 0, 0), chest=(-6, 0, 0), neck=(30, 0, 0), head=(16, 0, 0), jaw=(-26, 0, 0),
                  **sym(fup=(-14, 0, -12), hup=(-10, 0, -10)), tail1=(-30, 0, 0))
BURST_THROW = pose(crouch=0.1, off=(0, 0.1, 0.06), hips=(-10, 0, 0), spine=(8, 0, 0), chest=(-14, 0, 0), neck=(-46, 0, 0), head=(-28, 0, 0), jaw=(-44, 0, 0),
                   **sym(fup=(-26, 0, 0), hup=(-22, 0, 0), hlow=(24, 0, 0)), tail1=(30, 0, 0))
ARMOR_BURST = [
    (0.0, STAND),
    (0.4, BURST_ARCH),
    (0.5, add_pose(BURST_ARCH, mkpose(spine=(-6, 0, 0), neck=(6, 0, 0)))),
    (0.62, BURST_THROW),
    (1.0, add_pose(BURST_THROW, mkpose(neck=(6, 0, 0), jaw=(10, 0, 0)))),
    (1.2, STAND),
]


def armor_burst_fn(t):
    P = keys_spline(ARMOR_BURST, t)
    if 0.2 < t < 0.52:
        k = (t - 0.2) / 0.32
        R(P, "spine", y=3 * k * S(2 * math.pi * 14 * t))  # 崩裂前全身发抖
        R(P, "chest", y=-3 * k * S(2 * math.pi * 14 * t, 0.7))
    return P


# 受威折处决：伏地 → 剑插入（0.1）全身一挺、仰头痛嚎 → 再瘫回去
EXEC_HIT = [
    (0.0, DOWN_POSE),
    (0.12, add_pose(DOWN_POSE, mkpose(off=(0, 0, -0.04), spine=(8, 0, 0), chest=(-10, 0, 0), neck=(-50, 0, -6), head=(-24, 0, -10), jaw=(-40, 0, 0), tail1=(30, 0, -20)))),
    (0.45, add_pose(DOWN_POSE, mkpose(off=(0, 0, -0.02), spine=(6, 0, 0), chest=(-8, 0, 0), neck=(-44, 0, -4), head=(-20, 0, -6), jaw=(-36, 0, 0), tail1=(20, 0, -10)))),
    (1.0, DOWN_POSE),
]


def exec_hit_fn(t):
    P = keys_spline(EXEC_HIT, t)
    if 0.1 < t < 0.6:
        k = 1 - (t - 0.1) / 0.5
        R(P, "spine", y=4 * k * S(2 * math.pi * 16 * t))
        R(P, "jaw", x=-6 * k * S(2 * math.pi * 10 * t))
    return P


# 气竭跪伏 / 终结处决（与化墨特效配合，最后侧倒、头落地）
KNEEL_POSE = pose(crouch=0.45, off=(0, -0.02, -0.34), hips=(-6, 0, 0), spine=(10, 0, 0), chest=(8, 0, 0), neck=(30, 0, 0), head=(20, 0, 0), jaw=(-8, 0, 0),
                  **sym(fup=(-6, 0, -6), flow=(118, 0, 0), fpaw=(-40, 0, 0)), tail1=(-30, 0, 10), tail2=(-10, 0, 6))
KNEEL = [
    (0.0, STAND),
    (0.3, pose(crouch=0.35, off=(0, 0.06, -0.12), spine=(4, 0, 0), neck=(10, 0, 0), head=(6, 0, 0), jaw=(-14, 0, 0), fup_L=(-10, 0, -8), flow_L=(60, 0, 0))),
    (0.8, KNEEL_POSE),
]
FINAL_END = pose(crouch=0.5, off=(0.34, 0.12, -0.6), hips=(0, -80, 0), spine=(4, 0, 0), neck=(14, 0, 12), head=(22, 0, 8), jaw=(-8, 0, 0),
                 fup_L=(-25, 0, 0), fup_R=(-8, 0, 0), flow_L=(20, 0, 0), hup_L=(14, 0, 0), hup_R=(-8, 0, 0), tail1=(-12, 0, 0))
FINAL = [
    (0.0, KNEEL_POSE),
    (0.5, add_pose(KNEEL_POSE, mkpose(off=(0, 0, -0.04), neck=(-24, 0, 0), head=(-10, 0, 0), jaw=(-12, 0, 0)))),  # 最后抬一次头
    (1.1, pose(crouch=0.5, off=(0.18, 0.1, -0.42), hips=(0, -50, 0), spine=(6, 0, 0), neck=(20, 0, 8), head=(16, 0, 6), jaw=(-10, 0, 0),
               **sym(fup=(-20, 0, -6), flow=(40, 0, 0)), tail1=(-16, 0, 0))),
    (1.6, FINAL_END),
]
# 筑基后入场：伏低、夹尾、头压到前爪之间
COWER_POSE = pose(crouch=0.95, off=(0, 0.12, -0.08), hips=(-4, 0, 0), spine=(8, 0, 0), chest=(6, 0, 0), neck=(30, 0, 0), head=(18, 0, 0), jaw=(-4, 0, 0),
                  **sym(fup=(-20, 0, 0), flow=(30, 0, 0)), tail1=(-60, 0, 0), tail2=(-30, 0, 0), tail3=(-20, 0, 0), tail4=(-10, 0, 0))
COWER = [
    (0.0, STAND),
    (0.25, pose(crouch=0.3, off=(0, 0.06, -0.02), neck=(-10, 0, 0), head=(-6, 0, 0), jaw=(-6, 0, 0), tail1=(-20, 0, 0))),  # 先一怔
    (0.9, COWER_POSE),
    (1.4, add_pose(COWER_POSE, mkpose(off=(0, 0.04, -0.02), head=(0, 0, 6)))),
]
WAKE = [
    (0.0, LIE),
    (0.35, LIE_UP),
    (0.8, pose(crouch=0.8, off=(0, 0.02, -0.18), spine=(2, 0, 0), neck=(-12, 0, 0), head=(-6, 0, 0), jaw=(-8, 0, 0), **sym(fup=(-18, 0, 0)))),
    (1.15, pose(crouch=0.1, neck=(-14, 0, 0), head=(-8, 0, 0), jaw=(-16, 0, 0))),
    (1.4, STAND),
]
HIT = [
    (0.00, STAND),
    (0.06, pose(crouch=0.3, off=(0, 0.14, 0.02), spine=(-6, 4, 0), chest=(-10, 6, 0), neck=(-18, 0, 8), head=(-14, 0, 10), jaw=(-20, 0, 0))),
    (0.35, STAND),
]
DIE = [
    (0.00, STAND),
    (0.12, pose(crouch=0.3, off=(0, 0.1, 0.05), spine=(-8, 0, 0), neck=(-25, 0, 0), head=(-20, 0, 0), jaw=(-30, 0, 0))),
    (0.55, pose(crouch=0.5, off=(0.3, 0.15, -0.55), hips=(0, -78, 0), spine=(4, 0, 0), neck=(10, 0, 10), head=(18, 0, 6), jaw=(-14, 0, 0),
                fup_L=(-20, 0, 0), fup_R=(-5, 0, 0), hup_L=(10, 0, 0), hup_R=(-5, 0, 0), tail1=(-10, 0, 0))),
    (1.00, FINAL_END),
]

# (名称, 函数, 时长, 循环)；命中帧见文件末尾 ANIM_HIT
ACTIONS = [
    ("idle", idle, 2.0, True),
    ("run", run, 0.6, True),
    ("lie", lie, 3.0, True),
    ("wake", with_tail(WAKE, 6, -6, 0.8), 1.4, False),
    ("cower", keys_fn(COWER), 1.4, False),
    ("attack_claw", with_tail(CLAW, 8, 4), 0.6, False),
    ("attack_bite", with_tail(BITE, 6, 10), 0.6, False),
    ("bite_double_a", with_tail(BITE_A, 6, 10), 0.55, False),
    ("bite_double_b", with_tail(BITE_B, 6, 10), 0.6, False),
    ("turn_bite", turn_bite_fn, 0.7, False),
    ("howl", howl_fn, 1.0, False),
    ("howl_moon", howl_moon_fn, 2.6, False),
    ("sink", keys_fn(SINK), 0.8, False),
    ("emerge", with_tail(EMERGE, 6, 10), 0.6, False),
    ("crash", keys_fn(CRASH), 0.5, False),
    ("dizzy", dizzy, 1.2, True),
    ("stagger", with_tail(STAGGER, 10, -6), 0.8, False),
    ("down", keys_fn(DOWN), 0.6, False),
    ("down_loop", down_loop, 2.0, True),
    ("rise", with_tail(RISE, 6, -6), 0.9, False),
    ("leap_perch", keys_fn(LEAP), 0.8, False),
    ("armor_burst", armor_burst_fn, 1.2, False),
    ("exec_hit", exec_hit_fn, 1.0, False),
    ("kneel", keys_fn(KNEEL), 0.8, False),
    ("final", keys_fn(FINAL), 1.6, False),
    ("hit", with_tail(HIT, 10, -4), 0.35, False),
    ("die", keys_fn(DIE), 1.0, False),
]
# 命中帧（秒，对应 src/data/enemies.js / src/data/bosses/qingya.js 的 animHit）
ANIM_HIT = {"attack_claw": 0.28, "attack_bite": 0.32, "bite_double_a": 0.30, "bite_double_b": 0.25, "turn_bite": 0.40, "howl": 0.30, "howl_moon": 2.2, "emerge": 0.05}

build_mesh()
print("[qingya] tris by part:", {g or "body": sum(len(f) - 2 for f, fo in zip(mb.f, mb.fo) if fo == g) for g in (None, "armor", "crack", "eyefire")})
build_creature("qingya", mb, BONES, PART_BONES, "hips", ACTIONS)
print("[qingya] animHit", ANIM_HIT)
