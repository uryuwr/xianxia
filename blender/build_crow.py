# 墨途 · 低阶怪「鸦妖」（区域一，飞行骚扰）——由 build_bat.py 派生：骨架与动作同蝠妖，造型换成乌鸦
#   blender.exe -b --factory-startup --python blender/build_crow.py   → assets/models/crow.glb
# 造型：墨黑羽身、金色尖喙、朱红眼，翼展约 2.2 m，翼缘一排长羽（45° 俯视是锯齿状的"八"字），扇形尾羽。悬停高度同蝠妖。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *

MATS = [
    ("feather", (0.05, 0.05, 0.06, 1)),
    ("feather_light", (0.22, 0.23, 0.26, 1)),
    ("beak", (0.78, 0.6, 0.22, 1)),
    ("eye_red", (0.85, 0.08, 0.04, 1)),
    ("claw", (0.88, 0.85, 0.78, 1)),
]
mb = MB(MATS)
H = 1.7  # 悬停高度


def build_mesh():
    body = [(0, 0.34, H - 0.06), (0, 0.15, H), (0, -0.05, H + 0.03), (0, -0.2, H + 0.06)]
    mb.loft(body, [0.05, 0.13, 0.14, 0.1], [0.06, 0.14, 0.15, 0.11], 10, "feather", "body")
    mb.ellipsoid((0, -0.3, H + 0.12), (0.11, 0.12, 0.11), 10, 6, "feather", "head")
    mb.loft([(0, -0.38, H + 0.11), (0, -0.5, H + 0.08), (0, -0.62, H + 0.04)], [0.05, 0.03, 0.005], [0.04, 0.025, 0.005], 6, "beak", "head", cap0=False)
    for s in (1, -1):
        mb.ellipsoid((0.07 * s, -0.36, H + 0.16), (0.025, 0.02, 0.02), 6, 3, "eye_red", "head")
        mb.spike((0.03 * s, -0.24, H + 0.2), (0.3 * s, 0.8, 0.6), 0.16, 0.03, "feather", "head", flat=0.35)  # 冠羽
        for k in (-1, 1):
            mb.spike((0.06 * s + 0.02 * k, 0.12, H - 0.12), (0.2 * k, -0.3, -1), 0.12, 0.012, "claw", "body", flat=1.0, segs=3)
        t = "L" if s > 0 else "R"
        sh, el, wr = V((0.12 * s, -0.04, H + 0.06)), V((0.55 * s, 0.0, H + 0.12)), V((0.95 * s, 0.08, H + 0.06))
        mb.loft([sh, el], [0.05, 0.035], [0.04, 0.03], 6, "feather", "wing1_" + t)
        mb.loft([el, wr], [0.035, 0.022], [0.03, 0.02], 6, "feather", "wing2_" + t)
        tips = [V((1.12 * s, 0.3, H + 0.02)), V((1.0 * s, 0.52, H - 0.02)), V((0.62 * s, 0.6, H - 0.04))]
        rim = [sh, el, wr, tips[0], tips[1], tips[2], V((0.28 * s, 0.4, H - 0.04)), V((0.1 * s, 0.24, H - 0.04))]
        center = V((0.45 * s, 0.22, H + 0.03))

        def part_of(p, t=t, s=s):
            return "membrane_" + t

        mb.sheet([center] + rim, "feather_light", part_of, thick=0.016)
        # 翼缘一排长羽（初级飞羽在腕外、次级飞羽沿后缘）
        for i in range(6):
            u = i / 5
            base = wr.lerp(el, u * 0.9)
            d = V((0.35 * s * (1 - u), 1, -0.05)).normalized()
            mb.spike(base + V((0, 0.06, 0)), d, 0.42 - 0.12 * u, 0.06, "feather", "wing2_" + t if u < 0.5 else "wing1_" + t, flat=0.25)
    # 扇形尾羽
    for k in range(-2, 3):
        mb.spike((0.03 * k, 0.32, H - 0.05), (0.25 * k, 1, -0.15), 0.38, 0.06, "feather", "body", flat=0.25)

B = [
    ("root", (0, 0, 0), (0, 0.25, 0), None, False),
    ("body", (0, 0.3, H), (0, -0.15, H + 0.03), "root", True),
    ("head", (0, -0.15, H + 0.04), (0, -0.5, H + 0.06), "body", True),
]
PART_BONES = {}
for s, t in ((1, "L"), (-1, "R")):
    B += [
        ("wing1_" + t, (0.14 * s, -0.02, H + 0.06), (0.62 * s, 0.02, H + 0.14), "body", True),
        ("wing2_" + t, (0.62 * s, 0.02, H + 0.14), (1.08 * s, 0.1, H + 0.08), "wing1_" + t, True),
        ("wtip_" + t, (1.08 * s, 0.1, H + 0.08), (1.25 * s, 0.5, H), "wing2_" + t, True),
    ]
    PART_BONES["membrane_" + t] = ["body", "wing1_" + t, "wing2_" + t, "wtip_" + t]


