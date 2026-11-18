# 墨途 · 青牙狼谷场景件生成脚本（Blender 4.5，后台运行；静态网格，无骨骼无动画）
#   blender.exe -b --factory-startup --python blender/build_wolfvalley.py
#   blender.exe -b --factory-startup --python blender/render_props.py
# 产出：assets/models/props/<id>.glb（每个状态一个文件，完好态与破损态同一原点，关卡直接替换节点）
#   wolf_king_rock 狼王石 · fang_pillar / fang_pillar_broken 狼牙石柱 · wolf_totem / wolf_totem_fallen 狼骨图腾 · wolf_rock 狼岩 · mist_gate 墨雾门石桩
# 设计依据：docs/design/boss_青牙_v2.md §3.1、§9.3；接口与关卡设计约定（src/world/markers.js swapPropModel，2026-11-17）：
#   原点在底面中心、单位米；Blender 里 Z 向上、正面朝 -Y → glTF +Y 向上、正面朝 +Z。墨雾门门洞沿本地 X。
#   材质名 = 与关卡的契约（按前缀换成 toon 三平面笔刷材质，这里的颜色只用于预览）：
#   rock_ink 深墨石 · rock_pale 石面受光 / 断面 · bone 骨白 · cloth_banner 破布幡 · rope 草绳 · totem_glow 图腾青焰部件（平时暗，setLit 调亮）
# 造型原则：45° 俯视看剪影（狼牙 = 弯尖、图腾 = 头骨 + 横幡、狼王石 = 平顶卧台）；石头用"上面受光淡、侧面深"两种材质做皴擦感。
import bpy
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_creature import MB, V, nrm, catmull, interp, lerp, ROOT  # noqa: E402

OUT = os.path.join(ROOT, "assets", "models", "props")
MATS = [
    ("rock_ink", (0.43, 0.4, 0.36, 1)),
    ("rock_pale", (0.66, 0.65, 0.61, 1)),
    ("bone", (0.85, 0.82, 0.75, 1)),
    ("cloth_banner", (0.54, 0.48, 0.41, 1)),
    ("rope", (0.42, 0.35, 0.27, 1)),
    ("totem_glow", (0.37, 0.84, 0.78, 1)),
    ("straw", (0.62, 0.53, 0.36, 1)),
]


def rock(mb, center, radii, seed, segs=9, rings=5, top=None, bottom=0.0, jag=0.16, pale_up=0.55, mat_side="rock_ink", mat_top="rock_pale"):
    """低面数石块：椭球按随机半径起伏，top 以上压平（平顶），bottom 以下压平（贴地）；朝上的面用受光材质"""
    r = random.Random(seed)
    c = V(center)
    rows = []
    for i in range(rings + 1):
        ph = math.pi * i / rings
        row = []
        for j in range(segs if 0 < i < rings else 1):
            th = 2 * math.pi * j / segs + (0.5 if i % 2 else 0) * 2 * math.pi / segs
            k = 1 + r.uniform(-jag, jag)
            p = c + V((radii[0] * math.sin(ph) * math.cos(th) * k, radii[1] * math.sin(ph) * math.sin(th) * k, radii[2] * math.cos(ph) * (1 + r.uniform(-jag, jag) * 0.6)))
            if top is not None and p.z > top:
                p.z = top + (p.z - top) * 0.08
            if p.z < bottom:
                p.z = bottom
            row.append(p)
        rows.append(row)
    idx = [[mb.vert(p, "p") for p in row] for row in rows]

    def F(ids):
        pts = [mb.v[i] for i in ids]
        n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        m = mat_top if n.length > 1e-9 and n.normalized().z > pale_up else mat_side
        mb.face(ids, m)

    for j in range(segs):
        j2 = (j + 1) % segs
        F((idx[0][0], idx[1][j2], idx[1][j]))
        F((idx[rings][0], idx[rings - 1][j], idx[rings - 1][j2]))
    for i in range(1, rings - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            F((idx[i][j], idx[i][j2], idx[i + 1][j2], idx[i + 1][j]))


def fang(mb, base, h, r, bend, seed, segs=7, mat_tip="rock_pale", cut=None):
    """狼牙形石柱：沿弯曲中线放样、截面逐渐收尖；上段用受光材质（像牙尖）；cut = 截断高度比（残桩），断面参差"""
    rr = random.Random(seed)
    n = 8
    cl = []
    for i in range(n):
        u = i / (n - 1)
        cl.append(V(base) + V((bend * u * u, 0.15 * bend * u * u, h * u)))
    if cut is not None:
        m = max(2, int(round(cut * (n - 1))) + 1)
        cl = cl[:m]
    rad = [r * (1 - (i / (n - 1)) ** 1.15) + 0.02 for i in range(len(cl))]
    if cut is not None:
        rad[-1] = rad[-2] * 0.92
    rings = []
    for i, c in enumerate(cl):
        t = cl[min(i + 1, len(cl) - 1)] - cl[max(i - 1, 0)]
        u = nrm(V((1, 0, 0)) - nrm(t) * nrm(t).x)
        w = nrm(t).cross(u)
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs + 0.3 * i
            k = 1 + rr.uniform(-0.12, 0.12)
            p = c + u * (rad[i] * k * math.cos(a)) + w * (rad[i] * 0.86 * k * math.sin(a))
            if cut is not None and i == len(cl) - 1:
                p.z += rr.uniform(-0.18, 0.12)  # 断口参差
            ring.append(mb.vert(p, "p"))
        rings.append(ring)
    for i in range(len(rings) - 1):
        m = mat_tip if (cut is None and i >= 4) else "rock_ink"
        for j in range(segs):
            j2 = (j + 1) % segs
            mb.face((rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]), m)
    tip = mb.vert(cl[-1] + (V((0, 0, 0.05)) if cut is not None else V((0, 0, 0))), "p")
    for j in range(segs):
        mb.face((tip, rings[-1][j], rings[-1][(j + 1) % segs]), "rock_pale" if cut is not None else mat_tip)
    return cl


