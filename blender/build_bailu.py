# 墨途 · 散修「白鹭」生成脚本（Blender 4.5，后台运行）
#   blender.exe -b --factory-startup --python blender/build_bailu.py
# 产出：assets/models/bailu.glb（网格 + 骨骼 + 4 段动画 idle / run / talk / wave）
#       assets/previews/bailu_front.png / bailu_side.png / bailu_back.png / bailu_topdown45.png / bailu_poses.png
#
# 复用 build_hero.py 的网格工具、骨骼、IK 与次级动态（读入源码执行，不改动原文件），只替换：
#   材质（月白 + 石青）、体形（更窄的肩腰、长裙）、发型（高马尾，用飘带骨骼驱动）、剑（负于背后，绑在 chest 上）、
#   右手不再持剑（hand_R 改为随前臂 + 旋转），动作改为 NPC 用的待机 / 跑 / 说话 / 招手。
# 坐标约定与主角相同：Z 向上，面向 -Y，左侧 +X；骨骼按主角身高搭建，游戏中整体缩放 0.95（约 1.66 m）。

import bpy
import math
import os
import time
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
HERO = os.path.join(HERE, "build_hero.py")

# ---- 读入主角脚本作为工具库 ----
src = open(HERO, encoding="utf-8").read()
PATCHES = [
    ("\nmain()\n", "\n"),
    ('elif n == "hand_R":', 'elif n == "hand_R" and HAND_R_IK:'),
    ('"shoulder_R", "hand_L")}', '"shoulder_R", "hand_L", "hand_R")}'),
]
for a, b in PATCHES:
    assert src.count(a) == 1, "build_hero.py 结构变了，找不到：" + a
    src = src.replace(a, b)
H = {"__file__": HERO, "__name__": "hero_lib"}
exec(compile(src, HERO, "exec"), H)
H["HAND_R_IK"] = False
H["OUT_GLB"] = os.path.join(ROOT, "assets", "models", "bailu.glb")
H["OUT_BLEND"] = os.path.join(ROOT, "work", "bailu_build.blend")

V = Vector
mb, loft, ellipsoid, thick_panel, catmull, basis_z, lerp, nrm = (H[k] for k in ("mb", "loft", "ellipsoid", "thick_panel", "catmull", "basis_z", "lerp", "nrm"))
pose, spline = H["pose"], H["spline"]
T0 = time.time()

# ---- 材质：月白（外衣）+ 石青（领缘、罩裙、腰封、发带、护腕），墨发；游戏按名称映射调色 ----
MATS = [
    ("bl_moon", (0.80, 0.86, 0.88, 1), 0.0, 0.8),
    ("bl_inner", (0.60, 0.66, 0.69, 1), 0.0, 0.8),
    ("bl_qing", (0.10, 0.30, 0.42, 1), 0.0, 0.7),
    ("bl_qing_dark", (0.05, 0.14, 0.20, 1), 0.0, 0.7),
    ("bl_skin", (0.93, 0.80, 0.71, 1), 0.0, 0.6),
    ("bl_hair", (0.025, 0.025, 0.03, 1), 0.0, 0.5),
    ("bl_ribbon", (0.12, 0.40, 0.55, 1), 0.0, 0.6),
    ("bl_boots", (0.06, 0.07, 0.08, 1), 0.0, 0.6),
    ("bl_silver", (0.78, 0.80, 0.82, 1), 0.9, 0.25),
    ("bl_hilt", (0.16, 0.11, 0.07, 1), 0.2, 0.5),
    ("bl_scabbard", (0.06, 0.12, 0.16, 1), 0.2, 0.5),
]
H["MATS"] = MATS
H["MAT_INDEX"] = {m[0]: i for i, m in enumerate(MATS)}

# ---- 体形：肩窄、腰细 ----
H["SH_X"] = 0.172
H["HIP_X"] = 0.088
H["TORSO"] = [(0.95, 0.140, 0.104), (1.05, 0.128, 0.098), (1.12, 0.126, 0.098), (1.2, 0.142, 0.11), (1.27, 0.158, 0.124), (1.33, 0.163, 0.112),
              (1.39, 0.152, 0.088), (1.44, 0.10, 0.066), (1.47, 0.062, 0.054)]
