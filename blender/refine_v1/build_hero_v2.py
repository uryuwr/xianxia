# 墨途 · 主角「林墨」（白衣散修）精细版 v2（小样，美术管线 2026-11-18）
#   B=D:/tools/blender-4.5.16-windows-x64/blender.exe
#   $B -b -t 8 --factory-startup --python blender/refine_v1/build_hero_v2.py              # → docs/art/精细化小样_v1/assets/hero_v2.glb + 贴图
#   $B -b -t 8 --factory-startup --python blender/refine_v1/build_hero_v2.py -- --hi      # 只出高模预览（work/refine_v1/hero_v2_hi*.png）
#   $B -b -t 8 --factory-startup --python blender/refine_v1/build_hero_v2.py -- --quick   # 粗体素快速迭代
#
# 不改原文件：33 根骨骼、15 段动画（含处决）、次级动态（飘带 / 袖 / 下摆 / 剑穗）全部执行 blender/build_hero.py 得到，这里只换网格和贴图。
# 对症"太简陋"：
#   - 头：颅 + 面（眉弓、颧、鼻梁鼻翼、唇、下颌、耳）连续体；五官的眼线 / 剑眉 / 唇色画在贴图上（水墨人物画法：形体靠体积，五官靠笔）；
#   - 发：发际线起 26 束发顺颅骨扫向发髻，束间凹缝出墨线；发髻是缠绕的发束；鬓发两缕 + 额前碎发；脑后加一束马尾（蒙到飘带骨上，跟着飘）；
#   - 衣：外袍是有厚度的壳（不是实心柱）：宽袖口张开、看得见里衬；袖下垂成袋、有纵褶；下摆前后两片、两侧开衩、纵向垂褶向下摆加深；
#     腰上衣料堆出的横褶；交领是压在衣面上的一条有厚度的领缘 + 立领；腰封分两层 + 蝴蝶结 + 两条垂带；
#   - 手：掌 + 五指（右手握剑、指头绕剑柄），护腕有绑带；靴有鞋底、翘头、踝部褶；
#   - 剑：菱形截面剑身（中脊）、如意形剑格、缠绳剑柄、剑首；剑穗是一束散开的丝。
import sys
import os
import math
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_refine import *  # noqa: E402,F401,F403

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
QUICK = "--quick" in ARGV
K = 1.7 if QUICK else 1.0  # 体素倍率
NAME = "hero_v2"
rnd = random.Random(5)

ns, ARM, BONES, LEGACY = load_legacy_hero()
delete_objects(LEGACY["objs"])
log("legacy rig ready: %d bones, %d actions" % (len(BONES), len(bpy.data.actions)))
TORSO = ns["TORSO"]
HIP_X = ns["HIP_X"]


def V3(v):
    return A(tuple(v))


def arm_pts(s):
    d, S, E, W = ns["arm_pts"](s)
    return V3(d), V3(S), V3(E), V3(W)


def torso_surf(x, z, off=0.004):
    p, n = ns["torso_surf"](x, z, off)
    return V3(p), V3(n)


KNEE = lambda s: V3(ns["KNEE"](s))
PART_BONES = dict(ns["PART_BONES"])
for t in ("L", "R"):
    PART_BONES["arm_" + t] = ["shoulder_" + t, "upperarm_" + t, "forearm_" + t]
PART_BONES["hair"] = ["head"]


def M_axes(x, y, z):
    return np.stack([nrm(x), nrm(y), nrm(z)], 1)


def M_from(axis, hint=(0, 0, 1)):
    z = nrm(axis)
    x = np.cross(A(hint), z)
    if np.linalg.norm(x) < 1e-6:
        x = np.cross((1, 0, 0), z)
    x = nrm(x)
    return M_axes(x, np.cross(z, x), z)


# =============================================================================================
# 头（skin）
# =============================================================================================
HEADC = A((0, 0.004, 1.625))
EYE = {s: A((0.032 * s, -0.098, 1.6)) for s in (1, -1)}
BROW_Z, MOUTH_Z, EYE_R = 1.632, 1.533, 0.015
MPFB_NPZ = os.path.join(WORK, "mpfb_head.npz")  # blender/refine_v1/mpfb_head.py 导出（MakeHuman CC0 基础网格的头 + 颈）


class MeshGroup:
    """现成网格做高模的组（不走距离场）：premade = (V, 四边面)；part 按高度分头 / 颈"""

    def __init__(self, name, mat, V, Q, h):
        self.name, self.mat, self.h = name, mat, h
        self.premade = (V, Q)
        self.prims = []

    def eval_parts(self, P):
        part = np.where(P[:, 2] < 1.47, "neck", "head").astype(object)
        return part, np.zeros(len(P))