def skull(mb, c, s=1.0, glow=True):
    """狼头骨（面朝 -Y）：颅 + 长吻 + 两个眼窝（totem_glow）+ 獠牙"""
    c = V(c)
    mb.ellipsoid(c, (0.2 * s, 0.24 * s, 0.17 * s), 7, 4, "bone", "p")
    mb.loft([c + V((0, -0.15 * s, -0.02 * s)), c + V((0, -0.32 * s, -0.06 * s)), c + V((0, -0.46 * s, -0.09 * s))], [0.12 * s, 0.09 * s, 0.05 * s], [0.09 * s, 0.07 * s, 0.04 * s], 6, "bone", "p")
    for x in (1, -1):
        mb.ellipsoid(c + V((0.09 * x * s, -0.17 * s, 0.05 * s)), (0.055 * s, 0.05 * s, 0.045 * s), 5, 3, "totem_glow" if glow else "rock_ink", "p")
        mb.spike(c + V((0.05 * x * s, -0.4 * s, -0.1 * s)), (0, -0.2, -1), 0.12 * s, 0.022 * s, "bone", "p", flat=1.0, segs=3)
        mb.spike(c + V((0.15 * x * s, 0.05 * s, 0.1 * s)), (0.6 * x, 0.5, 0.6), 0.16 * s, 0.04 * s, "bone", "p", flat=0.6, segs=4)  # 耳骨


def banner(mb, top_l, top_r, length, seed, rows=4):
    """破布幡：上沿挂在横杆上，下沿撕成参差的条；双层薄片（两面可见）"""
    rr = random.Random(seed)
    A, B = V(top_l), V(top_r)
    cols = 4
    grid = []
    for i in range(rows + 1):
        row = []
        for j in range(cols + 1):
            u = j / cols
            p = A.lerp(B, u)
            drop = length * i / rows * (1 if i < rows else 0.75 + 0.5 * rr.random())
            p = p + V((rr.uniform(-0.03, 0.03), 0.08 * math.sin(i * 1.3 + u * 3 + seed), -drop))
            row.append(p)
        grid.append(row)
    for side in (1, -1):
        off = V((0, 0.008 * side, 0))
        ids = [[mb.vert(p + off, "p") for p in row] for row in grid]
        for i in range(rows):
            for j in range(cols):
                if i == rows - 1 and (j + seed) % 3 == 0:
                    continue  # 撕掉的缺口
                q = (ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j])
                mb.face(q if side > 0 else tuple(reversed(q)), "cloth_banner")