# ---------------- 动画 ----------------
# 左翼指向 +X：绕 Y 轴正转 = 向下扇；右翼镜像取反。绕 Z 轴正转（左翼）= 向后收
def flap(P, t, period, amp=42, base=0.0, lag=0.5):
    a = 2 * math.pi * t / period
    for t_, s in (("L", 1), ("R", -1)):
        R(P, "wing1_" + t_, y=s * (base + amp * S(a)), z=s * 6 * S(a, 1.2))
        R(P, "wing2_" + t_, y=s * (amp * 0.6 * S(a, -lag)))
        R(P, "wtip_" + t_, y=s * (amp * 0.4 * S(a, -2 * lag)))
    P["off"] += V((0, 0, -0.1 * S(a, 0.4)))


def idle(t):
    P = P0()
    flap(P, t, 0.6)
    R(P, "head", x=4 * S(2 * math.pi * t / 1.2), z=8 * S(2 * math.pi * t / 2.4))
    return P


def run(t):
    P = P0()
    flap(P, t, 0.4, amp=48)
    R(P, "body", x=18)
    R(P, "head", x=-12)
    return P


def wings(**kw):
    """翅膀姿势：up 抬翅（度）、back 后收（度）"""
    up, back = kw.get("up", 0), kw.get("back", 0)
    out = {}
    for t, s in (("L", 1), ("R", -1)):
        out["wing1_" + t] = (0, -s * up, s * back)
        out["wing2_" + t] = (0, -s * up * 0.4, s * back * 0.6)
        out["wtip_" + t] = (0, 0, s * back * 0.3)
    return out


SWOOP = [
    (0.00, mkpose(None, **wings(up=10))),
    (0.28, mkpose(None, off=(0, 0.3, 0.35), body=(-25, 0, 0), head=(-10, 0, 0), **wings(up=65))),  # 拔高、举翅
    (0.40, mkpose(None, off=(0, -0.7, -1.05), body=(30, 0, 0), head=(10, 0, 0), **wings(up=-20, back=55))),  # 收翅俯冲
    (0.58, mkpose(None, off=(0, -1.3, -0.9), body=(10, 0, 0), **wings(up=-45, back=20))),  # 掠过
    (0.90, mkpose(None, **wings(up=10))),
]
BITE = [
    (0.00, mkpose(None, **wings(up=10))),
    (0.15, mkpose(None, off=(0, 0.15, 0.1), body=(-12, 0, 0), head=(-20, 0, 0), **wings(up=50))),
    (0.25, mkpose(None, off=(0, -0.35, -0.25), body=(20, 0, 0), head=(25, 0, 0), **wings(up=-35, back=10))),
    (0.50, mkpose(None, **wings(up=10))),
]
HIT = [
    (0.00, mkpose(None, **wings(up=10))),
    (0.08, mkpose(None, off=(0, 0.2, 0.15), body=(-25, 10, 0), head=(-20, 0, 0), **wings(up=70))),
    (0.35, mkpose(None, **wings(up=10))),
]
DIE = [
    (0.00, mkpose(None, **wings(up=10))),
    (0.20, mkpose(None, off=(0, 0.1, 0.1), body=(-30, 0, 0), head=(-30, 0, 0), **wings(up=70))),
    (0.70, mkpose(None, off=(0.1, 0.1, -1.45), body=(10, 70, 0), head=(20, 0, 0), **wings(up=-30, back=-10))),  # 坠地侧翻
    (1.00, mkpose(None, off=(0.15, 0.1, -1.52), body=(12, 78, 0), head=(26, 0, 0), **wings(up=-50, back=-15))),
]

build_mesh()
build_creature("crow", mb, B, PART_BONES, "body", [
    ("idle", idle, 0.6, True),
    ("run", run, 0.4, True),
    ("attack_swoop", keys_fn(SWOOP, lambda t, P: R(P, "head", z=0)), 0.9, False),
    ("attack_bite", keys_fn(BITE), 0.5, False),
    ("hit", keys_fn(HIT), 0.35, False),
    ("die", keys_fn(DIE), 1.0, False),
])