def load_mpfb_head():
    """读 MPFB 头 → 对齐到林墨的头骨（眼高 1.60、头顶约 1.735）→ 风格化：左右对称、收 V 形下颌、五官区域抹平 → Catmull-Clark 两级细分做高模"""
    global EYE, HAIRC, HAIR_R, MOUTH_Z, BROW_Z, EYE_R
    import json
    import bmesh
    from mathutils import kdtree
    d = np.load(MPFB_NPZ)
    V, F, lab = d["V"].astype(np.float64), d["F"], d["label"]
    J = {k: A(v) for k, v in json.loads(str(d["joints"])).items()}
    e_mh = (J["joint-l-eye"] + J["joint-r-eye"]) / 2
    sc = (1.735 - 1.60) / (V[:, 2].max() - e_mh[2])
    tgt = A((0, -0.096, 1.60))
    V = (V - e_mh) * sc + tgt
    JJ = {k: (v - e_mh) * sc + tgt for k, v in J.items()}
    # 左右对称：每个顶点与镜像点取平均
    kd = kdtree.KDTree(len(V))
    for i, p in enumerate(V):
        kd.insert(p, i)
    kd.balance()
    Vm = V.copy()
    for i, p in enumerate(V):
        co, j, dist = kd.find((-p[0], p[1], p[2]))
        if dist < 0.004:
            Vm[i] = (p + A((-co[0], co[1], co[2]))) / 2
    V = Vm
    skin = lab == 0

    fr = V[skin & (np.abs(V[:, 0]) < 0.004)]
    nose_z = float(fr[np.argmin(fr[:, 1]), 2])                   # 鼻尖
    chin_z = float(fr[(fr[:, 2] < nose_z - 0.03)][:, 2][np.argmin(fr[(fr[:, 2] < nose_z - 0.03)][:, 1])])  # 下巴最前点
    MOUTH_Z = nose_z - (nose_z - chin_z) * 0.42
    # V 形下颌：嘴以下、脸前半部向中线收
    zc = V[:, 2]
    k_jaw = sstep(1.565, 1.48, zc) * sstep(0.02, -0.06, V[:, 1]) * skin
    V[:, 0] *= 1 - 0.1 * k_jaw
    # 五官区域抹平（眼窝、唇、鼻翼的写实起伏 → 柔和）：沿网格边做拉普拉斯平滑，越靠脸中心越强
    E = set()
    for f in F:
        f = [x for x in f if x >= 0]
        for a, b in zip(f, f[1:] + f[:1]):
            E.add((min(a, b), max(a, b)))
    E = np.array(sorted(E))
    face = sstep(-0.03, -0.075, V[:, 1]) * sstep(1.47, 1.5, zc) * sstep(1.68, 1.65, zc) * skin
    for _ in range(6):
        Vs = smooth_field(V, E, 1, 0.5)
        V = V + (Vs - V) * (0.75 * face)[:, None]
    EYE, rr = {}, []
    for sg in (1, -1):  # 眼球中心 = 眼球（helper）顶点的包围盒中心
        ev_ = V[(lab == 1) & (np.sign(V[:, 0]) == sg)]
        EYE[sg] = (ev_.max(0) + ev_.min(0)) / 2
        rr.append(float(np.mean(np.linalg.norm(ev_ - EYE[sg], axis=1))))
    EYE_R = float(np.mean(rr))
    BROW_Z = float(EYE[1][2] + 0.02)
    # 颅顶椭球：对眉以上、去掉耳朵的颅骨顶点做轴对齐椭球最小二乘（a x² + b y² + c z² + e y + f z = 1，左右已对称）
    top = V[skin & (zc > BROW_Z + 0.004) & ((np.abs(V[:, 0]) < 0.06) | (zc > EYE[1][2] + 0.045))]
    X_ = np.stack([top[:, 0] ** 2, top[:, 1] ** 2, top[:, 2] ** 2, top[:, 1], top[:, 2]], 1)
    a_, b_, c_, e_, f_ = np.linalg.lstsq(X_, np.ones(len(top)), rcond=None)[0]
    cy, cz = -e_ / (2 * b_), -f_ / (2 * c_)
    G_ = 1 + b_ * cy * cy + c_ * cz * cz
    HAIRC = A((0, cy, cz))
    HAIR_R = A((math.sqrt(G_ / a_), math.sqrt(G_ / b_), math.sqrt(G_ / c_))) + 0.007
    # 去掉眼球（helper），补上眼洞和颈底，眼周抹平成光滑的眼睑面：眼睛按水墨人物的画法"画"上去
    bm = bmesh.new()
    bv = [bm.verts.new(tuple(v)) for v in V]
    for f in F:
        f = [x for x in f if x >= 0]
        if all(lab[x] == 0 for x in f):
            bm.faces.new([bv[x] for x in f])
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    bm.verts.index_update()
    bnd = [e for e in bm.edges if e.is_boundary]
    mz = [v.co.z for e in bnd for v in e.verts if abs(v.co.x) < 0.02 and v.co.y < -0.08 and 1.48 < v.co.z < EYE[1][2] - 0.03]
    if mz:
        MOUTH_Z = float(np.mean(mz))
    res = bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
    bmesh.ops.triangulate(bm, faces=res["faces"])
    def flatten(cx, cz, rx, rz, depth, yf=None):
        """把 (x,z) 椭圆区域内比周围脸面深的点拉到 yf + depth 的面上（yf 默认取外圈脸面的最前 25%）"""
        pts = [v for v in bm.verts]
        if yf is None:
            ring = [v.co.y for v in pts if 1.6 < ((v.co.x - cx) / rx) ** 2 + ((v.co.z - cz) / rz) ** 2 < 3.0 and v.co.y < -0.05]
            if not ring:
                return
            yf = float(np.percentile(ring, 25))
        yf = yf + depth
        for v in pts:
            q = ((v.co.x - cx) / rx) ** 2 + ((v.co.z - cz) / rz) ** 2
            if q < 1.0 and v.co.y > yf and v.co.y < yf + 0.06:
                w = float(sstep(1.0, 0.6, q))
                v.co.y = v.co.y + (yf - v.co.y) * w
    for sg in (1, -1):
        flatten(EYE[sg][0], EYE[sg][2], 0.019, 0.011, 0.0, yf=float(EYE[sg][1]) - 0.0135)   # 眼球前缘略靠后：留一道浅浅的眼睑
    flatten(0.0, MOUTH_Z, 0.026, 0.008, 0.0)
    for _ in range(12):  # 眼周（眼中心 2.6 cm 内）拉普拉斯平滑
        for v in bm.verts:
            for sg in (1, -1):
                dd_ = (A(tuple(v.co)) - EYE[sg])
                if np.linalg.norm(dd_ * A((1, 0.6, 1))) < 0.026 and v.link_edges:
                    m_ = sum((e.other_vert(v).co for e in v.link_edges), v.co * 0) / len(v.link_edges)
                    v.co = v.co.lerp(m_, 0.6)
    for sg in (1, -1):  # 平滑后再压一次：眼睛前面只留 1–2 mm 的浅凹，画上去的瞳孔不被上眼睑挡住
        flatten(EYE[sg][0], EYE[sg][2], 0.017, 0.0095, 0.0, yf=float(EYE[sg][1]) - 0.0165)
    me = bpy.data.meshes.new("mpfb_tmp")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("mpfb_tmp", me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new("ss", "SUBSURF")
    mod.levels = mod.render_levels = 2
    dg = bpy.context.evaluated_depsgraph_get()
    em = ob.evaluated_get(dg).to_mesh()
    Vh = np.empty(len(em.vertices) * 3, np.float32)
    em.vertices.foreach_get("co", Vh)
    Q = np.array([list(p.vertices) for p in em.polygons], np.int32)
    Vh = Vh.reshape(-1, 3).astype(np.float64)
    ob.evaluated_get(dg).to_mesh_clear()
    bpy.data.objects.remove(ob)
    log("MPFB head: %d → %d verts (subdiv 2), eye z %.3f r %.4f, mouth z %.3f, hair ellipsoid c %s r %s" % (len(V), len(Vh), EYE[1][2], EYE_R, MOUTH_Z, np.round(HAIRC, 3), np.round(HAIR_R, 3)))
    return Vh, Q


def build_head(g):
    """干净的风格化脸型（主管 2026-11-18：不做写实雕刻，五官用笔画在贴图上）：颅 + 面 + V 形下颌 + 一点鼻梁 + 耳"""
    g.ellipsoid((0, 0.006, 1.632), (0.088, 0.1, 0.1), part="head")                    # 颅（比上一版窄 8%）
    g.ellipsoid((0, -0.026, 1.575), (0.062, 0.078, 0.085), k=0.05, part="head")       # 面
    g.ellipsoid((0, -0.074, 1.5), (0.02, 0.02, 0.02), k=0.03, part="head")            # 下巴
    for s in (1, -1):
        g.cone((0.056 * s, -0.01, 1.55), (0.011 * s, -0.075, 1.498), 0.019, 0.014, k=0.04, part="head")  # V 形下颌
        g.ellipsoid((0.09 * s, 0.004, 1.6), (0.01, 0.018, 0.027), k=0.008, part="head")  # 耳
    g.cone((0, -0.097, 1.615), (0, -0.108, 1.572), 0.006, 0.0085, k=0.02, part="head")  # 鼻（只是一道柔和的起伏）
    g.cone((0, 0.012, 1.38), (0, 0.0, 1.55), 0.046, 0.042, k=0.03, part="neck")       # 颈


# =============================================================================================
# 发（hair_black）+ 发带 / 发绳（ribbon_red）+ 发簪（sword_hilt）
# =============================================================================================
HAIRC = A((0, 0.008, 1.632))
HAIR_R = A((0.098, 0.109, 0.11))
BUN = A((0, 0.03, 1.79))
STRANDS = Strands()


def on_skull(dirv, off):
    d = nrm(dirv)
    k = 1.0 / math.sqrt(float(np.sum((d / HAIR_R) ** 2)))
    return HAIRC + d * (k + off)


def hair_lock(g, p0dir, p1dir, r0, part="hair", n=7, off=0.004, lift=0.0, k=0.006):
    pts = []
    a, b = nrm(p0dir), nrm(p1dir)
    om = math.acos(max(-1, min(1, float(a @ b))))
    for i in range(n):
        u = i / (n - 1)
        if om < 1e-4:
            d = a
        else:
            d = (math.sin((1 - u) * om) * a + math.sin(u * om) * b) / math.sin(om)
        pts.append(on_skull(d, off + r0 * 0.4 + lift * math.sin(math.pi * u)))
    rw = [r0 * (0.12 + 0.88 * sstep(0.0, 0.35, u)) * (1 - 0.35 * u) for u in np.linspace(0, 1, n)]  # 发际线一端收尖，向发髻略收
    g.chain(pts, rw, k=k, part=part)
    STRANDS.add(pts, r0)


def build_hair(g, rib, rg):
    """少量大块发缕：发壳 + 10 缕宽发束扫向发髻 + 两侧鬓发 + 发髻 + 马尾（不做细碎发片，发片不进脸）"""
    g.ellipsoid(HAIRC, HAIR_R - 0.005, part="hair")
    g.ellipsoid((0, -0.122, 1.548), (0.096, 0.1, 0.108), op="sub", k=0.03)   # 挖掉脸（软边，发际线渐薄）
    g.ellipsoid((0, -0.07, 1.47), (0.11, 0.11, 0.085), op="sub", k=0.02)
    for s in (1, -1):
        g.ellipsoid((0.096 * s, -0.004, 1.585), (0.026, 0.032, 0.032), op="sub", k=0.012)  # 露耳
    bun_d = BUN + A((0, 0, -0.03)) - HAIRC
    for i in range(14):
        a = math.radians(-155 + 310 * i / 13) + (0.06 if i % 2 else -0.04)  # 0 = 正前
        zf = 1.668 if abs(a) < math.radians(60) else lerp(1.668, 1.6, min(1, (abs(a) - math.radians(60)) / math.radians(50)))
        if abs(a) > math.radians(115):
            zf = lerp(1.6, 1.54, min(1, (abs(a) - math.radians(115)) / math.radians(35)))
        p0 = A((math.sin(a) * 0.092, -math.cos(a) * 0.098, zf)) - HAIRC
        hair_lock(g, p0 - A((0, 0, 0.004)), bun_d + A((math.sin(a) * 0.015, 0.0, 0)), 0.024, n=9, off=-0.008, lift=0.004, k=0.007)
    for s in (1, -1):  # 鬓发：耳前一缕宽发，贴着颊侧外面垂下（x ≥ 0.076，不进脸）
        pts = [on_skull((0.9 * s, -0.45, 0.35), 0.0), A((0.084 * s, -0.04, 1.6)), A((0.082 * s, -0.042, 1.55)), A((0.076 * s, -0.036, 1.505))]
        g.loft(pts, [0.006, 0.0055, 0.004, 0.0008], [0.016, 0.014, 0.009, 0.0015], ref=(1, 0, 0), k=0.01, part="hair")
        STRANDS.add(pts, 0.014)
    g.ellipsoid(BUN, (0.042, 0.044, 0.044), k=0.01, part="hair")       # 发髻
    for j in range(3):
        ph = j * 2 * math.pi / 3
        pts = []
        for i in range(9):
            u = i / 8
            ang = ph + u * 1.4 * math.pi
            r = 0.041 * (1 - 0.25 * u)
            pts.append(BUN + A((math.cos(ang) * r, math.sin(ang) * r, -0.028 + 0.056 * u)))
        g.chain(pts, [0.014] * 8 + [0.006], k=0.006, part="hair")
        STRANDS.add(pts, 0.014)
    tail = catmull([BUN + A((0, 0.035, -0.02))] + [V3(p) + A((0, 0.012, 0)) for p in rib[1:]], 3)
    rr = interp([0.026, 0.023, 0.019, 0.013, 0.004], len(tail))
    g.chain(tail, rr, k=0.01, part="ribbon")                            # 马尾（蒙到飘带骨）
    STRANDS.add(tail, 0.02)
    # 发绳（ribbon_red）+ 两条飘带
    rg.add(lambda P: torus_d(P, BUN + A((0, 0.0, -0.035)), 0.047, 0.0075), BUN - 0.07, BUN + 0.07, part="head")
    for s in (1, -1):
        pts = [V3(p) + A((s * (0.016 + 0.045 * i / 4), 0, 0)) for i, p in enumerate(rib)]
        cur = catmull(pts, 4)
        nn = len(cur)
        wav = A([math.sin(i * 0.55 + (s > 0)) for i in range(nn)])
        cur = cur + A([(0.006 * w * s, 0.004 * w, 0) for w in wav])
        w = interp([0.012, 0.016], nn)
        rg.loft(cur, [0.003] * nn, w, ref=(0, 1, 0), k=0.003, part="ribbon")
        tip = cur[-1]
        rg.loft([tip, tip + A((s * 0.012, 0.006, -0.06))], [0.003, 0.002], [0.014, 0.002], ref=(0, 1, 0), k=0.003, part="ribbon")
        rg.loft([tip, tip + A((-s * 0.006, 0.006, -0.045))], [0.003, 0.002], [0.012, 0.002], ref=(0, 1, 0), k=0.003, part="ribbon")
    return tail


def torus_d(P, c, R, r):
    q = P - c
    return np.sqrt((np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2) - R) ** 2 + q[:, 2] ** 2) - r