def rope_ring(mb, c, r, h=0.05):
    mb.loft([V(c) + V((0, 0, -h)), V(c) + V((0, 0, h))], [r, r], [r, r], 6, "rope", "p")


def make_static(name, mb, center=False):
    if center:  # 散件：原点放到底面中心（包围盒水平中心、最低点）
        mn = [min(v[k] for v in mb.v) for k in range(3)]
        mx = [max(v[k] for v in mb.v) for k in range(3)]
        d = V(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, max(0.0, mn[2])))
        mb.v = [v - d for v in mb.v]
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    mats = []
    for mname, col in MATS:
        m = bpy.data.materials.new(mname)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Roughness"].default_value = 0.9
        m.diffuse_color = col
        mats.append(m)
    used = sorted(set(mb.fm))
    slot = {mi: k for k, mi in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in mb.v], [], mb.f)
    for mi in used:
        me.materials.append(mats[mi])
    for i, poly in enumerate(me.polygons):
        poly.material_index = slot[mb.fm[i]]
        poly.use_smooth = MATS[mb.fm[i]][0] in ("cloth_banner", "rope")  # 石头 / 骨头保留棱面（皴法感）
    me.validate()
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False, export_materials="EXPORT")
    mn = [min(v[k] for v in mb.v) for k in range(3)]
    mx = [max(v[k] for v in mb.v) for k in range(3)]
    print("[props] %-20s tris %4d  bbox x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f  mats %s  %d KB" % (
        name, mb.tris(), mn[0], mx[0], mn[1], mx[1], mn[2], mx[2], [MATS[i][0] for i in used], os.path.getsize(path) // 1024))


# ---------------------------------------------------------------- 狼王石
def wolf_king_rock():
    mb = MB(MATS)
    # 主石：碰撞半径 2.2，平顶卧台高约 2.5（青牙开场卧在上面）
    rock(mb, (0, 0, 1.25), (2.35, 2.1, 1.55), 11, segs=11, rings=6, top=2.45, jag=0.14)
    # 脚下两块垫石（让底部不是一个光滑的蛋）
    rock(mb, (1.7, -1.2, 0.35), (0.9, 0.75, 0.6), 12, segs=7, rings=4, jag=0.2)
    rock(mb, (-1.6, 1.0, 0.3), (0.8, 0.9, 0.5), 13, segs=7, rings=4, jag=0.2)
    # 顶面三道爪痕（深墨细槽，45° 俯视可读）+ 散落骨屑
    for k in range(3):
        a = 0.5
        cx = (k - 1) * 0.28
        mb.block(V((cx, 0.1, 2.47)), (0.07, 1.25, 0.04), "rock_ink", "p", rot=__import__("mathutils").Euler((0, 0, a)))
    rr = random.Random(5)
    for k in range(7):
        p = V((rr.uniform(-1.3, 1.3), rr.uniform(-1.1, 1.1), 2.47))
        mb.spike(p, (rr.uniform(-1, 1), rr.uniform(-1, 1), 0.15), rr.uniform(0.18, 0.32), 0.035, "bone", "p", flat=0.7, segs=3)
    skull(mb, (0.95, -0.85, 2.55), 0.7, glow=False)
    make_static("wolf_king_rock", mb)


# ---------------------------------------------------------------- 狼牙石柱 / 残桩
def fang_pillar():
    mb = MB(MATS)
    fang(mb, (0, 0, -0.1), 3.3, 1.0, 0.55, 21)
    for k in range(4):  # 根部碎石
        a = k * 1.7 + 0.4
        rock(mb, (math.cos(a) * 1.05, math.sin(a) * 1.05, 0.12), (0.32, 0.28, 0.22), 30 + k, segs=6, rings=3, jag=0.25)
    rope_ring(mb, (0.06, 0.02, 1.2), 0.78)  # 一道褪色的草绳（祭祀痕迹）
    make_static("fang_pillar", mb)


def fang_pillar_broken():
    mb = MB(MATS)
    fang(mb, (0, 0, -0.1), 3.3, 1.0, 0.55, 21, cut=0.28)  # 同一根柱子在约 0.9 米处断开
    for k in range(6):  # 崩落的大块碎石（可走：都很矮）
        a = k * 1.1 + 0.2
        d = 1.3 + 0.4 * (k % 2)
        rock(mb, (math.cos(a) * d, math.sin(a) * d, 0.14), (0.42, 0.34, 0.26), 40 + k, segs=6, rings=3, jag=0.3)
    make_static("fang_pillar_broken", mb)


# ---------------------------------------------------------------- 狼骨图腾 / 倒地
def totem_parts(mb, glow=True):
    """竖立状态的图腾部件（原点在杆脚）"""
    # 骨杆：一节节脊椎骨叠起来（bone），中间草绳缠
    for i in range(9):
        z = 0.15 + i * 0.32
        mb.ellipsoid(V((0, 0, z)), (0.13 - i * 0.005, 0.13 - i * 0.005, 0.15), 6, 3, "bone", "p")
        if i % 3 == 1:
            rope_ring(mb, (0, 0, z + 0.16), 0.11, 0.035)
    # 横杆（骨）
    mb.loft([V((-0.8, 0, 2.62)), V((0.8, 0, 2.62))], [0.06, 0.06], [0.06, 0.06], 5, "bone", "p")
    # 头骨（面朝 -Y），眼窝青焰
    skull(mb, (0, -0.05, 3.15), 1.15, glow=glow)
    # 肋骨挂件
    for k in range(3):
        z = 2.2 - k * 0.24
        for x in (1, -1):
            mb.spike(V((0.08 * x, -0.05, z)), (0.7 * x, -0.5, -0.5), 0.32 - k * 0.05, 0.03, "bone", "p", flat=0.6, segs=3)
    # 两面破布幡
    banner(mb, (-0.75, -0.08, 2.58), (-0.15, -0.08, 2.58), 1.3, 3)
    banner(mb, (0.15, -0.08, 2.58), (0.75, -0.08, 2.58), 1.05, 4)
    # 青焰部件：幡上一道符纹（细条），召狼时与眼窝一起亮
    if glow:
        for x in (-0.45, 0.45):
            mb.block(V((x, -0.11, 2.15)), (0.06, 0.02, 0.6), "totem_glow", "p")
    # 杆脚：压脚石 + 骨堆
    rock(mb, (0, 0, 0.1), (0.5, 0.45, 0.22), 61, segs=7, rings=3, jag=0.25)


def wolf_totem():
    mb = MB(MATS)
    totem_parts(mb, glow=True)
    make_static("wolf_totem", mb)


def wolf_totem_fallen():
    """倒地：断杆残桩立在原处，上半截连头骨、横杆、幡一起倒向 +X（关卡里朝向由 rotation.y 定）"""
    import mathutils
    mb = MB(MATS)
    # 残桩：两节骨 + 压脚石
    for i in range(2):
        mb.ellipsoid(V((0, 0, 0.15 + i * 0.32)), (0.13, 0.13, 0.15), 6, 3, "bone", "p")
    rock(mb, (0, 0, 0.1), (0.5, 0.45, 0.22), 61, segs=7, rings=3, jag=0.25)
    # 倒下的上半截：先按竖立状态建好，再绕 Y 轴放倒
    tmp = MB(MATS)
    totem_parts(tmp, glow=False)
    Rm = mathutils.Euler((0.12, 1.42, 0.25)).to_matrix()
    base = len(mb.v)
    for p in tmp.v:
        q = Rm @ (p - V((0, 0, 0.6)))
        q = q + V((0.75, 0.0, 0.22))
        q.z = max(q.z, 0.02)
        mb.vert(q, "p")
    keep = []
    for f, fm in zip(tmp.f, tmp.fm):
        if max(tmp.v[i].z for i in f) < 0.62:
            continue  # 下两节骨和压脚石留在原处（残桩），不跟着倒
        mb.face(tuple(base + i for i in f), MATS[fm][0])
    # 碎骨散落
    rr = random.Random(9)
    for k in range(6):
        mb.spike(V((rr.uniform(-0.6, 1.8), rr.uniform(-0.7, 0.7), 0.04)), (rr.uniform(-1, 1), rr.uniform(-1, 1), 0.1), 0.25, 0.04, "bone", "p", flat=0.7, segs=3)
    make_static("wolf_totem_fallen", mb)


# ---------------------------------------------------------------- 狼岩
def wolf_rock():
    mb = MB(MATS)
    rock(mb, (0, 0, 0.6), (1.25, 1.05, 0.85), 71, segs=9, rings=5, top=1.25, jag=0.18)
    rock(mb, (0.85, 0.55, 0.25), (0.5, 0.45, 0.35), 72, segs=6, rings=3, jag=0.25)
    make_static("wolf_rock", mb)


# ---------------------------------------------------------------- 墨雾门石桩
def mist_gate(W=3.0):
    """W = 门洞宽（两根立石中心距）；北阶实际宽 3 米（关卡 2026-11-17）"""
    import mathutils
    mb = MB(MATS)
    tops = []
    for s in (-1, 1):
        # 歪斜的立石：方柱放样，向门洞外侧倾斜
        x = s * W / 2
        cl = [V((x, 0, 0)), V((x + s * 0.06, 0, 1.0)), V((x + s * 0.16, 0, 2.0)), V((x + s * 0.24, 0, 2.6))]
        mb.loft(cl, [0.3, 0.27, 0.23, 0.17], [0.26, 0.24, 0.2, 0.15], 5, lambda i, j: "rock_pale" if i >= 2 else "rock_ink", "p", ref=(1, 0, 0), phase=0.4 * s)
        tops.append(cl[-1])
        rope_ring(mb, cl[2] + V((0, 0, 0.12)), 0.24, 0.05)
        rock(mb, (x, 0, 0.1), (0.42, 0.4, 0.2), 80 + s, segs=6, rings=3, jag=0.25)
    # 横绳：从两根立石上段垂下的悬链
    pts = []
    for k in range(9):
        u = k / 8
        p = V((lerp(-W / 2 + 0.05, W / 2 - 0.05, u), 0, 2.2 - 0.35 * math.sin(math.pi * u)))
        pts.append(p)
    mb.loft(pts, [0.035] * len(pts), [0.035] * len(pts), 4, "rope", "p", ref=(0, 0, 1))
    # 骨符：三串挂在绳上（骨片 + 小幡）
    for k, u in enumerate((0.25, 0.5, 0.75)):
        p = pts[int(round(u * 8))]
        mb.block(p + V((0, 0, -0.22)), (0.14, 0.03, 0.34), "bone", "p", rot=mathutils.Euler((0, 0.1 * (k - 1), 0)))
        mb.spike(p + V((0, 0, -0.4)), (0, 0, -1), 0.18, 0.03, "bone", "p", flat=1.0, segs=3)
    make_static("mist_gate", mb)


# ---------------------------------------------------------------- 狼窝散件（关卡 src/world/lair.js 合并摆放，无碰撞，≤ 0.35 米高）
# 朝向与 lair.js 程序化版本一致：骨头 / 鹿角沿 +X 摆，狼颅吻部朝 +Z（Blender −Y）
def bone_piece(name, L, arch, r, seed):
    import mathutils
    mb = MB(MATS)
    rr = random.Random(seed)
    pts = [V((L * u, 0.02 * math.sin(u * 7 + seed), r + 0.01 + arch * math.sin(math.pi * u))) for u in (0, 0.25, 0.5, 0.75, 1)]
    mb.loft(pts, [r * 0.95, r * 0.75, r * 0.7, r * 0.75, r * 0.95], [r * 0.95, r * 0.75, r * 0.7, r * 0.75, r * 0.95], 5, "bone", "p", ref=(0, 0, 1))
    for x in (0, L):  # 两端关节：双球
        for dy in (-1, 1):
            mb.ellipsoid(V((x, dy * r * 0.7, r * 1.2)), (r * 1.25, r * 1.05, r * 1.15), 5, 3, "bone", "p")
    if rr.random() < 0.5:  # 啃断的一端：几根骨刺
        mb.spike(V((L * 0.9, 0, r * 1.4)), (1, 0.3, 0.4), r * 2.2, r * 0.5, "bone", "p", flat=0.8, segs=3)
    make_static(name, mb, center=True)


def bone_rib():
    """肋骨：平躺的弯弧"""
    mb = MB(MATS)
    pts = [V((0.6 * math.sin(a), 0.35 * (1 - math.cos(a)), 0.035 + 0.06 * math.sin(a))) for a in [k * 0.3 for k in range(7)]]
    mb.loft(pts, [0.03] * 7, [0.018] * 7, 4, "bone", "p", ref=(0, 0, 1))
    make_static("bone_rib", mb, center=True)


def wolf_skull_piece():
    mb = MB(MATS)
    skull(mb, (0, 0.1, 0.15), 0.85, glow=False)  # 眼窝用 rock_ink（墨色）
    # 下颌骨散在一旁
    mb.loft([V((0.12, -0.05, 0.03)), V((0.16, -0.2, 0.03)), V((0.14, -0.33, 0.03))], [0.03, 0.025, 0.02], [0.02, 0.018, 0.015], 4, "bone", "p", ref=(0, 0, 1))
    make_static("wolf_skull", mb, center=True)


def antler_piece():
    mb = MB(MATS)
    main = catmull([(0, 0, 0.04), (0.35, 0.08, 0.12), (0.72, 0.28, 0.09), (1.0, 0.24, 0.05)], 2)
    mb.loft(main, interp([0.05, 0.042, 0.032, 0.02], len(main)), interp([0.05, 0.042, 0.032, 0.02], len(main)), 5, "bone", "p", ref=(0, 0, 1))
    for i, (u, d) in enumerate(((0.3, (0.2, 0.6, 0.75)), (0.55, (0.4, -0.5, 0.75)), (0.8, (0.3, 0.7, 0.6)))):
        p = main[int(u * (len(main) - 1))]
        mb.spike(p, d, 0.26 - 0.03 * i, 0.022, "bone", "p", flat=1.0, segs=4)
    mb.ellipsoid(V((0, 0, 0.05)), (0.07, 0.07, 0.05), 6, 3, "bone", "p")  # 角座
    make_static("antler", mb, center=True)


def straw_nest(r=1.5):
    """狼窝草垫：直径约 3 米、高 0.12 米的压扁草饼（边缘起伏）+ 一圈散草笔触"""
    mb = MB(MATS)
    rr = random.Random(17)
    n = 14
    ring_o, ring_i = [], []
    c = mb.vert(V((0, 0, 0.1)), "p")
    for j in range(n):
        a = 2 * math.pi * j / n
        w = 0.9 + 0.08 * math.sin(a * 3 + 1.3) + 0.06 * math.sin(a * 7 + 0.4)
        ring_i.append(mb.vert(V((math.cos(a) * r * w * 0.65, math.sin(a) * r * w * 0.65, 0.12 + rr.uniform(-0.01, 0.015))), "p"))
        ring_o.append(mb.vert(V((math.cos(a) * r * w, math.sin(a) * r * w, 0.0)), "p"))
    for j in range(n):
        j2 = (j + 1) % n
        mb.face((c, ring_i[j], ring_i[j2]), "straw")
        mb.face((ring_i[j], ring_o[j], ring_o[j2], ring_i[j2]), "straw")
    for k in range(16):  # 散草：贴地的细长扁刺
        a = rr.uniform(0, 2 * math.pi)
        d = r * rr.uniform(0.75, 1.15)
        mb.spike(V((math.cos(a) * d, math.sin(a) * d, 0.03)), (math.cos(a + 1.3), math.sin(a + 1.3), 0.02), rr.uniform(0.35, 0.6), 0.025, "straw", "p", flat=0.3, segs=3)
    make_static("straw_nest", mb, center=True)


PARTS = {
    "wolf_king_rock": wolf_king_rock, "fang_pillar": fang_pillar, "fang_pillar_broken": fang_pillar_broken, "wolf_totem": wolf_totem,
    "wolf_totem_fallen": wolf_totem_fallen, "wolf_rock": wolf_rock, "mist_gate": mist_gate,
    "bone_long": lambda: bone_piece("bone_long", 1.0, 0.06, 0.045, 1), "bone_mid": lambda: bone_piece("bone_mid", 0.7, 0.05, 0.04, 2),
    "bone_short": lambda: bone_piece("bone_short", 0.42, 0.03, 0.035, 3), "bone_rib": bone_rib,
    "wolf_skull": wolf_skull_piece, "antler": antler_piece, "straw_nest": straw_nest,
}
# 用法：... --python blender/build_wolfvalley.py [-- id1 id2 …]（不写 = 全部）
for k in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else PARTS):
    PARTS[k]()
print("[props] done")
