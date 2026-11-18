# 墨途 · 敌人「藤妖」生成脚本（Blender 4.5，后台运行）
#   blender.exe -b --factory-startup --python blender/build_vine.py
# 产出：assets/models/vine.glb（网格 + 骨骼 + 7 段动画）
#
# 造型：竹海里成精的老藤——树根盘成的底座、扭曲的藤干、顶着一颗叶片包裹的花苞头，苞口里一只发光的独眼，
#       两条带刺的长藤臂。远程施法型：吐籽（弹道）、地刺（落点圈）、近身抽打。头顶一朵朱红藤花，45° 俯视一眼可辨。
# 约定：Z 向上，面向 -Y，左侧 +X，原点在根座中心，高约 2.1 m。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *

MATS = [
    ("bark", (0.2, 0.15, 0.11, 1)),
    ("vine_green", (0.16, 0.33, 0.18, 1)),
    ("leaf_green", (0.35, 0.58, 0.27, 1)),
    ("eye_glow", (0.9, 1.0, 0.45, 1)),
    ("flower_red", (0.8, 0.2, 0.15, 1)),
]
mb = MB(MATS)


def build_mesh():
    # 根座：扁丘 + 放射状的根须
    mb.ellipsoid((0, 0, 0.14), (0.55, 0.55, 0.22), 10, 5, "bark", "base")
    for k in range(9):
        a = 2 * math.pi * k / 9 + 0.2
        d = V((math.cos(a), math.sin(a), 0))
        mb.loft([d * 0.35 + V((0, 0, 0.18)), d * 0.7 + V((0, 0, 0.08)), d * 1.0 + V((0, 0, 0.02))], [0.1, 0.06, 0.02], [0.08, 0.05, 0.02], 6, "bark", "base")
    # 藤干：两股扭在一起
    trunk = catmull([(0, 0, 0.2), (0.04, 0.02, 0.6), (-0.03, 0.04, 1.0), (0.0, 0.03, 1.45)], 3)
    mb.loft(trunk, interp([0.3, 0.24, 0.22, 0.2], len(trunk)), interp([0.28, 0.22, 0.2, 0.19], len(trunk)), 9, "bark", "trunk")
    for ph in (0, math.pi):
        sp = [V((0.25 * math.cos(ph + u * 7), 0.25 * math.sin(ph + u * 7), 0.25 + u * 1.25)) for u in [i / 14 for i in range(15)]]
        mb.loft(sp, 0.05, 0.05, 6, "vine_green", "trunk")
    # 叶片沿藤干
    for k, (z, a) in enumerate(((0.55, 0.3), (0.8, 2.4), (1.05, 4.2), (1.25, 1.2), (0.7, 5.3))):
        d = V((math.cos(a), math.sin(a), 0.5))
        mb.spike(V((0.2 * math.cos(a), 0.2 * math.sin(a), z)), d, 0.38, 0.12, "leaf_green", "trunk", flat=0.25, segs=4)
    # 头：花苞，外裹叶瓣，苞口朝前（-Y）一只独眼
    mb.ellipsoid((0, -0.06, 1.78), (0.3, 0.28, 0.36), 10, 7, "vine_green", "head")
    for k in range(7):
        a = math.radians(-60 + k * 200 / 6) + math.pi / 2  # 瓣从两侧和后方包过来
        d = V((math.cos(a), math.sin(a), 0.9))
        mb.spike(V((0.22 * math.cos(a), 0.22 * math.sin(a) - 0.04, 1.62)), d, 0.6, 0.18, "leaf_green", "head", flat=0.3, segs=5)
    mb.ellipsoid((0, -0.3, 1.8), (0.2, 0.09, 0.16), 8, 4, "eye_glow", "head")
    mb.ellipsoid((0, -0.38, 1.8), (0.06, 0.03, 0.12), 6, 3, "bark", "head")  # 竖瞳
    for k in range(5):  # 头顶藤花
        a = 2 * math.pi * k / 5
        mb.spike(V((0, 0.02, 2.1)), (math.cos(a), math.sin(a), 0.7), 0.24, 0.09, "flower_red", "head", flat=0.3, segs=4)
    mb.ellipsoid((0, 0.02, 2.12), (0.06, 0.06, 0.05), 6, 3, "eye_glow", "head")
    # 藤臂：带刺长藤，末端卷起成钩
    for s, t in ((1, "L"), (-1, "R")):
        arm = [(0.18 * s, 0, 1.36), (0.5 * s, -0.08, 1.28), (0.82 * s, -0.22, 1.08), (1.02 * s, -0.42, 0.84), (1.06 * s, -0.62, 0.7), (0.98 * s, -0.72, 0.74)]
        pts = catmull(arm, 3)
        mb.loft(pts, interp([0.11, 0.09, 0.07, 0.05, 0.035, 0.02], len(pts)), interp([0.1, 0.085, 0.065, 0.048, 0.033, 0.02], len(pts)), 7, "vine_green", "arm_" + t)
        for i in range(2, len(pts) - 2, 2):
            p = pts[i]
            mb.spike(p + V((0, 0, 0.05)), (0.3 * s, -0.3, 1), 0.12, 0.025, "bark", "arm_" + t, flat=1.0, segs=3)
            mb.spike(p + V((0, 0.04, -0.03)), (0.2 * s, 1, -0.6), 0.1, 0.02, "bark", "arm_" + t, flat=1.0, segs=3)
        mb.spike(V((0.5 * s, -0.08, 1.33)), (0.4 * s, 0.4, 1), 0.3, 0.08, "leaf_green", "arm_" + t, flat=0.25)