# =============================================================================================
# 外袍上身 + 宽袖（robe_white，有厚度的壳）
# =============================================================================================
TPTS = A([(0, 0, z) for z, _, _ in TORSO])
TRX = A([r[1] for r in TORSO]) + 0.006
TRY = A([r[2] for r in TORSO]) + 0.006
SLEEVES = {}


def sleeve_geo(s):
    d, S, E, W = arm_pts(s)
    dd = nrm(A((0, 0, -1)) - d * float(A((0, 0, -1)) @ d))
    ls = [0.0, 0.08, 0.19, 0.3, 0.4, 0.48]
    droop = [0.016, 0.016, 0.024, 0.042, 0.068, 0.09]
    rh = [0.05, 0.058, 0.08, 0.11, 0.14, 0.162]
    rw = [0.064, 0.068, 0.078, 0.09, 0.1, 0.106]
    cs = [S + d * l + dd * dr for l, dr in zip(ls, droop)]
    return d, S, dd, cs, rh, rw


def build_robe_upper(g):
    g.loft(TPTS, TRX, TRY, part="torso")
    for s in (1, -1):
        g.ellipsoid((0.07 * s, -0.085, 1.29), (0.07, 0.035, 0.065), k=0.05, part="torso")  # 胸
        g.ellipsoid((0.12 * s, 0.0, 1.35), (0.05, 0.068, 0.042), k=0.07, part="torso")     # 肩（溜肩）
        d, S, dd, cs, rh, rw = sleeve_geo(s)
        tag = "L" if s > 0 else "R"
        SLEEVES[s] = (d, S, dd, cs, rh, rw)
        cs2 = catmull(cs + [cs[-1] + d * 0.06 + dd * 0.012], 3)
        RH = interp(rh + [rh[-1] + 0.01], len(cs2))
        RW = interp(rw + [rw[-1] + 0.004], len(cs2))
        n0 = len(cs2) - 4
        g.loft(cs2[:-3], RH[:-3], RW[:-3], ref=dd, k=0.035, part="sleeve_" + tag)
        # 袖口不掏空：4 mm 体素下薄壁减面后会碎成斑块（主管复核 2026-11-18）；端面在 face_mats 里改成中衣色当"袖里"
    # 腰上堆褶、袖纵褶、衣身斜褶
    g.disp(robe_folds)


