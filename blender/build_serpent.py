# 墨途 · Boss「碧鳞水蟒」生成脚本（Blender 4.5，后台运行）
#   blender.exe -b --factory-startup --python blender/build_serpent.py
# 产出：assets/models/serpent.glb（网格 + 骨骼 + 10 段动画）
#
# 造型：深潭里的碧鳞水蟒——后半身在地上盘成一个大弧，前半身像眼镜蛇一样立起约 3.3 m，头朝前探；
#       背脊一排碧玉色鳍刺（scale_jade），腹甲浅色（belly），金色竖瞳（eye_gold）。
#       45° 俯视的剪影是"一个大 C 形盘身 + 立起的头颈"，和狼、石傀、蝠、藤都不一样。
# 动作：idle / run（蜿蜒）/ attack_bite / attack_tail（甩尾横扫）/ attack_spout（仰头喷水柱）/
#       dive（潜入地下）/ emerge（破水而出）/ roar（换护盾时怒吼）/ hit / die
# 约定：Z 向上，面向 -Y，左侧 +X，原点在盘身中心的地面。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import *

MATS = [
    ("scale_dark", (0.07, 0.17, 0.16, 1)),
    ("scale_jade", (0.18, 0.55, 0.45, 1)),
    ("belly", (0.75, 0.75, 0.62, 1)),
    ("eye_gold", (1.0, 0.75, 0.2, 1)),
    ("claw", (0.88, 0.85, 0.78, 1)),
]
mb = MB(MATS)

HIP = V((0, 0.55, 0.45))
# 前半身（立起）：从盘身接点向上、向前
FRONT = [HIP, V((0, 0.15, 0.62)), V((0, -0.28, 1.15)), V((0, -0.48, 1.85)), V((0, -0.5, 2.5)), V((0, -0.62, 3.0)), V((0, -0.95, 3.25))]
HEAD_TIP = V((0, -1.75, 3.12))
# 后半身（盘在地上）：向后绕到右侧再弯回前方
BACK = [HIP, V((0.55, 1.25, 0.43)), V((1.45, 1.65, 0.4)), V((2.35, 1.45, 0.37)), V((2.95, 0.75, 0.32)), V((3.05, -0.15, 0.27)), V((2.65, -0.95, 0.2)), V((1.95, -1.4, 0.14)), V((1.2, -1.5, 0.08))]
FR = [0.42, 0.45, 0.42, 0.38, 0.34, 0.31, 0.3]
BR = [0.42, 0.46, 0.45, 0.42, 0.37, 0.3, 0.22, 0.13, 0.04]


def build_mesh():
    segs = 12
    # 前半身：截面 u 取侧向（+X），v = t × u；sin < 0 一侧是腹面（立起时朝前）
    fp = catmull(FRONT, 3)
    fparts = ["front"] * len(fp)
    mb.loft(fp, interp(FR, len(fp)), interp([r * 0.92 for r in FR], len(fp)), segs, lambda i, j: "belly" if math.sin(2 * math.pi * j / segs) < -0.35 else "scale_dark", "front", ref=(1, 0, 0), cap0=False, cap1=False, parts=fparts)
    # 后半身：截面 u 取向上（+Z），cos < 0 一侧（向下）是腹面
    bp = catmull(BACK, 3)
    mb.loft(bp, interp([r * 0.92 for r in BR], len(bp)), interp(BR, len(bp)), segs, lambda i, j: "belly" if math.cos(2 * math.pi * j / segs) < -0.35 else "scale_dark", "back", ref=(0, 0, 1), cap0=False, cap1=True)
    # 接点：一个鼓包把两段放样的接缝包住
    mb.ellipsoid(HIP + V((0, 0, 0.02)), (0.5, 0.52, 0.47), 12, 7, "scale_dark", "hips")
    # 头：楔形长头，上颌 + 下颌，金色竖瞳，两根后弯的角
    d = nrm(HEAD_TIP - FRONT[-1])
    hc = FRONT[-1] + d * 0.35
    mb.loft([FRONT[-1] + d * -0.05, hc, FRONT[-1] + d * 0.62, HEAD_TIP], [0.32, 0.36, 0.27, 0.1], [0.24, 0.22, 0.16, 0.06], 10, "scale_dark", "head", ref=(1, 0, 0))
    jaw0 = FRONT[-1] + V((0, -0.05, -0.17))
    mb.loft([jaw0, jaw0 + d * 0.4 + V((0, 0, -0.03)), jaw0 + d * 0.72 + V((0, 0, 0.0))], [0.24, 0.2, 0.08], [0.08, 0.07, 0.04], 8, "belly", "jaw", ref=(1, 0, 0))
    for s in (1, -1):
        mb.ellipsoid(hc + V((0.27 * s, -0.08, 0.1)), (0.06, 0.1, 0.05), 8, 4, "eye_gold", "head")
        mb.ellipsoid(hc + V((0.31 * s, -0.09, 0.1)), (0.012, 0.06, 0.04), 4, 3, "scale_dark", "head")  # 竖瞳
        mb.spike(hc + V((0.2 * s, 0.12, 0.17)), (0.5 * s, 1, 0.6), 0.55, 0.07, "scale_jade", "head", flat=0.6, segs=5)  # 角
        mb.spike(hc + V((0.3 * s, 0.05, 0.0)), (1 * s, 0.6, -0.1), 0.28, 0.06, "scale_jade", "head", flat=0.35)  # 腮鳍
        mb.spike(FRONT[-1] + d * 0.75 + V((0.06 * s, 0, -0.12)), (0, 0, -1), 0.14, 0.022, "claw", "head", flat=1.0, segs=3)  # 毒牙
    # 背脊鳍刺：前半身沿背面（+Y 一侧），后半身沿顶面
    for i in range(1, len(fp) - 1, 2):
        p, t = fp[i], nrm(fp[i + 1] - fp[i - 1])
        u, w = frame_from(t, (1, 0, 0))
        r = interp(FR, len(fp))[i]
        mb.spike(p + w * r * 0.85, w * 1.0 - t * 0.6, 0.22 + 0.1 * (i / len(fp)), 0.07, "scale_jade", "front", flat=0.25, ref=t)
    for i in range(1, len(bp) - 3, 2):
        p, t = bp[i], nrm(bp[i + 1] - bp[i - 1])
        r = interp(BR, len(bp))[i]
        mb.spike(p + V((0, 0, r * 0.85)), V((0, 0, 1)) - t * 0.7, 0.18 + 0.12 * r, 0.06 + 0.04 * r, "scale_jade", "back", flat=0.25, ref=t)


