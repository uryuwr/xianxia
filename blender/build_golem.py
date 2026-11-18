# 墨途 · 敌人「山神庙石傀」生成脚本（Blender 4.5，后台运行）
#   blender.exe -b --factory-startup --python blender/build_golem.py
# 产出：assets/models/golem.glb（网格 + 骨骼 + 6 段动画）
#
# 造型：山神庙守门的石傀——宽肩、短腿、垂到膝下的巨拳，从 45° 俯视是一个"倒梯形 + 两块大石拳"的剪影；
#       额心、胸口、小臂刻着发光的符文（rune_glow），肩上长青苔（moss）。各段石块刚性绑定，动起来像石头在磨。
# 约定：Z 向上，面向 -Y，左侧 +X，原点在脚底，身高约 2.3 m。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *
from mathutils import Euler

MATS = [
    ("stone_dark", (0.2, 0.2, 0.21, 1)),
    ("stone_light", (0.45, 0.43, 0.39, 1)),
    ("rune_glow", (1.0, 0.62, 0.2, 1)),
    ("moss", (0.28, 0.45, 0.22, 1)),
]
mb = MB(MATS)


def E(x=0, y=0, z=0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ")


def build_mesh():
    # 骨盆、躯干（上宽下窄）、胸甲
    mb.block((0, 0.02, 1.05), (0.72, 0.5, 0.34), "stone_dark", "hips", bevel=0.3)
    mb.block((0, 0.03, 1.5), (0.86, 0.6, 0.62), "stone_dark", "spine", taper=1.2, bevel=0.3)
    mb.block((0, 0.04, 1.93), (1.28, 0.78, 0.46), "stone_light", "chest", taper=0.9, bevel=0.35)
    mb.block((0, 0.28, 1.85), (0.9, 0.3, 0.5), "stone_dark", "chest", bevel=0.3)  # 后背
    # 胸口符文（菱形）与裂纹
    mb.ellipsoid((0, -0.3, 1.62), (0.15, 0.04, 0.22), 4, 2, "rune_glow", "spine")
    mb.ellipsoid((0.16, -0.28, 1.47), (0.05, 0.02, 0.012), 4, 2, "rune_glow", "spine", rot=E(0, 30, 0))
    mb.ellipsoid((-0.15, -0.28, 1.72), (0.05, 0.02, 0.012), 4, 2, "rune_glow", "spine", rot=E(0, -25, 0))
    # 头：小方石，额心一道横向发光眼缝，头顶一块翘起的冠石
    mb.block((0, -0.1, 2.24), (0.4, 0.38, 0.34), "stone_dark", "head", bevel=0.3)
    mb.ellipsoid((0, -0.3, 2.26), (0.16, 0.035, 0.05), 6, 2, "rune_glow", "head")
    mb.block((0, -0.04, 2.45), (0.3, 0.26, 0.12), "stone_light", "head", rot=E(-12, 0, 0), taper=0.7)
    # 背上的石刺（让 45° 俯视的剪影有锯齿）
    for x, z, l in ((0.32, 2.05, 0.38), (-0.32, 2.05, 0.38), (0.0, 2.1, 0.45), (0.18, 1.8, 0.3), (-0.18, 1.8, 0.3)):
        mb.spike((x, 0.36, z), (x * 0.8, 1, 0.7), l, 0.13, "stone_light", "chest", flat=0.8, segs=5)
    for s, t in ((1, "L"), (-1, "R")):
        # 肩石 + 青苔
        mb.ellipsoid((0.66 * s, 0.02, 2.0), (0.27, 0.3, 0.24), 7, 4, "stone_light", "upperarm_" + t)
        mb.ellipsoid((0.66 * s, 0.02, 2.18), (0.22, 0.24, 0.07), 8, 3, "moss", "upperarm_" + t)
        mb.spike((0.72 * s, 0.05, 2.15), (0.5 * s, 0.1, 1), 0.28, 0.09, "stone_dark", "upperarm_" + t, flat=0.9, segs=5)
        # 上臂、小臂（带符文）、巨拳
        mb.block((0.74 * s, 0.0, 1.55), (0.3, 0.32, 0.55), "stone_dark", "upperarm_" + t, bevel=0.3, rot=E(0, 8 * s, 0))
        mb.block((0.8 * s, -0.03, 1.05), (0.36, 0.36, 0.52), "stone_dark", "forearm_" + t, bevel=0.3, taper=1.1)
        mb.ellipsoid((0.98 * s, -0.04, 1.08), (0.03, 0.09, 0.2), 4, 2, "rune_glow", "forearm_" + t)
        mb.block((0.82 * s, -0.06, 0.6), (0.48, 0.48, 0.42), "stone_light", "fist_" + t, bevel=0.35)
        for k in (-1, 0, 1):
            mb.block((0.82 * s + 0.13 * k, -0.3, 0.62), (0.12, 0.08, 0.14), "stone_dark", "fist_" + t, bevel=0.3)
        # 腿：粗短，脚掌宽
        mb.block((0.27 * s, 0.0, 0.76), (0.32, 0.34, 0.44), "stone_dark", "thigh_" + t, bevel=0.3)
        mb.block((0.28 * s, 0.0, 0.33), (0.38, 0.4, 0.46), "stone_light", "shin_" + t, bevel=0.3, taper=0.9)
        mb.block((0.28 * s, -0.08, 0.07), (0.42, 0.52, 0.14), "stone_dark", "shin_" + t, bevel=0.25)


B = [
    ("root", (0, 0, 0), (0, 0.25, 0), None, False),
    ("hips", (0, 0, 0.95), (0, 0, 1.2), "root", True),
    ("spine", (0, 0, 1.2), (0, 0, 1.7), "hips", True),
    ("chest", (0, 0, 1.7), (0, 0, 2.05), "spine", True),
    ("head", (0, -0.08, 2.08), (0, -0.08, 2.4), "chest", True),
]
for s, t in ((1, "L"), (-1, "R")):
    B += [
        ("upperarm_" + t, (0.64 * s, 0, 1.92), (0.76 * s, 0, 1.3), "chest", True),
        ("forearm_" + t, (0.76 * s, 0, 1.3), (0.81 * s, -0.04, 0.82), "upperarm_" + t, True),
        ("fist_" + t, (0.81 * s, -0.04, 0.82), (0.82 * s, -0.06, 0.4), "forearm_" + t, True),
        ("thigh_" + t, (0.26 * s, 0, 0.98), (0.28 * s, 0, 0.55), "hips", True),
        ("shin_" + t, (0.28 * s, 0, 0.55), (0.28 * s, -0.05, 0.05), "thigh_" + t, True),
    ]
PART_BONES = {}  # 每段石块刚性绑定到同名骨骼


# ---------------- 动画 ----------------
def stand(P, sink=0.0):
    for t in ("L", "R"):
        R(P, "thigh_" + t, x=-6 - sink * 30)
        R(P, "shin_" + t, x=8 + sink * 50)
    P["off"] += V((0, 0, -0.08 * sink))


def base(P):
    stand(P, 0.1)
    for t, s in (("L", 1), ("R", -1)):
        R(P, "upperarm_" + t, y=4 * s)


def idle(t):
    P = mkpose(base)
    a = 2 * math.pi * t / 2.4
    R(P, "spine", x=1.5 * S(a))
    R(P, "chest", x=1.5 * S(a, 0.5))
    R(P, "head", z=6 * S(a * 0.5), x=-2 * S(a))
    for t_, s in (("L", 1), ("R", -1)):
        R(P, "upperarm_" + t_, x=3 * S(a, 0.8 * s))
        R(P, "forearm_" + t_, x=-4 - 3 * S(a, 1.0))
    return P


def run(t, dur=1.1):
    """沉重的步行：一步一顿，上身左右摇，拳头前后甩"""
    P = mkpose(base)
    a = 2 * math.pi * t / dur
    for t_, ph in (("L", 0.0), ("R", math.pi)):
        R(P, "thigh_" + t_, x=-26 * S(a, ph))
        R(P, "shin_" + t_, x=28 * max(0, S(a, ph + 1.6)))
        R(P, "upperarm_" + t_, x=18 * S(a, ph + math.pi))
        R(P, "forearm_" + t_, x=-10 - 8 * max(0, S(a, ph + math.pi)))
    R(P, "hips", y=5 * S(a), z=6 * S(a))
    R(P, "chest", y=-4 * S(a), z=-8 * S(a), x=6)
    R(P, "head", z=6 * S(a))
    P["off"] += V((0, 0, 0.05 * abs(S(a)) - 0.04))
    return P


SLAM = [
    (0.00, mkpose(base)),
    (0.40, mkpose(base, off=(0, 0.1, 0.05), spine=(-14, 0, 0), chest=(-10, 0, 0), head=(-12, 0, 0),
                  upperarm_L=(-165, -10, 0), upperarm_R=(-165, 10, 0), forearm_L=(-25, 0, 0), forearm_R=(-25, 0, 0))),  # 双拳举过头顶
    (0.55, mkpose(base, off=(0, -0.25, -0.22), spine=(24, 0, 0), chest=(14, 0, 0), head=(6, 0, 0), thigh_L=(-20, 0, 0), thigh_R=(-20, 0, 0), shin_L=(30, 0, 0), shin_R=(30, 0, 0),
                  upperarm_L=(-62, -6, 0), upperarm_R=(-62, 6, 0), forearm_L=(-20, 0, 0), forearm_R=(-20, 0, 0))),  # 砸地
    (0.80, mkpose(base, off=(0, -0.25, -0.22), spine=(26, 0, 0), chest=(14, 0, 0), thigh_L=(-20, 0, 0), thigh_R=(-20, 0, 0), shin_L=(30, 0, 0), shin_R=(30, 0, 0),
                  upperarm_L=(-55, -6, 0), upperarm_R=(-55, 6, 0), forearm_L=(-15, 0, 0), forearm_R=(-15, 0, 0))),
    (1.10, mkpose(base)),
]
SWIPE = [
    (0.00, mkpose(base)),
    (0.25, mkpose(base, off=(0, 0.05, 0), hips=(0, 0, -10), chest=(0, 0, -40), head=(0, 0, 20), upperarm_R=(-40, 70, -30), forearm_R=(-30, 0, 0), upperarm_L=(10, 0, 0))),  # 右拳后拉
    (0.35, mkpose(base, off=(0, -0.15, -0.04), hips=(0, 0, 12), chest=(10, 0, 48), head=(0, 0, -10), upperarm_R=(-75, 70, 40), forearm_R=(-10, 0, 0), upperarm_L=(20, 0, 0))),  # 横扫
    (0.55, mkpose(base, off=(0, -0.15, -0.04), hips=(0, 0, 14), chest=(10, 0, 52), upperarm_R=(-60, 60, 50), forearm_R=(-10, 0, 0))),
    (0.80, mkpose(base)),
]
HIT = [
    (0.00, mkpose(base)),
    (0.08, mkpose(base, off=(0, 0.1, 0), spine=(-10, 0, 0), chest=(-8, 4, 0), head=(-14, 0, 6), upperarm_L=(10, 0, 0), upperarm_R=(10, 0, 0))),
    (0.40, mkpose(base)),
]
DIE = [
    (0.00, mkpose(base)),
    (0.30, mkpose(base, off=(0, 0.05, -0.1), spine=(-10, 0, 0), head=(-20, 0, 0), upperarm_L=(-20, -10, 0), upperarm_R=(-20, 10, 0))),
    (0.80, mkpose(base, off=(0, -0.3, -0.62), thigh_L=(-80, 0, 0), thigh_R=(-80, 0, 0), shin_L=(110, 0, 0), shin_R=(110, 0, 0), spine=(30, 0, 0), chest=(18, 0, 0), head=(20, 0, 10),
                  upperarm_L=(-10, -20, 0), upperarm_R=(-10, 20, 0))),  # 跪倒
    (1.40, mkpose(base, off=(0, -0.55, -0.9), thigh_L=(-85, 0, 0), thigh_R=(-85, 0, 0), shin_L=(115, 0, 0), shin_R=(115, 0, 0), spine=(62, 0, 0), chest=(22, 0, 0), head=(25, 0, 15),
                  upperarm_L=(-30, -30, 0), upperarm_R=(-30, 30, 0), forearm_L=(-30, 0, 0), forearm_R=(-30, 0, 0))),  # 伏地
]

build_mesh()
build_creature("golem", mb, B, PART_BONES, "hips", [
    ("idle", idle, 2.4, True),
    ("run", run, 1.1, True),
    ("attack_slam", keys_fn(SLAM), 1.1, False),
    ("attack_swipe", keys_fn(SWIPE), 0.8, False),
    ("hit", keys_fn(HIT), 0.4, False),
    ("die", keys_fn(DIE), 1.4, False),
])