H["PART_BONES"]["back"] = ["chest"]
arm_pts, torso_surf, KNEE = H["arm_pts"], H["torso_surf"], H["KNEE"]

# 马尾中心线（同时是 ribbon1~4 骨骼），避开碰撞球
TAIL = [V((0, 0.085, 1.75)), V((0, 0.15, 1.62)), V((0, 0.19, 1.46)), V((0, 0.205, 1.30)), V((0, 0.2, 1.13))]


def build_mesh():
    # ---- 头部 ----
    ellipsoid((0, -0.004, 1.603), (0.102, 0.112, 0.132), 18, 12, "bl_skin", "head")
    ellipsoid((0, 0.006, 1.612), (0.109, 0.12, 0.139), 20, 14, "bl_hair", "head",
              keep=lambda n: n.z > 0.2 or (n.y > -0.2 and n.z > -0.4) or (n.y > 0.3 and n.z > -0.75) or (n.y > -0.62 and n.z > 0.02))
    # 刘海：额前斜分的一片
    loft(catmull([V((0.07, -0.1, 1.71)), V((0.02, -0.118, 1.68)), V((-0.04, -0.115, 1.655)), V((-0.085, -0.095, 1.63))], 2),
         [0.012, 0.016, 0.014, 0.006, 0.004, 0.003, 0.002], 0.006, 5, "bl_hair", "head", ref=(0, 0, 1), cap0=True, cap1=True)
    # 鬓发两缕（比主角长，垂到锁骨）
    for s in (1, -1):
        loft([(0.094 * s, -0.052, 1.66), (0.1 * s, -0.062, 1.56), (0.094 * s, -0.064, 1.47), (0.088 * s, -0.058, 1.41)],
             [0.013, 0.012, 0.009, 0.003], [0.009, 0.008, 0.006, 0.003], 6, "bl_hair", "head", ref=(1, 0, 0), cap0=True, cap1=True)
    # 高马尾：发根 + 发束
    ellipsoid((0, 0.06, 1.75), (0.042, 0.046, 0.044), 12, 8, "bl_hair", "head")
    loft([(0, 0.045, 1.752), (0, 0.095, 1.752)], 0.03, 0.03, 10, "bl_ribbon", "head", ref=(1, 0, 0), cap0=True, cap1=True)
    cur = catmull(TAIL, 3)
    k = len(cur) - 1
    loft(cur, [lerp(0.04, 0.012, (i / k) ** 1.3) for i in range(k + 1)], [lerp(0.032, 0.008, i / k) for i in range(k + 1)], 8, "bl_hair", "ribbon",
         ref=(1, 0, 0), cap0=True, cap1=True)
    # 石青发带两条，从发结垂到肩胛
    for s in (1, -1):
        pts = [p + V((s * (0.022 + 0.02 * i), 0.012, 0)) for i, p in enumerate(TAIL[:3])]
        c2 = catmull(pts, 3)
        loft(c2, [lerp(0.016, 0.022, i / (len(c2) - 1)) for i in range(len(c2))], 0.0026, 5, "bl_ribbon", "ribbon", ref=(1, 0, 0), cap0=True, cap1=True)
    # 银簪：横插在发结上
    loft([(0.075, 0.07, 1.775), (-0.08, 0.055, 1.765)], 0.004, 0.004, 5, "bl_silver", "head", ref=(0, 0, 1), cap0=True, cap1=True)
    ellipsoid((0.083, 0.071, 1.777), (0.011, 0.011, 0.011), 6, 4, "bl_silver", "head")
    # 眉眼
    for s in (1, -1):
        ellipsoid((0.04 * s, -0.103, 1.597), (0.016, 0.006, 0.0095), 8, 4, "bl_hair", "head",
                  basis=basis_z(V((0.25 * s, -1, 0)), hint=(0, 0, 1)) @ Matrix(((1, 0, 0), (0, 0, 1), (0, 1, 0))))
        loft([(0.02 * s, -0.108, 1.627), (0.043 * s, -0.104, 1.634), (0.064 * s, -0.093, 1.63)], 0.003, [0.003, 0.0045, 0.0015], 4,
             "bl_hair", "head", ref=(0, -1, 0), cap0=True, cap1=True)
    loft([(0, 0.0, 1.40), (0, 0.0, 1.47), (0, 0.0, 1.53)], 0.04, 0.039, 10, "bl_skin", "neck", ref=(1, 0, 0))

    # ---- 上身：月白交领短衣，石青领缘 ----
    TORSO = H["TORSO"]
    loft([(0, 0, z) for z, _, _ in TORSO], [r[1] for r in TORSO], [r[2] for r in TORSO], 18, "bl_moon", "torso", ref=(1, 0, 0), cap0=True, cap1=True)
    for lap, off, w in (([(0.032, 1.452), (0.0, 1.37), (-0.05, 1.27), (-0.088, 1.17), (-0.11, 1.07)], 0.004, 0.024),
                        ([(-0.032, 1.452), (-0.01, 1.40), (0.004, 1.355)], 0.002, 0.02)):
        pts, refs = [], []
        for q in catmull([V((x, 0, z)) for x, z in lap], 3):
            p, n = torso_surf(q[0], q[2], off)
            pts.append(p)
            refs.append(n)
        loft(pts, 0.0045, w, 4, "bl_qing", "torso", ref=refs, cap0=True, cap1=True, phase=45)
    loft([(0, 0.005, 1.43), (0, 0.005, 1.47)], 0.062, 0.058, 14, "bl_qing", "torso", ref=(1, 0, 0))

    # ---- 腰封（石青）+ 垂带 + 玉环 ----
    loft([(0, 0, 0.95), (0, 0, 1.02), (0, 0, 1.09)], [0.15, 0.143, 0.136], [0.116, 0.11, 0.104], 18, "bl_qing", "sash", ref=(1, 0, 0), cap0=True, cap1=True)
    for k2, (dx, ln) in enumerate(((0.035, 0.42), (0.06, 0.36))):
        a = V((dx, -0.118, 1.0))
        b = a + V((0.01 + 0.01 * k2, -0.03, -ln))
        loft(catmull([a, (a + b) / 2 + V((0, -0.014, 0)), b], 3), 0.004, [0.016] * 6 + [0.02], 4, "bl_qing_dark", "sash_end", ref=(0, -1, 0), cap0=True,
             cap1=True, phase=45)
    loft([(0.045, -0.122, 0.93), (0.045, -0.122, 0.91)], 0.022, 0.022, 10, "bl_silver", "sash_end", ref=(0, -1, 0), cap0=True, cap1=True)

    # ---- 长裙（月白）到脚踝，外罩一层石青短罩裙 ----
    zl = [lerp(1.0, 0.07, i / 11) for i in range(12)]
    span = lambda z: 100.0 if z >= 0.5 else lerp(88.0, 100.0, (z - 0.07) / 0.43)
    rxf = lambda z: 0.138 + (1.0 - z) * 0.13
    ryf = lambda z: 0.104 + (1.0 - z) * 0.13
    thick_panel(zl, rxf, ryf, lambda z: (-90 - span(z), -90 + span(z)), 12, 0.01, "bl_moon", "skirt_f", lambda z: V((0, -0.004, z)))
    thick_panel(zl, lambda z: rxf(z) * 0.965, lambda z: ryf(z) * 0.965, lambda z: (90 - span(z), 90 + span(z)), 12, 0.01, "bl_moon", "skirt_b",
                lambda z: V((0, 0.004, z)))
    # 裙摆石青缘边
    zo = [0.17, 0.12, 0.068]
    thick_panel(zo, lambda z: rxf(z) + 0.006, lambda z: ryf(z) + 0.006, lambda z: (-90 - span(z), -90 + span(z)), 12, 0.008, "bl_qing", "skirt_f",
                lambda z: V((0, -0.004, z)))
    thick_panel(zo, lambda z: rxf(z) * 0.965 + 0.006, lambda z: ryf(z) * 0.965 + 0.006, lambda z: (90 - span(z), 90 + span(z)), 12, 0.008, "bl_qing",
                "skirt_b", lambda z: V((0, 0.004, z)))

    # ---- 腿（大多藏在裙内）+ 靴 ----
    for s, tag in ((1, "L"), (-1, "R")):
        loft([(0.088 * s, 0, 0.93), (0.092 * s, -0.004, 0.70), KNEE(s), (0.1 * s, -0.004, 0.31)], [0.075, 0.066, 0.054, 0.05], [0.075, 0.066, 0.054, 0.05], 8,
             "bl_inner", "leg_" + tag, ref=(1, 0, 0), cap0=True, cap1=True)
        loft([(0.1 * s, -0.004, 0.33), (0.1 * s, -0.002, 0.2), (0.1 * s, 0.0, 0.08)], [0.053, 0.05, 0.048], [0.053, 0.05, 0.048], 8, "bl_boots", "boot_" + tag,
             ref=(1, 0, 0), cap0=True, cap1=True)
        loft([(0.1 * s, 0.05, 0.05), (0.1 * s, -0.01, 0.05), (0.1 * s, -0.1, 0.04), (0.1 * s, -0.16, 0.028)], [0.044, 0.046, 0.035, 0.016],
             [0.045, 0.052, 0.048, 0.026], 8, "bl_boots", "foot_" + tag, ref=(0, 0, 1), cap0=True, cap1=True)

    # ---- 手臂：收口窄袖 + 石青护腕 + 手 ----
    hcs = {}
    for s, tag in ((1, "L"), (-1, "R")):
        d, S, E, W = arm_pts(s)
        dd = nrm(V((0, 0, -1)) - d * V((0, 0, -1)).dot(d))
        ls = [0.02, 0.09, 0.2, 0.3, 0.37]
        droop = [0.0, 0.003, 0.008, 0.016, 0.024]
        rh = [0.05, 0.054, 0.062, 0.07, 0.076]
        rw = [0.052, 0.054, 0.058, 0.062, 0.066]
        cs = [S + d * l + dd * dr for l, dr in zip(ls, droop)]
        loft(cs, rh, rw, 12, "bl_moon", "sleeve_" + tag, ref=dd, cap0=True, cap1=False)
        loft([cs[-1] - d * 0.004, cs[-1] + d * 0.002], [rh[-1] - 0.005] * 2, [rw[-1] - 0.005] * 2, 12, "bl_inner", "sleeve_" + tag, ref=dd)
        loft([S + d * 0.35, S + d * 0.43, W + d * 0.01], [0.042, 0.04, 0.036], [0.042, 0.04, 0.036], 10, "bl_qing", "wrist_" + tag, ref=dd, cap0=True, cap1=True)
        hc = W + d * 0.05
        hcs[tag] = hc
        ellipsoid(hc, (0.037, 0.031, 0.056), 10, 8, "bl_skin", "hand_" + tag, basis=basis_z(d, hint=(0, 1, 0)))
        ellipsoid(hc + V((0, -0.035, 0.0)) + d * -0.01, (0.014, 0.014, 0.027), 8, 5, "bl_skin", "hand_" + tag, basis=basis_z(d * 0.6 + V((0, -1, 0)) * 0.8, hint=(0, 0, 1)))

    # ---- 背剑：剑柄在右肩后上方，剑鞘斜向左腰（随 chest）----
    top = V((-0.15, 0.165, 1.56))
    tip = V((0.19, 0.17, 0.82))
    ax = nrm(tip - top)
    side = V((0, 1, 0))
    loft([top - ax * 0.17, top - ax * 0.02], 0.0135, 0.0135, 8, "bl_hilt", "back", ref=side, cap0=True, cap1=True)
    ellipsoid(top - ax * 0.185, (0.02, 0.02, 0.02), 8, 6, "bl_silver", "back")
    loft([top - ax * 0.02, top + ax * 0.0], 0.05, 0.016, 6, "bl_silver", "back", ref=V((1, 0, 0)), cap0=True, cap1=True)
    sc = [top + ax * l for l in (0.0, 0.25, 0.55, 0.78)]
    loft(sc, [0.024, 0.023, 0.022, 0.016], [0.011, 0.011, 0.01, 0.008], 8, "bl_scabbard", "back", ref=V((1, 0, 0)), cap0=True, cap1=True)
    for l in (0.12, 0.6):
        p = top + ax * l
        loft([p - ax * 0.012, p + ax * 0.012], 0.027, 0.014, 8, "bl_silver", "back", ref=V((1, 0, 0)), cap0=True, cap1=True)
    # 剑穗（石青）垂在剑首下
    P = top - ax * 0.2
    loft([P + V((0, 0.005, 0)), P + V((0, 0.02, -0.06)), P + V((0, 0.03, -0.12))], [0.006, 0.014, 0.02], [0.006, 0.014, 0.02], 6, "bl_ribbon", "back",
         ref=(1, 0, 0), cap0=True, cap1=True)
    # 背带：从右肩斜到左腰
    strap = [torso_surf(x, z, 0.006) for x, z in ((-0.11, 1.38), (-0.02, 1.27), (0.06, 1.15), (0.11, 1.07))]
    loft([V((p.x, -p.y, p.z)) for p, _ in strap], 0.004, 0.014, 4, "bl_qing_dark", "torso", ref=[V((n.x, -n.y, n.z)) for _, n in strap], cap0=True, cap1=True, phase=45)
    hc = hcs["R"]
    return hc, hc - V((0, -1, 0)) * 0.15, TAIL