def chain(pts, prefix, parent):
    out = []
    for i in range(len(pts) - 1):
        out.append(("%s%d" % (prefix, i + 1), pts[i], pts[i + 1], parent if i == 0 else "%s%d" % (prefix, i), True))
    return out


B = [("root", (0, 0, 0), (0, 0.25, 0), None, False), ("hips", HIP, HIP + V((0, 0, 0.35)), "root", True)]
B += chain(FRONT, "f", "hips")  # f1..f6
B += [("head", FRONT[-1], FRONT[-1] + (HEAD_TIP - FRONT[-1]) * 0.8, "f%d" % (len(FRONT) - 1), True),
      ("jaw", FRONT[-1] + V((0, -0.05, -0.17)), FRONT[-1] + V((0, -0.05, -0.17)) + (HEAD_TIP - FRONT[-1]) * 0.65, "head", True)]
B += chain(BACK, "t", "hips")  # t1..t8
NF, NT = len(FRONT) - 1, len(BACK) - 1
PART_BONES = {
    "front": ["hips"] + ["f%d" % (i + 1) for i in range(NF)],
    "back": ["hips"] + ["t%d" % (i + 1) for i in range(NT)],
    "hips": ["hips", "f1", "t1"],
    "head": ["head"],
    "jaw": ["jaw"],
}


# ---------------- 动画 ----------------
def front(P, x=0, z=0, falloff=1.0):
    """前半身整体俯仰 / 偏转：x > 0 前倾（低头），分摊到每节"""
    for i in range(NF):
        k = falloff ** i
        R(P, "f%d" % (i + 1), x=x * k / NF * 2 * (0.5 + i / NF), z=z / NF)


def slither(P, t, period, amp=10, lag=0.8, base_amp=1.0):
    a = 2 * math.pi * t / period
    for i in range(NT):
        R(P, "t%d" % (i + 1), z=amp * base_amp * (0.5 + 0.12 * i) * S(a, -lag * i))
    for i in range(NF):
        R(P, "f%d" % (i + 1), z=amp * 0.35 * S(a, lag * (i + 1)), y=amp * 0.2 * S(a, lag * i))


def idle(t):
    P = P0()
    slither(P, t, 3.0, amp=4)
    a = 2 * math.pi * t / 3.0
    R(P, "head", x=4 * S(a, 1.5), z=6 * S(a * 0.5))
    R(P, "jaw", x=3 + 3 * max(0, S(a * 2)))
    return P


def run(t):
    P = P0()
    slither(P, t, 1.2, amp=12)
    front(P, x=10)
    R(P, "head", x=-10)
    return P


