# 墨途 · 低阶怪「竹叶青」（区域二，贴地扑咬）
#   blender.exe -b --factory-startup --python blender/build_snake.py   → assets/models/snake.glb
# 造型：约 2.4 m 的细长青蛇，后半身在地上弯成 S 形，前段微微抬起（头离地 0.5 m），三角头、金色竖瞳、浅色腹。
# 约定：Z 向上，面向 -Y，左侧 +X，原点在身体中段的地面。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *

MATS = [
    ("snake_green", (0.2, 0.42, 0.18, 1)),
    ("snake_belly", (0.78, 0.8, 0.55, 1)),
    ("eye_gold", (1.0, 0.75, 0.2, 1)),
    ("claw", (0.88, 0.85, 0.78, 1)),
]
mb = MB(MATS)
HIP = V((0, 0.35, 0.1))
FRONT = [HIP, V((0, 0.0, 0.12)), V((0, -0.3, 0.24)), V((0, -0.5, 0.42)), V((0, -0.68, 0.52))]
HEAD_TIP = V((0, -1.0, 0.46))
BACK = [HIP, V((0.22, 0.7, 0.09)), V((0.0, 1.05, 0.08)), V((-0.22, 1.4, 0.06)), V((-0.05, 1.75, 0.04))]
FR = [0.085, 0.085, 0.08, 0.07, 0.065]
BR = [0.085, 0.08, 0.065, 0.045, 0.012]


def build_mesh():
    segs = 8
    fp = catmull(FRONT, 3)
    mb.loft(fp, interp(FR, len(fp)), interp([r * 0.9 for r in FR], len(fp)), segs, lambda i, j: "snake_belly" if math.sin(2 * math.pi * j / segs) < -0.3 else "snake_green", "front", ref=(1, 0, 0), cap0=False, cap1=False)
    bp = catmull(BACK, 3)
    mb.loft(bp, interp([r * 0.9 for r in BR], len(bp)), interp(BR, len(bp)), segs, lambda i, j: "snake_belly" if math.cos(2 * math.pi * j / segs) < -0.3 else "snake_green", "back", ref=(0, 0, 1), cap0=False, cap1=True)
    mb.ellipsoid(HIP, (0.09, 0.1, 0.09), 8, 5, "snake_green", "hips")
    d = nrm(HEAD_TIP - FRONT[-1])
    mb.loft([FRONT[-1] - d * 0.03, FRONT[-1] + d * 0.12, FRONT[-1] + d * 0.26, HEAD_TIP], [0.08, 0.12, 0.09, 0.025], [0.07, 0.07, 0.05, 0.02], 8, "snake_green", "head", ref=(1, 0, 0))
    hc = FRONT[-1] + d * 0.14
    for s in (1, -1):
        mb.ellipsoid(hc + V((0.09 * s, 0, 0.04)), (0.025, 0.035, 0.022), 6, 3, "eye_gold", "head")
        mb.spike(FRONT[-1] + d * 0.3 + V((0.03 * s, 0, -0.04)), (0, -0.3, -1), 0.06, 0.01, "claw", "head", flat=1.0, segs=3)
    mb.spike(HEAD_TIP + V((0, -0.02, -0.01)), (0, -1, -0.2), 0.12, 0.008, "claw", "head", flat=1.0, segs=3)  # 信子（骨白细线）


def chain(pts, prefix, parent):
    return [("%s%d" % (prefix, i + 1), pts[i], pts[i + 1], parent if i == 0 else "%s%d" % (prefix, i), True) for i in range(len(pts) - 1)]


B = [("root", (0, 0, 0), (0, 0.2, 0), None, False), ("hips", HIP, HIP + V((0, 0, 0.15)), "root", True)]
B += chain(FRONT, "f", "hips")
B += [("head", FRONT[-1], HEAD_TIP, "f%d" % (len(FRONT) - 1), True)]
B += chain(BACK, "t", "hips")
NF, NT = len(FRONT) - 1, len(BACK) - 1
PART_BONES = {"front": ["hips"] + ["f%d" % (i + 1) for i in range(NF)], "back": ["hips"] + ["t%d" % (i + 1) for i in range(NT)], "hips": ["hips", "f1", "t1"], "head": ["head"]}


def wave(P, t, period, amp, lag=0.9):
    a = 2 * math.pi * t / period
    for i in range(NT):
        R(P, "t%d" % (i + 1), z=amp * (0.6 + 0.2 * i) * S(a, -lag * i))
    for i in range(NF):
        R(P, "f%d" % (i + 1), z=amp * 0.4 * S(a, lag * (i + 1)))


def front(P, x):
    for i in range(NF):
        R(P, "f%d" % (i + 1), x=x * (0.4 + 0.3 * i / NF))


def idle(t):
    P = P0()
    wave(P, t, 2.4, 5)
    R(P, "head", x=4 * S(2 * math.pi * t / 1.2), z=8 * S(2 * math.pi * t / 2.4))
    return P


def run(t):
    P = P0()
    wave(P, t, 0.6, 18)
    front(P, 8)
    return P


def fr(x, **kw):
    P = mkpose(**kw)
    front(P, x)
    return P


BITE = [
    (0.0, mkpose()),
    (0.2, fr(-18, off=(0, 0.2, 0), head=(-15, 0, 0))),  # 盘缩蓄势
    (0.3, fr(25, off=(0, -0.6, 0), head=(20, 0, 0))),  # 弹射扑咬
    (0.7, mkpose()),
]
HIT = [(0.0, mkpose()), (0.07, fr(-12, off=(0, 0.1, 0), head=(-15, 0, 10))), (0.3, mkpose())]
DIE = [(0.0, mkpose()), (0.3, fr(-15, head=(-25, 0, 0))), (1.0, fr(30, off=(0, 0, -0.04), head=(20, 0, 30)))]

build_mesh()
build_creature("snake", mb, B, PART_BONES, "hips", [
    ("idle", idle, 2.4, True),
    ("run", run, 0.6, True),
    ("attack_bite", keys_fn(BITE), 0.7, False),
    ("hit", keys_fn(HIT), 0.3, False),
    ("die", keys_fn(DIE), 1.0, False),
])