def robe_folds(P, N):
    out = np.zeros(len(P))
    # 腰上横向堆出来的衣料：绕身一圈的起伏
    phi = np.arctan2(P[:, 0], -P[:, 1])
    band = sstep(1.05, 1.1, P[:, 2]) * sstep(1.24, 1.12, P[:, 2]) * (np.abs(P[:, 0]) < 0.26)
    out += band * (0.004 * np.sin(phi * 5 + 1.0 * gnoise(P * 4, 2)) + 0.003)   # 束腰后堆出的几道大褶
    for s, (d, S, dd, cs, rh, rw) in SLEEVES.items():
        q = P - S
        u = q @ d
        m = (u > 0.06) & (u < 0.52) & (P[:, 0] * s > 0.12)
        if not m.any():
            continue
        side = np.cross(d, dd)
        a = np.arctan2(q[m] @ side, q[m] @ dd)
        amp = 0.001 + 0.005 * sstep(0.1, 0.45, u[m])
        out[m] += amp * np.sin(a * 3 + 0.8 * gnoise(P[m] * 3, 7))           # 袖摆下垂的三道主褶
    return out


def sleeve_fn(s, cs2, RH, RW, d, S, dd, t=0.0075):
    """宽袖：放样外形减去纵褶后取壳（内外壁一起起伏，厚度不变），袖口按平面切开"""
    side = np.cross(d, dd)

    def fn(P):
        q = P - S
        u = q @ d
        a = np.arctan2(q @ side, q @ dd)
        amp = 0.002 + 0.007 * sstep(0.1, 0.48, u)
        fold = amp * np.sin(a * 6 + u * 9 * s + 1.5 * gnoise(P * 7, 7))
        dd_ = sd_loft(P, cs2, RH, RW, ref=dd) - fold
        shell = np.abs(dd_) - t
        cut = u - (0.475 + 0.012 * np.sin(a * 3) * s)
        return smax(shell, cut, 0.004)

    return fn


# =============================================================================================
# 下摆（robe_white）：前后两片，膝下两侧开衩，纵向垂褶
# =============================================================================================
def skirt_panel(front, thick=0.0075):
    sc = 1.0 if front else 0.965

    def fn(P):
        z = P[:, 2]
        rx = (0.168 + (1.0 - z) * 0.165) * sc
        ry = (0.128 + (1.0 - z) * 0.165) * sc
        phi = np.arctan2(P[:, 0], -P[:, 1])  # 0 = 正前
        q = np.sqrt((P[:, 0] / rx) ** 2 + ((P[:, 1] - (-0.005 if front else 0.005)) / ry) ** 2)
        r = np.minimum(rx, ry)
        hem = sstep(0.95, 0.15, z)
        fold = 0.011 * np.sin(phi * 6 + 1.2 * gnoise(P * A((3, 3, 0.8)), 11)) * hem   # 几道低频垂褶
        d = (q - 1) * r - fold
        shell = np.abs(d) - thick
        span = np.where(z >= 0.74, math.radians(96), np.radians(lerp(64.0, 96.0, np.clip((z - 0.11) / 0.63, 0, 1))))
        ph = phi if front else (np.pi - np.abs(phi))
        reg = (np.abs(ph) - span) * 0.25
        hz = 0.11 + 0.012 * np.sin(phi * 5) + 0.008 * gnoise(P * 12, 4)
        cut = np.maximum(hz - z, z - 1.0)
        return smax(smax(shell, reg, 0.006), cut, 0.006)

    return fn


def build_skirt(g):
    g.add(skirt_panel(True), (-0.36, -0.36, 0.08), (0.36, 0.05, 1.02), part="skirt_f")
    g.add(skirt_panel(False), (-0.36, -0.05, 0.08), (0.36, 0.36, 1.02), part="skirt_b")