B = [
    ("root", (0, 0, 0), (0, 0.25, 0), None, False),
    ("base", (0, 0, 0.0), (0, 0, 0.3), "root", True),
    ("trunk1", (0, 0, 0.3), (0, 0.02, 0.9), "base", True),
    ("trunk2", (0, 0.02, 0.9), (0, 0.03, 1.45), "trunk1", True),
    ("head", (0, 0.03, 1.45), (0, -0.05, 2.1), "trunk2", True),
]
PART_BONES = {"base": ["base"], "trunk": ["base", "trunk1", "trunk2"], "head": ["head"]}
for s, t in ((1, "L"), (-1, "R")):
    B += [
        ("arm1_" + t, (0.18 * s, 0, 1.36), (0.6 * s, -0.12, 1.22), "trunk2", True),
        ("arm2_" + t, (0.6 * s, -0.12, 1.22), (0.96 * s, -0.36, 0.9), "arm1_" + t, True),
        ("arm3_" + t, (0.96 * s, -0.36, 0.9), (1.0 * s, -0.72, 0.72), "arm2_" + t, True),
    ]
    PART_BONES["arm_" + t] = ["trunk2", "arm1_" + t, "arm2_" + t, "arm3_" + t]


# ---------------- 动画 ----------------
def arms_sway(P, t, period, amp=10):
    a = 2 * math.pi * t / period
    for t_, s in (("L", 1), ("R", -1)):
        for i in range(3):
            R(P, "arm%d_%s" % (i + 1, t_), y=s * amp * (0.6 + 0.3 * i) * S(a, -0.7 * i + (0 if s > 0 else 1.5)), z=s * amp * 0.5 * S(a * 0.7, -0.5 * i))


def idle(t):
    P = P0()
    a = 2 * math.pi * t / 2.4
    R(P, "trunk1", y=4 * S(a), x=2 * S(a, 1))
    R(P, "trunk2", y=5 * S(a, -0.6), x=3 * S(a, 0.5))
    R(P, "head", y=-6 * S(a, -1.2), x=-4 + 4 * S(a, 0.4))
    arms_sway(P, t, 2.4)
    return P


