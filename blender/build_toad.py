# 墨途 · 低阶怪「寒蟾」（区域二，寒气吐息减速、跳砸，霸体）
#   blender.exe -b --factory-startup --python blender/build_toad.py   → assets/models/toad.glb
# 造型：蹲伏的大蟾，宽扁身子、背上一片霜白疣粒、两只冰蓝凸眼，后腿折叠。约 0.9 m 高、1.2 m 宽。
# 约定：Z 向上，面向 -Y，左侧 +X，原点在脚底。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *

MATS = [
    ("toad_skin", (0.16, 0.22, 0.27, 1)),
    ("toad_belly", (0.62, 0.66, 0.62, 1)),
    ("wart", (0.84, 0.9, 0.94, 1)),
    ("eye_ice", (0.55, 0.9, 1.0, 1)),
]
mb = MB(MATS)


def build_mesh():
    mb.ellipsoid((0, 0.05, 0.42), (0.48, 0.52, 0.34), 14, 8, "toad_skin", "body")
    mb.ellipsoid((0, 0.0, 0.3), (0.42, 0.44, 0.22), 12, 6, "toad_belly", "body")
    mb.ellipsoid((0, -0.36, 0.5), (0.36, 0.26, 0.2), 12, 6, "toad_skin", "head")  # 宽头
    mb.ellipsoid((0, -0.38, 0.36), (0.34, 0.24, 0.07), 12, 4, "toad_belly", "jaw")  # 下颌
    for s in (1, -1):
        mb.ellipsoid((0.2 * s, -0.4, 0.68), (0.09, 0.09, 0.09), 8, 5, "eye_ice", "head")
        mb.ellipsoid((0.2 * s, -0.47, 0.7), (0.03, 0.02, 0.06), 6, 3, "toad_skin", "head")  # 竖瞳
        # 前腿
        mb.loft([(0.3 * s, -0.3, 0.32), (0.4 * s, -0.42, 0.14), (0.42 * s, -0.48, 0.03)], [0.07, 0.055, 0.05], [0.07, 0.055, 0.05], 7, "toad_skin", "f" + ("l" if s > 0 else "r"))
        mb.ellipsoid((0.44 * s, -0.53, 0.03), (0.1, 0.09, 0.03), 8, 3, "toad_skin", "f" + ("l" if s > 0 else "r"))
        # 后腿（折叠）
        t = "b" + ("l" if s > 0 else "r")
        mb.loft([(0.36 * s, 0.25, 0.35), (0.6 * s, 0.1, 0.25), (0.55 * s, 0.35, 0.1), (0.5 * s, 0.05, 0.03)], [0.13, 0.1, 0.07, 0.05], [0.12, 0.09, 0.06, 0.05], 8, "toad_skin", t)
        mb.ellipsoid((0.5 * s, -0.02, 0.03), (0.12, 0.13, 0.03), 8, 3, "toad_skin", t)
    # 背上的霜白疣粒
    import random
    rnd = random.Random(7)
    for k in range(22):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.05, 0.38)
        x, y = math.cos(a) * r, 0.08 + math.sin(a) * r * 1.1
        z = 0.42 + 0.34 * math.sqrt(max(0, 1 - (x / 0.48) ** 2 - ((y - 0.05) / 0.52) ** 2)) - 0.02
        mb.ellipsoid((x, y, z), (0.04, 0.04, 0.03), 6, 3, "wart", "body")


B = [
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("hips", (0, 0.25, 0.4), (0, -0.15, 0.45), "root", True),
    ("head", (0, -0.15, 0.48), (0, -0.6, 0.5), "hips", True),
    ("jaw", (0, -0.18, 0.36), (0, -0.62, 0.36), "head", True),
]
for s, t in ((1, "l"), (-1, "r")):
    B += [("f" + t, (0.3 * s, -0.3, 0.34), (0.43 * s, -0.5, 0.03), "hips", True), ("b" + t, (0.36 * s, 0.25, 0.36), (0.5 * s, 0.05, 0.03), "hips", True)]
PART_BONES = {"body": ["hips"]}


def idle(t):
    P = P0()
    a = 2 * math.pi * t / 1.8
    R(P, "jaw", x=4 * max(0, S(a * 2)))  # 鼓腮
    R(P, "head", x=-2 * S(a))
    P["off"] += V((0, 0, 0.015 * S(a * 2)))
    return P


def run(t, dur=0.6):
    """跳着走：后腿一蹬、前腿接地"""
    P = P0()
    u = (t % dur) / dur
    h = math.sin(min(1, u / 0.6) * math.pi) if u < 0.6 else 0
    P["off"] += V((0, 0, 0.35 * h))
    R(P, "bl", x=-50 * h)
    R(P, "br", x=-50 * h)
    R(P, "fl", x=30 * h)
    R(P, "fr", x=30 * h)
    R(P, "hips", x=-10 * h)
    return P


BREATH = [
    (0.0, mkpose()),
    (0.4, mkpose(off=(0, 0.08, 0.1), hips=(-18, 0, 0), head=(-15, 0, 0), jaw=(10, 0, 0))),  # 仰头鼓气
    (0.5, mkpose(off=(0, -0.05, 0.02), hips=(8, 0, 0), head=(10, 0, 0), jaw=(40, 0, 0))),  # 张口吐寒气
    (0.9, mkpose(off=(0, -0.05, 0.02), hips=(8, 0, 0), head=(8, 0, 0), jaw=(35, 0, 0))),
    (1.1, mkpose()),
]
SLAM = [
    (0.0, mkpose()),
    (0.25, mkpose(off=(0, 0, -0.08), bl=(20, 0, 0), br=(20, 0, 0), hips=(6, 0, 0))),  # 蹲
    (0.38, mkpose(off=(0, -0.2, 0.7), bl=(-60, 0, 0), br=(-60, 0, 0), fl=(-30, 0, 0), fr=(-30, 0, 0), hips=(-12, 0, 0))),  # 跃起
    (0.48, mkpose(off=(0, -0.3, -0.04), fl=(20, 0, 0), fr=(20, 0, 0), hips=(10, 0, 0), jaw=(15, 0, 0))),  # 砸地
    (0.9, mkpose()),
]
HIT = [(0.0, mkpose()), (0.07, mkpose(off=(0, 0.06, 0.05), hips=(-10, 5, 0), head=(-15, 0, 0))), (0.3, mkpose())]
DIE = [(0.0, mkpose()), (0.3, mkpose(off=(0, 0, 0.1), hips=(-15, 0, 0))), (1.0, mkpose(off=(0.1, 0, -0.1), hips=(0, -80, 0), head=(10, 0, 0), jaw=(30, 0, 0)))]

build_mesh()
build_creature("toad", mb, B, PART_BONES, "hips", [
    ("idle", idle, 1.8, True),
    ("run", run, 0.6, True),
    ("attack_breath", keys_fn(BREATH), 1.1, False),
    ("attack_slam", keys_fn(SLAM), 0.9, False),
    ("hit", keys_fn(HIT), 0.3, False),
    ("die", keys_fn(DIE), 1.0, False),
])