# =============================================================================================
# 领缘 / 立领（robe_inner）、中衣（臂、裤）、腰封、护腕、手、靴
# =============================================================================================
def build_collar(g):
    lap = [(0.035, 1.455), (0.0, 1.37), (-0.055, 1.27), (-0.1, 1.17), (-0.128, 1.07)]
    for L, off in ((lap, 0.007), ([(-0.035, 1.455), (-0.012, 1.40), (0.004, 1.355)], 0.004)):
        pts, refs = [], []
        for q in catmull([A((x, 0, z)) for x, z in L], 3):
            p, n = torso_surf(q[0], q[2], off)
            pts.append(p)
            refs.append(n)
        g.loft(pts, 0.0045, 0.022, ref=refs, k=0.004, part="torso")
    # 立领：一圈有厚度的环
    g.add(lambda P: smax(np.abs(np.sqrt((P[:, 0] / 1.0) ** 2 + ((P[:, 1] - 0.006) / 0.94) ** 2) - 0.058) - 0.004,
                         np.abs(P[:, 2] - 1.445) - 0.012, 0.003),
          (-0.08, -0.08, 1.41), (0.08, 0.08, 1.5), part="neck")


def build_inner(g):
    for s in (1, -1):
        tag = "L" if s > 0 else "R"
        d, S, E, W = arm_pts(s)
        g.cone(S - d * 0.02, S + d * 0.44, 0.048, 0.04, k=0.01, part="arm_" + tag)
        leg = catmull([(HIP_X * s, 0, 0.95), (0.098 * s, -0.004, 0.70), tuple(KNEE(s)), (0.1 * s, -0.004, 0.31)], 3)
        g.chain(leg, interp([0.088, 0.078, 0.062, 0.057], len(leg)), k=0.02, part="leg_" + tag)
    g.disp(lambda P, N: 0.003 * np.sin(P[:, 2] * 90 + 3 * gnoise(P * 15, 5)) * sstep(0.62, 0.4, P[:, 2]) * sstep(0.3, 0.38, P[:, 2]))  # 膝下堆褶


def build_sash(g):
    g.loft([(0, 0, 0.935), (0, 0, 0.97), (0, 0, 1.03), (0, 0, 1.065)], [0.188, 0.192, 0.188, 0.178], [0.148, 0.152, 0.148, 0.138], k=0.004, part="sash")
    g.loft([(0, 0, 0.982), (0, 0, 1.0), (0, 0, 1.018)], [0.192, 0.197, 0.193], [0.152, 0.157, 0.153], k=0.006, part="sash")  # 外缠的第二道（布带叠压）
    g.disp(lambda P, N: 0.0015 * np.sin(P[:, 2] * 260 + 2 * gnoise(P * 8, 12)) * (P[:, 2] < 1.07) * (P[:, 2] > 0.93))       # 束紧的横褶
    kc = A((0.045, -0.16, 1.0))
    g.ellipsoid(kc, (0.016, 0.012, 0.014), k=0.004, part="sash")
    for s in (1, -1):  # 蝴蝶结两耳
        c = kc + A((0.03 * s, -0.004, 0.006))
        g.add(lambda P, c=c, s=s: np.sqrt((np.sqrt(((P[:, 0] - c[0]) / 1.0) ** 2 + ((P[:, 2] - c[2]) / 0.7) ** 2) - 0.022) ** 2 + ((P[:, 1] - c[1]) * 2.2) ** 2) - 0.0055,
              c - 0.04, c + 0.04, k=0.006, part="sash")
    for k_, (dx, ln) in enumerate(((-0.008, 0.30), (0.022, 0.24))):
        a = kc + A((dx, -0.004, -0.008))
        b = a + A((0.01 + 0.012 * k_, -0.03, -ln))
        cur = catmull([a, (a + b) / 2 + A((0.006 * (1 - 2 * k_), -0.014, 0)), b], 4)
        g.loft(cur, [0.0035] * len(cur), interp([0.012, 0.016, 0.019], len(cur)), ref=(0, -1, 0), k=0.003, part="sash_end")
        g.loft([b, b + A((0.01, -0.002, -0.022))], [0.0035, 0.002], [0.019, 0.002], ref=(0, -1, 0), k=0.002, part="sash_end")


def build_bracers(g):
    for s in (1, -1):
        tag = "L" if s > 0 else "R"
        d, S, E, W = arm_pts(s)
        a, b = S + d * 0.37, W + d * 0.012
        g.cone(a, b, 0.044, 0.04, part="wrist_" + tag)
        for u in (0.18, 0.5, 0.82):
            c = a + (b - a) * u
            g.ellipsoid(c, (0.047, 0.047, 0.006), M=M_from(d), k=0.004, part="wrist_" + tag)


def build_hand(g, s):
    d, S, E, W = arm_pts(s)
    tag = "hand_" + ("L" if s > 0 else "R")
    nin = nrm(A((-s, 0, 0)) - d * float(A((-s, 0, 0)) @ d))  # 掌心朝身体
    wv = nrm(np.cross(d, nin))  # 掌宽方向
    if float(wv @ A((0, -1, 0))) < 0:
        wv = -wv  # wv 指向前（食指 / 拇指一侧）
    hc = W + d * 0.045
    g.ellipsoid(hc, (0.024, 0.016, 0.038), M=M_axes(wv, nin, d), k=0.006, part=tag)  # 掌
    g.cone(W - d * 0.01, W + d * 0.02, 0.026, 0.025, k=0.012, part=tag)               # 腕
    if s > 0:  # 左手：自然半握
        for j, (o, L) in enumerate(((0.018, 0.068), (0.006, 0.074), (-0.006, 0.07), (-0.017, 0.058))):
            base = hc + d * 0.032 + wv * o
            p1 = base + d * L * 0.4 + nin * 0.006
            p2 = p1 + d * L * 0.3 + nin * 0.014
            p3 = p2 + nin * 0.016 - d * 0.004
            g.chain([base, p1, p2, p3], [0.0085, 0.0078, 0.0068, 0.006], k=0.004, part=tag)
        t0 = hc + wv * 0.02 - d * 0.012 + nin * 0.008
        g.chain([t0, t0 + wv * 0.014 + d * 0.02 + nin * 0.012, t0 + wv * 0.012 + d * 0.042 + nin * 0.02], [0.01, 0.0085, 0.007], k=0.004, part=tag)
    else:  # 右手：握剑（剑柄沿 -Y 穿过手心）
        gc = W + d * 0.056  # 剑柄中心（与原脚本 hc 一致）
        ax = A((0, -1, 0))
        u = nrm(d - ax * float(d @ ax))
        v = np.cross(ax, u)
        for j, yo in enumerate((-0.03, -0.01, 0.01, 0.028)):
            pts = []
            for i in range(6):
                ang = -0.3 + i * 0.95
                pts.append(gc + ax * yo + (u * math.cos(ang) + v * math.sin(ang)) * 0.024)
            g.chain(pts, [0.009] * 5 + [0.0075], k=0.004, part=tag)
        g.chain([gc + u * 0.01 - ax * 0.04 + v * 0.02, gc + u * 0.03 - ax * 0.05 + v * 0.02, gc + u * 0.04 - ax * 0.045 - v * 0.005], [0.01, 0.009, 0.008], k=0.004, part=tag)  # 拇指压在食指上
        g.ellipsoid(gc - u * 0.005 + ax * 0.0, (0.03, 0.022, 0.034), M=M_axes(v, ax, u), k=0.008, part=tag)