H["build_mesh"] = build_mesh


# ---- 动作 ----
def stand(t, per=2.4):
    ph = 2 * math.pi * t / per
    br = math.sin(ph)
    return pose(
        hips_off=(0.004 * math.sin(ph + 0.6), 0, -0.02 + 0.005 * br),
        rot={"hips": (0, 0, -4), "spine": (2, 0, 0), "chest": (1 + 1.4 * br, 0, 3), "neck": (-2, 0, 0), "head": (-4 + 0.8 * math.sin(ph + 0.4), 0, -4),
             "hand_L": (0, 0, -6), "hand_R": (0, 0, 6)},
        hand_R={"w": (-0.215, -0.01, 0.89 + 0.004 * br), "pole": (-0.3, 0.6, 0.2)},
        hand_L={"w": (0.215, -0.01, 0.89 + 0.004 * br), "pole": (0.3, 0.6, 0.2)},
        foot_L={"a": (0.085, -0.03, 0.09), "r": (0, 0, 6), "pole": (0, -1, 0.1)},
        foot_R={"a": (-0.09, 0.035, 0.09), "r": (0, 0, -10), "pole": (0, -1, 0.1)},
        wind=(0.25 * math.sin(ph * 0.5), 0.5, 0),
    )


def idle(t):
    return stand(t)