def run(t):
    """滑行：根须在地上蠕动推进，藤干前倾左右摆"""
    P = P0()
    a = 2 * math.pi * t / 1.0
    R(P, "base", z=6 * S(a))
    R(P, "trunk1", x=12, y=7 * S(a, 0.6))
    R(P, "trunk2", x=6, y=7 * S(a, 1.2))
    R(P, "head", x=-14, y=-8 * S(a, 1.8))
    for t_, s in (("L", 1), ("R", -1)):
        R(P, "arm1_" + t_, z=s * 25)  # 藤臂拖在身后
        R(P, "arm2_" + t_, z=s * 15 + 10 * S(a, s))
    arms_sway(P, t, 1.0, 8)
    P["off"] += V((0, 0, 0.03 * S(2 * a)))
    return P


def arms(L=(0, 0, 0), R_=(0, 0, 0), k2=0.6, k3=0.4):
    out = {}
    for t, s, r in (("L", 1, L), ("R", -1, R_)):
        out["arm1_" + t] = (r[0], s * r[1], s * r[2])
        out["arm2_" + t] = (r[0] * k2, s * r[1] * k2, s * r[2] * k2)
        out["arm3_" + t] = (r[0] * k3, s * r[1] * k3, s * r[2] * k3)
    return out


SPIT = [
    (0.00, mkpose()),
    (0.35, mkpose(trunk1=(-8, 0, 0), trunk2=(-18, 0, 0), head=(-28, 0, 0), **arms((0, -20, 20), (0, -20, 20)))),  # 后仰鼓气
    (0.45, mkpose(off=(0, -0.08, 0), trunk1=(8, 0, 0), trunk2=(16, 0, 0), head=(22, 0, 0), **arms((0, 10, -10), (0, 10, -10)))),  # 吐出
    (0.90, mkpose()),
]
LASH = [
    (0.00, mkpose()),
    (0.24, mkpose(trunk2=(0, 0, 25), head=(0, 0, -15), **arms((0, -30, 70), (0, 0, 0)))),  # 左臂后扬
    (0.32, mkpose(trunk2=(6, 0, -35), head=(0, 0, 20), **arms((-10, 15, -85), (0, 0, 0), k2=0.9, k3=0.8))),  # 横抽
    (0.70, mkpose()),
]
CAST = [
    (0.00, mkpose()),
    (0.40, mkpose(trunk2=(-10, 0, 0), head=(-25, 0, 0), **arms((0, -75, 0), (0, -75, 0), k2=0.5, k3=0.3))),  # 双臂举起
    (0.50, mkpose(trunk1=(6, 0, 0), trunk2=(14, 0, 0), head=(20, 0, 0), **arms((10, 55, 0), (10, 55, 0), k2=0.7, k3=0.6))),  # 砸地，地刺
    (1.00, mkpose()),
]
HIT = [
    (0.00, mkpose()),
    (0.08, mkpose(trunk1=(-6, 4, 0), trunk2=(-14, 0, 0), head=(-20, 8, 0), **arms((0, -25, 0), (0, -25, 0)))),
    (0.35, mkpose()),
]
DIE = [
    (0.00, mkpose()),
    (0.30, mkpose(trunk2=(-12, 0, 0), head=(-30, 0, 0), **arms((0, -40, 0), (0, -40, 0)))),
    (1.30, mkpose(off=(0, 0, -0.12), trunk1=(35, 8, 0), trunk2=(45, 0, 0), head=(40, 10, 0), **arms((10, 60, 0), (10, 60, 0), k2=0.8, k3=0.8))),  # 枯萎垂地
]

build_mesh()
build_creature("vine", mb, B, PART_BONES, "base", [
    ("idle", idle, 2.4, True),
    ("run", run, 1.0, True),
    ("attack_spit", keys_fn(SPIT), 0.9, False),
    ("attack_lash", keys_fn(LASH), 0.7, False),
    ("attack_cast", keys_fn(CAST), 1.0, False),
    ("hit", keys_fn(HIT), 0.35, False),
    ("die", keys_fn(DIE), 1.3, False),
])
