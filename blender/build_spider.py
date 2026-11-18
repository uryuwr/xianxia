# 墨途 · 低阶怪「蛛妖」（区域一，远程吐丝减速）
#   blender.exe -b --factory-startup --python blender/build_spider.py   → assets/models/spider.glb
# 造型：大肚、八条折角长腿（45° 俯视是一个放射状的"米"字剪影），背上一道骨白的丝纹，前端一簇朱红小眼。约 0.7 m 高、腿展 2 m。
# 约定：Z 向上，面向 -Y，左侧 +X，原点在脚底。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *

MATS = [
    ("carapace", (0.09, 0.08, 0.1, 1)),
    ("silk", (0.85, 0.83, 0.76, 1)),
    ("eye_red", (0.85, 0.08, 0.04, 1)),
    ("claw", (0.88, 0.85, 0.78, 1)),
]
mb = MB(MATS)
LEGS = []  # (名称, 根, 膝, 足)
for s, t in ((1, "L"), (-1, "R")):
    for i in range(4):
        y = -0.22 + 0.13 * i
        root = V((0.14 * s, y, 0.46))
        knee = V((0.52 * s, y * 1.9 - 0.05, 0.78))
        foot = V((0.9 * s, y * 2.8 - 0.05, 0.02))
        LEGS.append(("leg%d%s" % (i, t), root, knee, foot))


def build_mesh():
    mb.ellipsoid((0, 0.36, 0.52), (0.3, 0.36, 0.27), 12, 7, "carapace", "abdomen")
    for k in range(3):  # 丝纹
        mb.ellipsoid((0, 0.24 + 0.13 * k, 0.78 - 0.03 * k), (0.12 - 0.02 * k, 0.03, 0.012), 8, 3, "silk", "abdomen")
    mb.ellipsoid((0, 0.5, 0.74), (0.04, 0.12, 0.012), 6, 3, "silk", "abdomen")
    mb.ellipsoid((0, -0.12, 0.47), (0.19, 0.21, 0.14), 10, 6, "carapace", "head")
    for k, (x, y, z, r) in enumerate([(0.05, -0.31, 0.53, 0.03), (-0.05, -0.31, 0.53, 0.03), (0.1, -0.27, 0.56, 0.022), (-0.1, -0.27, 0.56, 0.022), (0.03, -0.29, 0.6, 0.018), (-0.03, -0.29, 0.6, 0.018)]):
        mb.ellipsoid((x, y, z), (r, r, r), 6, 3, "eye_red", "head")
    for s in (1, -1):
        mb.spike((0.05 * s, -0.3, 0.42), (0.15 * s, -0.6, -1), 0.14, 0.03, "claw", "head", flat=1.0, segs=4)  # 螯牙
    for name, root, knee, foot in LEGS:
        mb.loft([root, knee], [0.035, 0.03], [0.035, 0.03], 6, "carapace", name + "a")
        mb.loft([knee, foot], [0.03, 0.012], [0.03, 0.012], 6, "carapace", name + "b")
        mb.spike(knee, (0, 0, 1), 0.08, 0.025, "carapace", name + "a", flat=0.6)  # 膝上倒刺


B = [
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("body", (0, 0.05, 0.47), (0, -0.25, 0.47), "root", True),
    ("abdomen", (0, 0.05, 0.5), (0, 0.7, 0.55), "body", True),
    ("head", (0, -0.05, 0.47), (0, -0.33, 0.48), "body", True),
]
PART_BONES = {}
for name, root, knee, foot in LEGS:
    B += [(name + "a", root, knee, "body", True), (name + "b", knee, foot, name + "a", True)]


def legs(P, a, amp=22, lift=18):
    """交替步态：L0 R1 L2 R3 一组，另一组反相；a 腿在水平面前后摆（绕 Z），抬腿（绕 Y）"""
    for name, root, knee, foot in LEGS:
        i, t = int(name[3]), name[4]
        s = 1 if t == "L" else -1
        ph = 0 if (i % 2 == 0) == (t == "L") else math.pi
        R(P, name + "a", z=amp * S(a, ph), y=-s * lift * max(0, S(a, ph + 1.57)))


def idle(t):
    P = P0()
    a = 2 * math.pi * t / 2.0
    legs(P, a, 4, 4)
    R(P, "abdomen", x=-3 * S(a))
    return P


def run(t, dur=0.5):
    P = P0()
    legs(P, 2 * math.pi * t / dur)
    P["off"] += V((0, 0, 0.03 * abs(S(4 * math.pi * t / dur))))
    return P


def front_up(deg):
    out = {}
    for name, *_ in LEGS:
        if name[3] in "01":
            out[name + "a"] = (0, (1 if name[4] == "L" else -1) * -deg, 0)
    return out


SPIT = [
    (0.0, mkpose()),
    (0.35, mkpose(off=(0, 0.1, 0.12), body=(-20, 0, 0), abdomen=(-25, 0, 0), head=(-10, 0, 0), **front_up(35))),  # 前身抬起、腹部前翘
    (0.45, mkpose(off=(0, -0.05, 0.05), body=(8, 0, 0), abdomen=(-40, 0, 0), head=(15, 0, 0), **front_up(10))),  # 吐丝
    (0.9, mkpose()),
]
BITE = [
    (0.0, mkpose()),
    (0.15, mkpose(off=(0, 0.08, 0.08), body=(-15, 0, 0), **front_up(40))),
    (0.25, mkpose(off=(0, -0.25, -0.04), body=(12, 0, 0), head=(20, 0, 0), **front_up(-10))),
    (0.5, mkpose()),
]
HIT = [(0.0, mkpose()), (0.07, mkpose(off=(0, 0.08, 0.05), body=(-12, 6, 0), abdomen=(10, 0, 0))), (0.3, mkpose())]


def curl():
    out = {}
    for name, *_ in LEGS:
        s = 1 if name[4] == "L" else -1
        out[name + "a"] = (0, -s * 50, 0)
        out[name + "b"] = (0, -s * 70, 0)
    return out


DIE = [(0.0, mkpose()), (0.3, mkpose(off=(0, 0, 0.1), body=(-15, 0, 0))), (0.9, mkpose(off=(0, 0, -0.3), body=(5, 0, 0), **curl()))]

build_mesh()
build_creature("spider", mb, B, PART_BONES, "body", [
    ("idle", idle, 2.0, True),
    ("run", run, 0.5, True),
    ("attack_spit", keys_fn(SPIT), 0.9, False),
    ("attack_bite", keys_fn(BITE), 0.5, False),
    ("hit", keys_fn(HIT), 0.3, False),
    ("die", keys_fn(DIE), 0.9, False),
])