def build_boots(g):
    for s in (1, -1):
        tag = "L" if s > 0 else "R"
        g.loft([(0.1 * s, -0.004, 0.37), (0.1 * s, -0.002, 0.22), (0.1 * s, 0.0, 0.08)], [0.064, 0.06, 0.058], [0.064, 0.06, 0.058], k=0.01, part="boot_" + tag)
        g.add(lambda P, s=s: torus_d(P, A((0.1 * s, -0.004, 0.362)), 0.064, 0.008), (0.1 * s - 0.08, -0.09, 0.34), (0.1 * s + 0.08, 0.08, 0.39), k=0.005, part="boot_" + tag)
        g.loft([(0.1 * s, 0.055, 0.05), (0.1 * s, -0.01, 0.052), (0.1 * s, -0.11, 0.042), (0.1 * s, -0.17, 0.034), (0.1 * s, -0.198, 0.05)], [0.05, 0.052, 0.04, 0.022, 0.006], [0.05, 0.058, 0.054, 0.032, 0.008], ref=(0, 0, 1), k=0.012, part="foot_" + tag)
        g.box((0.1 * s, -0.06, 0.008), (0.06, 0.125, 0.008), rad=0.005, k=0.004, part="foot_" + tag)  # 鞋底
    g.disp(lambda P, N: 0.0022 * np.sin(P[:, 2] * 160 + 2 * gnoise(P * 20, 9)) * sstep(0.1, 0.14, P[:, 2]) * sstep(0.28, 0.2, P[:, 2]))  # 踝部褶


# =============================================================================================
# 剑：剑身（sword_steel）、剑格 / 柄 / 首（sword_hilt）、剑穗（tassel_red）
# =============================================================================================
GC = None


def build_sword(blade, hilt, tassel):
    global GC
    d, S, E, W = arm_pts(-1)
    hc = W + d * 0.056
    GC = hc
    ax = A((0, -1, 0))
    y0 = hc[1] - 0.105
    L = 0.71

    def blade_fn(P):
        q = P - hc
        t = (-q[:, 1] - 0.105) / L  # 0 = 剑格 → 1 = 剑尖
        w = np.where(t < 0.86, 0.0185 - 0.003 * t, 0.0185 * np.clip((1 - t) / 0.14, 0, 1) * 0.86)
        th = 0.0045 * np.clip(np.where(t < 0.86, 1.0, (1 - t) / 0.14), 0.05, 1)
        w = np.maximum(w, 0.0004)
        dd = (np.abs(q[:, 2]) * th + np.abs(q[:, 0]) * w - w * th) / np.sqrt(w * w + th * th)
        return np.maximum(dd, np.maximum(-t, t - 1) * L)

    blade.add(blade_fn, hc + A((-0.01, -0.83, -0.03)), hc + A((0.01, -0.09, 0.03)), part="sword")
    # 剑格：如意形，两翼微翘
    hilt.ellipsoid(hc + A((0, -0.095, 0)), (0.016, 0.009, 0.034), k=0.004, part="sword")
    for s in (1, -1):
        hilt.cone(hc + A((0, -0.095, 0.0)), hc + A((0, -0.1, 0.05 * s)), 0.012, 0.007, k=0.006, part="sword")
        hilt.sphere(hc + A((0, -0.1, 0.053 * s)), 0.0085, k=0.004, part="sword")
    # 柄：缠绳（螺旋凸棱）
    hilt.add(lambda P: grip_fn(P, hc), hc + A((-0.03, -0.09, -0.03)), hc + A((0.03, 0.12, 0.03)), part="sword")
    hilt.ellipsoid(hc + A((0, 0.125, 0)), (0.019, 0.012, 0.019), k=0.004, part="sword")  # 剑首
    hilt.add(lambda P: torus_d(P[:, [0, 2, 1]], A((hc[0], hc[2], hc[1] + 0.138)), 0.008, 0.0035), hc + A((-0.02, 0.12, -0.02)), hc + A((0.02, 0.16, 0.02)), k=0.003, part="sword")
    # 剑穗：绳 + 结 + 散开的丝
    P0 = hc + A((0, 0.15, 0))
    tassel.cone(P0 + A((0, 0, 0.0)), P0 + A((0, 0, -0.05)), 0.0035, 0.0035, part="tassel")
    tassel.ellipsoid(P0 + A((0, 0, -0.055)), (0.009, 0.009, 0.011), k=0.004, part="tassel")
    for j in range(9):
        a = j * 2 * math.pi / 9
        o = A((math.cos(a), math.sin(a), 0))
        pts = [P0 + A((0, 0, -0.06)) + o * 0.004, P0 + A((0, 0, -0.1)) + o * 0.012, P0 + A((0, 0, -0.16)) + o * (0.018 + 0.006 * math.sin(a * 3))]
        tassel.chain(pts, [0.0045, 0.004, 0.0015], k=0.003, part="tassel")
    return hc


def grip_fn(P, hc):
    q = P - hc
    y = q[:, 1]
    r = np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2)
    ang = np.arctan2(q[:, 2], q[:, 0])
    rib = 0.0016 * np.cos(ang * 2 + y * 260)
    d = r - (0.0135 + rib)
    return np.maximum(d, np.abs(y - 0.012) - 0.105)


def build_pin(g):
    a, b = BUN + A((-0.075, 0.01, 0.012)), BUN + A((0.08, 0.0, 0.0))
    g.cone(a, b, 0.0035, 0.0025, part="head")
    g.ellipsoid(a, (0.008, 0.007, 0.007), k=0.004, part="head")