def talk(t):
    ph = 2 * math.pi * t / 2.4
    P = stand(t)
    g = math.sin(ph * 2)
    P = pose(P, rot={"chest": (1, 0, 6 + 2 * math.sin(ph)), "head": (-3 - 4 * max(0.0, math.sin(ph * 2 + 0.5)), 0, -7 + 4 * math.sin(ph)),
                     "hand_L": (-20, 0, -20 + 8 * g)},
             hand_L={"w": (0.15 + 0.03 * math.sin(ph), -0.25, 1.13 + 0.03 * g), "pole": (0.7, 0.4, -0.5)},
             hand_R={"w": (-0.2, 0.03, 0.99), "pole": (-0.9, 0.35, 0.05)})
    return P


def wave(t):
    ph = 2 * math.pi * t / 1.2
    P = stand(t)
    return pose(P, rot={"chest": (0, 0, -4), "head": (-3, 0, 6 + 2 * math.sin(ph)), "hand_R": (0, 25 * math.sin(ph), 0)},
                hand_R={"w": (-0.31 + 0.07 * math.sin(ph), -0.12, 1.62), "pole": (-0.75, 0.3, -0.6)})


hero_run = H["run"]


def run(t):
    ph = 2 * math.pi * t / 0.7
    s = math.sin(ph)
    P = hero_run(t)
    return pose(P, rot={"hand_R": (0, 0, 0)},
                hand_R={"w": (-0.23, -0.2 * s - 0.04, 1.03 + 0.05 * abs(s)), "pole": (-0.3, 0.8, -0.2)},
                hand_L={"w": (0.23, 0.2 * s - 0.04, 1.03 + 0.05 * abs(s)), "pole": (0.3, 0.8, -0.2)})