BITE = [
    (0.00, mkpose()),
    (0.30, add_pose(mkpose(off=(0, 0.25, 0), head=(-15, 0, 0), jaw=(10, 0, 0)), (lambda P: (front(P, x=-18), P)[1])(P0()))),  # 后缩蓄势
    (0.40, add_pose(mkpose(off=(0, -0.7, -0.1), head=(25, 0, 0), jaw=(45, 0, 0)), (lambda P: (front(P, x=34), P)[1])(P0()))),  # 前扑张口
    (0.50, add_pose(mkpose(off=(0, -0.7, -0.1), head=(28, 0, 0), jaw=(2, 0, 0)), (lambda P: (front(P, x=34), P)[1])(P0()))),  # 咬合
    (0.90, mkpose()),
]


def tail_pose(z, front_z=0):
    P = P0()
    for i in range(NT):
        R(P, "t%d" % (i + 1), z=z * (1.0 if i == 0 else 0.25))
    front(P, z=front_z)
    return P


TAIL = [
    (0.00, mkpose()),
    (0.32, add_pose(tail_pose(35, -25), mkpose(head=(0, 0, 20)))),  # 尾巴后拉
    (0.45, add_pose(tail_pose(-120, 25), mkpose(head=(0, 0, -15)))),  # 横扫到身前
    (0.65, add_pose(tail_pose(-130, 20), mkpose(head=(0, 0, -15)))),
    (1.00, mkpose()),
]


def fr(x, z=0, **kw):
    P = mkpose(**kw)
    front(P, x=x, z=z)
    return P


SPOUT = [
    (0.00, mkpose()),
    (0.40, fr(-14, off=(0, 0.2, 0.15), head=(-40, 0, 0), jaw=(30, 0, 0))),  # 仰头蓄水
    (0.60, fr(18, off=(0, -0.3, 0), head=(30, 0, 0), jaw=(40, 0, 0))),  # 喷出
    (0.85, fr(16, off=(0, -0.3, 0), head=(26, 0, 0), jaw=(35, 0, 0))),
    (1.20, mkpose()),
]
DIVE = [
    (0.00, mkpose()),
    (0.30, fr(-10, off=(0, 0.1, 0.1), head=(-20, 0, 0))),
    (0.90, fr(55, off=(0, -0.4, -3.7), head=(30, 0, 0))),  # 一头扎进地下
    (1.00, fr(55, off=(0, -0.4, -3.8), head=(30, 0, 0))),
]
EMERGE = [
    (0.00, fr(-20, off=(0, 0, -3.8), head=(-30, 0, 0), jaw=(30, 0, 0))),
    (0.18, fr(-24, off=(0, 0, 0.25), head=(-35, 0, 0), jaw=(45, 0, 0))),  # 破水而出
    (0.45, fr(8, off=(0, -0.2, 0), head=(12, 0, 0), jaw=(10, 0, 0))),
    (1.00, mkpose()),
]
ROAR = [
    (0.00, mkpose()),
    (0.30, fr(-16, off=(0, 0.15, 0.15), head=(-38, 0, 0), jaw=(50, 0, 0))),
    (0.85, fr(-18, off=(0, 0.15, 0.15), head=(-36, 0, 8), jaw=(52, 0, 0))),
    (1.20, mkpose()),
]
HIT = [
    (0.00, mkpose()),
    (0.08, fr(-14, off=(0, 0.2, 0), head=(-18, 0, 10), jaw=(15, 0, 0))),
    (0.40, mkpose()),
]
DIE = [
    (0.00, mkpose()),
    (0.35, fr(-18, head=(-30, 0, 0), jaw=(40, 0, 0))),
    (1.20, fr(70, z=20, off=(0, -0.3, -0.25), head=(10, 0, 20), jaw=(20, 0, 0))),  # 前半身轰然倒地
    (1.60, fr(74, z=22, off=(0, -0.3, -0.3), head=(14, 0, 24), jaw=(25, 0, 0))),
]

build_mesh()
build_creature("serpent", mb, B, PART_BONES, "hips", [
    ("idle", idle, 3.0, True),
    ("run", run, 1.2, True),
    ("attack_bite", keys_fn(BITE), 0.9, False),
    ("attack_tail", keys_fn(TAIL), 1.0, False),
    ("attack_spout", keys_fn(SPOUT), 1.2, False),
    ("dive", keys_fn(DIVE), 1.0, False),
    ("emerge", keys_fn(EMERGE), 1.0, False),
    ("roar", keys_fn(ROAR), 1.2, False),
    ("hit", keys_fn(HIT), 0.4, False),
    ("die", keys_fn(DIE), 1.6, False),
])