# =============================================================================================
# 组装
# =============================================================================================
hc_, tp_, rib_ = None, None, None
# 原脚本的飘带中心线（与 define_bones 一致）
RIB = [A(p) for p in ([(0, 0.065, 1.77), (0, 0.1, 1.6), (0, 0.13, 1.42), (0, 0.15, 1.24), (0, 0.16, 1.06)])]

if os.path.exists(MPFB_NPZ):
    _hv, _hq = load_mpfb_head()
    head = MeshGroup("head", "skin", _hv, _hq, 0.002)
else:  # 没有 MPFB 数据时退回距离场的风格化头
    head = Group("head", 0.0019 * K, mat="skin")
    build_head(head)
hair = Group("hair", 0.002 * K, mat="hair_black")
ribbon = Group("ribbon", 0.0016 * K, mat="ribbon_red")
build_hair(hair, RIB, ribbon)
pin = Group("pin", 0.0015 * K, mat="sword_hilt")
build_pin(pin)
robe = Group("robe", 0.0042 * K, mat="robe_white")
build_robe_upper(robe)
skirt = Group("skirt", 0.0042 * K, mat="robe_white")
build_skirt(skirt)
collar = Group("collar", 0.002 * K, mat="robe_inner")
build_collar(collar)
inner = Group("inner", 0.0045 * K, mat="robe_inner")
build_inner(inner)
sash = Group("sash", 0.0025 * K, mat="sash_dark")
build_sash(sash)
bracer = Group("bracer", 0.0025 * K, mat="sash_dark")
build_bracers(bracer)
handL = Group("handL", 0.0018 * K, mat="skin")
build_hand(handL, 1)
handR = Group("handR", 0.0018 * K, mat="skin")
build_hand(handR, -1)
boots = Group("boots", 0.003 * K, mat="boots_black")
build_boots(boots)
blade = Group("blade", 0.0011 * K, mat="sword_steel")
hilt = Group("hilt", 0.0012 * K, mat="sword_hilt")
tassel = Group("tassel", 0.0014 * K, mat="tassel_red")
build_sword(blade, hilt, tassel)

GROUPS = [head, hair, ribbon, pin, robe, skirt, collar, inner, sash, bracer, handL, handR, boots, blade, hilt, tassel]
TARGET = {"head": 1100, "hair": 900, "ribbon": 420, "pin": 40, "robe": 1650, "skirt": 1100, "collar": 150, "inner": 300, "sash": 600, "bracer": 160,
          "handL": 260, "handR": 260, "boots": 400, "blade": 60, "hilt": 180, "tassel": 120}  # 约 7.6k（主管：主角 ≤ 8k）

# ---------------- 上色 ----------------
SRGB = lambda hx: A([((hx >> 16) & 255) / 255.0, ((hx >> 8) & 255) / 255.0, (hx & 255) / 255.0])
LIN = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
C_ = lambda hx: LIN(SRGB(hx))
INK = C_(0x16181b)


def face_strokes(P):
    return face_strokes_sdf(P)


def face_strokes_sdf(P):
    """五官的笔：剑眉、上眼线、瞳、唇色（只在脸前方）"""
    ink = np.zeros(len(P))
    red = np.zeros(len(P))
    front = sstep(-0.06, -0.09, P[:, 1])
    x, z = P[:, 0], P[:, 2]
    for s in (1, -1):
        # 剑眉：内低外高，一笔由粗到细
        ey = EYE[s]
        bz = BROW_Z
        d, t = polyline_dt(P * A((1, 0, 1)), A([(0.012 * s, 0, bz + 0.002), (0.032 * s, 0, bz + 0.004), (0.052 * s, 0, bz + 0.006)]))
        ink = np.maximum(ink, sstep(0.0036 - 0.0016 * t, 0.0014 - 0.0008 * t, d) * front * 0.85)
        # 眼：杏形，外眼角上挑；上眼线粗、瞳是墨点
        ex, ez = (x - EYE[s][0]) * s, z - EYE[s][2]
        ez2 = ez - 0.12 * ex
        ez2 = ez - 0.06 * ex
        almond = (ex / 0.016) ** 2 + (ez2 / (0.0068 * (1 - 0.25 * np.clip(ex / 0.016, -1, 1)))) ** 2
        upper = sstep(0.0015, 0.0005, np.abs(ez2 - 0.0064 * np.sqrt(np.clip(1 - (ex / 0.017) ** 2, 0, 1)))) * (np.abs(ex) < 0.0175)
        iris = sstep(0.0068, 0.0054, np.sqrt((ex - 0.001) ** 2 + (ez2 + 0.0004) ** 2)) * (almond < 1.15)
        ink = np.maximum(ink, np.maximum(upper, iris * 0.95) * front)
        ink = np.maximum(ink, sstep(1.25, 1.0, almond) * sstep(0.85, 1.0, almond) * 0.5 * front)
    lip = sstep(0.0016, 0.0005, np.abs(z - MOUTH_Z)) * sstep(0.011, 0.006, np.abs(x)) * front   # 嘴：一笔短而轻的淡朱
    return ink, lip, np.zeros(len(P))