def bake_all(rig):
    for name, fn, dur in (("idle", idle, 2.4), ("run", run, 0.7), ("talk", talk, 2.4), ("wave", wave, 1.2)):
        H["bake_action"](rig, name, fn, dur, True)


def render_previews():
    import numpy as np

    GLB = H["OUT_GLB"]
    OUT = os.path.join(ROOT, "assets", "previews")
    TMP = os.path.join(ROOT, "work", "bailu_tmp")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=GLB)
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    meshes = [o for o in scene.objects if o.type == "MESH" and o.parent == arm]
    print("[verify] tris", sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes))
    acts = {a.name: a for a in bpy.data.actions}
    print("[verify] actions", sorted(acts))

    def set_pose(name, frame):
        ad = arm.animation_data or arm.animation_data_create()
        for tr in ad.nla_tracks:
            tr.mute = True
        ad.action = next(a for k, a in acts.items() if k == name or k.startswith(name + "_") or k.startswith(name + "."))
        if hasattr(ad, "action_slot") and ad.action_slot is None and len(ad.action.slots):
            ad.action_slot = ad.action.slots[0]
        scene.frame_set(int(frame))

    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_object_outline = True
    sh.object_outline_color = (0.05, 0.05, 0.05)
    sh.show_cavity = True
    sh.cavity_type = "WORLD"
    world = bpy.data.worlds.new("paper")
    world.color = (0.93, 0.9, 0.83)
    scene.world = world
    scene.display.render_aa = "8"
    scene.view_settings.view_transform = "Standard"
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def look(pos, target):
        cam.location = Vector(pos)
        cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()

    def render(path, w, h):
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = w, h, 100
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

    set_pose("idle", 0)
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.05
    for name, pos in (("front", (0, -6, 0.92)), ("side", (6, 0, 0.92)), ("back", (0, 6, 0.92))):
        look(pos, (0, 0, 0.92))
        render(os.path.join(OUT, "bailu_%s.png" % name), 600, 900)
    cam_data.type = "PERSP"
    cam_data.lens = 85
    h = 4.6
    az = math.radians(-120)
    look((h * math.cos(az), h * math.sin(az), 0.85 + h), (0, 0, 0.85))
    render(os.path.join(OUT, "bailu_topdown45.png"), 800, 800)

    cam_data.lens = 70
    az = math.radians(-115)
    look((5.0 * math.cos(az), 5.0 * math.sin(az), 2.2), (0, 0, 0.95))
    W, Hh = 360, 520
    tiles = []
    poses = [("idle", 0), ("run", 4), ("run", 14), ("talk", 18), ("talk", 54), ("wave", 9), ("wave", 27)]
    for i, (a, f) in enumerate(poses):
        set_pose(a, f)
        p = os.path.join(TMP, "pose_%d.png" % i)
        render(p, W, Hh)
        img = bpy.data.images.load(p)
        px = np.empty(W * Hh * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        tiles.append(px.reshape(Hh, W, 4))
        bpy.data.images.remove(img)
    st = np.concatenate(tiles, axis=1)
    out = bpy.data.images.new("bailu_poses", st.shape[1], st.shape[0], alpha=False)
    out.pixels.foreach_set(st.ravel())
    out.filepath_raw = os.path.join(OUT, "bailu_poses.png")
    out.file_format = "PNG"
    out.save()
    print("[render] done")


def main():
    hc, tp, rib = build_mesh()
    bones = H["define_bones"](hc, tp, rib)
    weights = H["compute_weights"](bones)
    tris = sum(len(f) - 2 for f in mb.f)
    print("[bailu] verts %d, tris %d" % (len(mb.v), tris))
    assert tris <= 8000, "超出 8k 三角面"
    obj, arm = H["make_objects"](bones, weights)
    obj.name, arm.name = "bailu", "bailu_rig"
    rig = H["Rig"](arm, bones)
    # 马尾比主角的发带更重、更挺
    rig.chains["ribbon"].update(damp=0.88, stiff=0.03, grav=1.0, wind=0.7)
    bake_all(rig)
    H["export"](obj, arm)
    os.makedirs(os.path.dirname(H["OUT_BLEND"]), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=H["OUT_BLEND"])
    print("[bailu] built in %.1fs" % (time.time() - T0))
    render_previews()


main()
