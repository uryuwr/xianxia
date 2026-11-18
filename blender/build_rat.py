# 墨途 · 低阶怪「山鼠妖」（区域一，成群、脆、快）
#   blender.exe -b --factory-startup --python blender/build_rat.py   → assets/models/rat.glb
# 造型：拱背、尖吻、一对大圆耳、细长尾；背脊一排墨色短刺毛。约 0.5 m 高、连尾 1.3 m。
# 约定：Z 向上，面向 -Y，左侧 +X，原点在脚底。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *

MATS = [
    ("fur_brown", (0.36, 0.27, 0.19, 1)),
    ("fur_ink", (0.07, 0.07, 0.08, 1)),
    ("eye_red", (0.85, 0.08, 0.04, 1)),
    ("claw", (0.88, 0.85, 0.78, 1)),
]
mb = MB(MATS)


def build_mesh():
    body = catmull([(0, 0.32, 0.3), (0, 0.15, 0.38), (0, -0.05, 0.4), (0, -0.22, 0.38)], 2)
    mb.loft(body, interp([0.08, 0.17, 0.17, 0.12], len(body)), interp([0.08, 0.16, 0.17, 0.12], len(body)), 10, "fur_brown", "body")
    snout = [(0, -0.2, 0.4), (0, -0.33, 0.38), (0, -0.46, 0.33), (0, -0.55, 0.29)]
    mb.loft(snout, [0.11, 0.08, 0.05, 0.02], [0.1, 0.07, 0.045, 0.02], 8, "fur_brown", "head")
    mb.ellipsoid((0, -0.56, 0.29), (0.022, 0.02, 0.02), 6, 3, "fur_ink", "head")
    for s in (1, -1):
        mb.ellipsoid((0.085 * s, -0.24, 0.52), (0.07, 0.018, 0.075), 8, 4, "fur_ink", "head")  # 大圆耳
        mb.ellipsoid((0.06 * s, -0.36, 0.42), (0.022, 0.03, 0.02), 6, 3, "eye_red", "head")
        mb.spike((0.03 * s, -0.53, 0.26), (0.2 * s, -0.4, -1), 0.06, 0.012, "claw", "head", flat=1.0, segs=3)  # 门牙
        mb.spike((0.04 * s, -0.5, 0.31), (1 * s, -0.4, 0.1), 0.14, 0.006, "fur_ink", "head", flat=1.0, segs=3)  # 胡须
        for t, y, part in (("f", -0.14, "fl"), ("b", 0.18, "bl")):
            p = part[0] + ("l" if s > 0 else "r")
            mb.loft([(0.1 * s, y, 0.3), (0.11 * s, y - 0.02, 0.14), (0.11 * s, y - 0.06, 0.03)], [0.05, 0.035, 0.03], [0.05, 0.035, 0.03], 6, "fur_brown", p)
            for k in (-1, 0, 1):
                mb.spike((0.11 * s + 0.02 * k, y - 0.08, 0.02), (0.2 * k, -1, -0.3), 0.04, 0.008, "claw", p, flat=1.0, segs=3)
    tail = catmull([(0, 0.3, 0.3), (0, 0.6, 0.18), (0, 0.95, 0.12), (0.1, 1.25, 0.2)], 3)
    mb.loft(tail, interp([0.035, 0.025, 0.015, 0.006], len(tail)), interp([0.035, 0.025, 0.015, 0.006], len(tail)), 6, "fur_ink", "tail")
    for i in range(7):
        y = lerp(0.25, -0.15, i / 6)
        mb.spike((0, y, 0.52 - abs(y + 0.0) * 0.1), (0, 0.8, 0.6), 0.12, 0.035, "fur_ink", "body", flat=0.4)


B = [
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("hips", (0, 0.25, 0.34), (0, 0.0, 0.38), "root", True),
    ("spine", (0, 0.0, 0.38), (0, -0.2, 0.39), "hips", True),
    ("head", (0, -0.2, 0.39), (0, -0.55, 0.3), "spine", True),
    ("tail1", (0, 0.3, 0.3), (0, 0.65, 0.17), "hips", True),
    ("tail2", (0, 0.65, 0.17), (0, 0.98, 0.12), "tail1", True),
    ("tail3", (0, 0.98, 0.12), (0.1, 1.25, 0.2), "tail2", True),
]
for s, t in ((1, "l"), (-1, "r")):
    B += [("f" + t, (0.1 * s, -0.14, 0.32), (0.11 * s, -0.2, 0.02), "spine", True), ("b" + t, (0.1 * s, 0.18, 0.32), (0.11 * s, 0.12, 0.02), "hips", True)]
PART_BONES = {"body": ["hips", "spine"], "tail": ["hips", "tail1", "tail2", "tail3"]}


def tail(P, t, amp=12, freq=1.5):
    for i in range(3):
        R(P, "tail%d" % (i + 1), z=amp * (0.6 + 0.4 * i) * S(2 * math.pi * freq * t, -0.8 * i), x=-4)


def idle(t):
    P = P0()
    a = 2 * math.pi * t / 1.6
    R(P, "head", x=6 * max(0, S(a * 3)), z=10 * S(a))  # 嗅
    R(P, "spine", x=2 * S(a))
    tail(P, t, 10, 0.6)
    return P


def run(t, dur=0.36):
    P = P0()
    a = 2 * math.pi * t / dur
    for leg, ph in (("fl", 0), ("fr", 0.5), ("bl", math.pi), ("br", math.pi + 0.5)):
        R(P, leg, x=40 * S(a, ph))
    R(P, "spine", x=8 * S(a, 0.5))
    R(P, "head", x=-6 + 5 * S(a, 1))
    P["off"] += V((0, 0, 0.05 * abs(S(a))))
    tail(P, t, 6, 1 / dur)
    return P


BITE = [
    (0.0, mkpose()),
    (0.15, mkpose(off=(0, 0.1, -0.06), spine=(-10, 0, 0), head=(-15, 0, 0), fl=(20, 0, 0), fr=(20, 0, 0))),
    (0.25, mkpose(off=(0, -0.35, 0.06), spine=(8, 0, 0), head=(18, 0, 0), fl=(-50, 0, 0), fr=(-45, 0, 0), bl=(35, 0, 0), br=(35, 0, 0))),
    (0.5, mkpose()),
]
HIT = [(0.0, mkpose()), (0.07, mkpose(off=(0, 0.1, 0.04), spine=(-12, 6, 0), head=(-20, 0, 10))), (0.3, mkpose())]
DIE = [(0.0, mkpose()), (0.25, mkpose(off=(0, 0.05, 0.1), spine=(-15, 0, 0), head=(-20, 0, 0))),
       (0.8, mkpose(off=(0.1, 0, -0.2), hips=(0, -85, 0), head=(10, 0, 10), fl=(-30, 0, 0), bl=(20, 0, 0)))]

build_mesh()
build_creature("rat", mb, B, PART_BONES, "hips", [
    ("idle", idle, 1.6, True),
    ("run", run, 0.36, True),
    ("attack_bite", keys_fn(BITE, lambda t, P: tail(P, t, 10, 2)), 0.5, False),
    ("hit", keys_fn(HIT), 0.3, False),
    ("die", keys_fn(DIE), 0.8, False),
])