def paint(gname, P, N, ao, cav):
    n = len(P)
    ink = np.zeros(n)
    rough = np.full(n, 0.8)
    metal = np.zeros(n)
    groove = sstep(1.2, 3.2, -cav)
    ridge = sstep(1.2, 3.2, cav)
    if gname in ("head", "handL", "handR"):
        col = np.repeat(C_(0xe8d6c0)[None], n, 0)
        if gname == "head":
            f_ink, lip, ball = face_strokes(P)
            col = col * (1 - ball[:, None]) + C_(0xf1ece2) * ball[:, None]
            blush = sum(np.exp(-np.sum(((P - (EYE[s] + A((0.012 * s, 0.004, -0.03)))) / 0.018) ** 2, 1)) for s in (1, -1))
            col = col * (1 - 0.25 * blush[:, None]) + C_(0xe7a99a) * 0.25 * blush[:, None]
            col = col * (1 - 0.75 * lip[:, None]) + C_(0xc06a5e) * 0.75 * lip[:, None]
            ink = np.maximum(ink, f_ink)
            col = col * (1 - 0.08 * sstep(-0.02, 0.06, P[:, 1])[:, None])  # 脑后、颈后略暗
        col = col * (1 - 0.18 * groove[:, None])
        ink = np.maximum(ink, groove * 0.35)
        rough[:] = 0.6
    elif gname in ("hair",):
        t, sid, dd = STRANDS.query(P)
        rid = np.where(sid >= 0, hash01(sid, 4), 0.5)
        col = C_(0x1b1d1f) * (0.85 + 0.3 * rid[:, None])
        sheen = ridge * sstep(0.2, 0.7, N[:, 2])
        col = col + C_(0x55606a) * 0.45 * sheen[:, None]
        ink = np.maximum(groove * 0.9, 0.0)
        rough[:] = 0.45
    elif gname in ("robe", "skirt"):
        col = np.repeat(C_(0xf2efe6)[None], n, 0)
        # 墨染下摆 / 袖口：刷子边的淡墨晕
        edge = np.zeros(n)
        if gname == "skirt":
            edge = sstep(0.3 + 0.06 * fbm(P * 9, 3, seed=31), 0.12, P[:, 2])
        else:
            pass  # 袖口不再墨染（主管复核：C 模式下成碎斑）
        wash = C_(0x4a4f55)
        col = col * (1 - 0.55 * edge[:, None]) + wash * 0.55 * edge[:, None]
        # 褶的淡墨线
        ink = np.maximum(ink, sstep(1.8, 3.6, -cav) * 0.25)   # 只有几道主褶有淡墨
        col = col * (1 - 0.05 * groove[:, None])
        rough[:] = 0.85
    elif gname in ("collar", "inner"):
        col = np.repeat(C_(0xc9c6bc)[None], n, 0)
        ink = groove * 0.5
        rough[:] = 0.85
    elif gname in ("sash", "bracer"):
        col = np.repeat(C_(0x2d3033)[None], n, 0)
        col = col * (1 + 0.6 * ridge[:, None])
        ink = groove * 0.6
        rough[:] = 0.7
    elif gname == "ribbon":
        col = np.repeat(C_(0xd2321e)[None], n, 0) * (1 - 0.3 * groove[:, None])
        ink = groove * 0.3
        rough[:] = 0.6
    elif gname == "tassel":
        col = np.repeat(C_(0xd2321e)[None], n, 0) * (1 - 0.35 * groove[:, None])
        rough[:] = 0.8
    elif gname == "boots":
        col = np.repeat(C_(0x202224)[None], n, 0) * (1 + 0.8 * ridge[:, None])
        sole = sstep(0.02, 0.012, P[:, 2])
        col = col * (1 - sole[:, None]) + C_(0x6b665e) * sole[:, None]
        ink = groove * 0.5
        rough[:] = 0.6
    elif gname == "blade":
        col = np.repeat(C_(0xd8dde0)[None], n, 0)
        rough[:] = 0.22
        metal[:] = 1.0
        ridge_line = sstep(0.0012, 0.0004, np.abs(P[:, 2] - GC[2]))
        ink = ridge_line * 0.35
    else:  # hilt, pin
        col = np.repeat(C_(0x3a3430)[None], n, 0) * (1 + 0.5 * ridge[:, None])
        ink = groove * 0.6
        rough[:] = 0.55
    col = col * (1 - 0.7 * ink[:, None]) + INK * 0.7 * ink[:, None]
    return np.clip(col, 0, 1), np.clip(ink, 0, 1), rough, metal


ONE_MAT = {g.name: g.mat for g in GROUPS}


def face_mats(gname, lo):
    me = lo.data
    nf = len(me.polygons)
    if gname in ("robe", "skirt"):
        # 壳的内表面（袖里、下摆里）用中衣色 robe_inner
        c = np.empty(nf * 3, np.float32)
        me.polygons.foreach_get("center", c)
        c = c.reshape(-1, 3).astype(np.float64)
        nn = np.empty(nf * 3, np.float32)
        me.polygons.foreach_get("normal", nn)
        nn = nn.reshape(-1, 3).astype(np.float64)
        inside = np.zeros(nf, bool)
        if gname == "skirt":
            radial = nrm(c * A((1, 1, 0)))
            inside = np.einsum("ij,ij->i", radial, nn) < -0.2
        else:
            for s, (d, S, dd, cs, rh, rw) in SLEEVES.items():
                q = c - S
                u = q @ d
                inside |= (u > 0.43) & (c[:, 0] * s > 0.12) & ((nn @ d) > 0.55)   # 袖口端面 = 袖里
        return np.where(inside, "robe_inner", ONE_MAT[gname])
    if gname == "head" and os.path.exists(MPFB_NPZ):
        c = np.empty(nf * 3, np.float32)
        me.polygons.foreach_get("center", c)
        c = c.reshape(-1, 3).astype(np.float64)
        out = np.array(["skin"] * nf, dtype=object)
        for s in (1, -1):
            e = EYE[s]
            iris = (np.sqrt((c[:, 0] - e[0] - 0.001 * s) ** 2 + (c[:, 2] - e[2]) ** 2) < 0.0055) & (c[:, 1] < -0.07)
            out[iris] = "hair_black"
        return out
    return np.array([ONE_MAT[gname]] * nf)


VIEWS = [(0, 5, 1.0), (90, 5, 1.0), (180, 5, 1.0), (35, 40, 1.0)]
HEADN_C = A((0, -0.012, 1.6))              # 脸部法线向这个椭球的法线靠（卡通脸的干净明暗）
HEADN_R = A((0.085, 0.1, 0.12))
HEADV = [(25, 8, 5.5, (0, -0.02, 1.62)), (0, 3, 5.5, (0, -0.02, 1.62)), (110, 8, 5.5, (0, 0.02, 1.62))]
run_pipeline(dict(
    name=NAME, groups=GROUPS, arm=ARM, bones=BONES, part_bones=PART_BONES,
    weight=dict(power=5, eps=0.006, top=3, bias={"sleeve_L": 0.85, "sleeve_R": 0.85}),
    paint=paint, face_mats=face_mats, pal_emit={"ribbon_red": ((0.35, 0.03, 0.01), 0.4), "tassel_red": ((0.35, 0.03, 0.01), 0.4)},
    obj_of={g.name: "hero" for g in GROUPS}, out_objs=["hero"], target=TARGET,
    density={"head": 2.6, "hair": 1.5, "handL": 1.8, "handR": 1.8, "ribbon": 1.2, "hilt": 1.4, "blade": 0.8, "tassel": 1.2, "pin": 1.2},
    ao_dist=0.06, res=1024, flat=["head", "handL", "handR"], symmetric=["head"], no_normal=["head"],
    soft_normals={"head": (HEADN_C, HEADN_R)}, extrusion=0.004, max_dist=0.012,
    smooth={"robe": 4, "skirt": 4, "hair": 2, "head": 3, "inner": 3},
    previews=[("hero_v2_hi.png", [g.name for g in GROUPS], VIEWS), ("hero_v2_head.png", ["head", "hair", "ribbon", "pin", "robe", "collar"], HEADV)],
    only_hi="--hi" in ARGV, quick=QUICK, cav_scale=600.0, default_part="torso",
))
