# 墨途 · 生物建模公共库（Blender 4.5，后台运行）：网格构建、骨骼、权重、正向运动学关键姿势、烘焙、导出 GLB。
# 从 build_wolf.py 抽出来的通用部分，供 build_golem / build_bat / build_vine / build_serpent 使用：
#   import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from lib_creature import *
#
# 约定（Blender 坐标）：Z 向上，生物面向 -Y，左侧为 +X，单位米，原点在脚底；导出 glTF 后 +Y 向上、面向 +Z。
# 材质名是与游戏的约定（src/game/enemies/enemy.js PALETTE 按名称前缀换成水墨卡通材质）。
# 动画：每根骨骼一个"骨架空间"欧拉角（度，YXZ 顺序），外加 off_bone 的位移；关键姿势之间平滑插值。
import bpy
import math
import os
import time
from mathutils import Vector, Quaternion, Euler

V = Vector
FPS = 30
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def nrm(v):
    v = V(v)
    l = v.length
    return v / l if l > 1e-9 else V((0, 0, 1))


def lerp(a, b, t):
    return a + (b - a) * t


def frame_from(t, ref):
    t = nrm(t)
    r = V(ref)
    u = r - t * r.dot(t)
    if u.length < 1e-6:
        r = V((1, 0, 0)) if abs(t.x) < 0.9 else V((0, 1, 0))
        u = r - t * r.dot(t)
    u.normalize()
    return u, t.cross(u)


def catmull(pts, sub):
    out = []
    P = [V(p) for p in pts]
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for k in range(sub):
            t = k / sub
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return out


def interp(vals, n_out):
    out = []
    for k in range(n_out):
        x = k / max(1, n_out - 1) * (len(vals) - 1)
        i = min(int(x), len(vals) - 2)
        out.append(lerp(vals[i], vals[i + 1], x - i))
    return out


# ---------------- 网格构建器 ----------------
class MB:
    def __init__(self, mats):
        self.mats = mats
        self.MI = {m[0]: i for i, m in enumerate(mats)}
        self.v, self.part, self.f, self.fm = [], [], [], []
        self.fo = []  # 每个面所属的子网格（None = 主网格）；用 mb.cur = "名" 切换，见 make_objects
        self.cur = None

    def vert(self, p, part):
        self.v.append(V(p))
        self.part.append(part)
        return len(self.v) - 1

    def face(self, idx, mat):
        self.f.append(tuple(idx))
        self.fm.append(self.MI[mat])
        self.fo.append(self.cur)

    def loft(self, centers, rx, ry, segs, mat, part, ref=(1, 0, 0), cap0=True, cap1=True, phase=0.0, parts=None):
        """沿中心线放样椭圆截面；parts 可逐环指定部件（长身体分段绑定时用）；mat 可为函数 mat(i, j) → 材质名（腹甲 / 背纹）"""
        n = len(centers)
        mf = mat if callable(mat) else (lambda i, j: mat)
        rx = rx if isinstance(rx, (list, tuple)) else [rx] * n
        ry = ry if isinstance(ry, (list, tuple)) else [ry] * n
        rings = []
        for i, c in enumerate(centers):
            c = V(c)
            t = V(centers[min(i + 1, n - 1)]) - V(centers[max(i - 1, 0)])
            u, w = frame_from(t, ref)
            pa = parts[i] if parts else part
            ring = []
            for j in range(segs):
                a = 2 * math.pi * j / segs + phase
                ring.append(self.vert(c + u * (rx[i] * math.cos(a)) + w * (ry[i] * math.sin(a)), pa))
            rings.append(ring)
        for i in range(n - 1):
            A, B = rings[i], rings[i + 1]
            for j in range(segs):
                j2 = (j + 1) % segs
                self.face((A[j], A[j2], B[j2], B[j]), mf(i, j))
        if cap0:
            c = self.vert(centers[0], parts[0] if parts else part)
            for j in range(segs):
                self.face((c, rings[0][(j + 1) % segs], rings[0][j]), mf(0, j))
        if cap1:
            c = self.vert(centers[-1], parts[-1] if parts else part)
            for j in range(segs):
                self.face((c, rings[-1][j], rings[-1][(j + 1) % segs]), mf(n - 1, j))
        return rings

    def ellipsoid(self, center, radii, segs, rings_n, mat, part, rot=None):
        c = V(center)
        M = rot.to_matrix() if rot is not None else None

        def P(x):
            return c + (M @ V(x) if M is not None else V(x))

        top = self.vert(P((0, 0, radii[2])), part)
        bot = self.vert(P((0, 0, -radii[2])), part)
        rows = []
        for i in range(1, rings_n):
            ph = math.pi * i / rings_n
            row = []
            for j in range(segs):
                th = 2 * math.pi * j / segs
                row.append(self.vert(P((radii[0] * math.sin(ph) * math.cos(th), radii[1] * math.sin(ph) * math.sin(th), radii[2] * math.cos(ph))), part))
            rows.append(row)
        for j in range(segs):
            j2 = (j + 1) % segs
            self.face((top, rows[0][j], rows[0][j2]), mat)
            self.face((bot, rows[-1][j2], rows[-1][j]), mat)
        for i in range(len(rows) - 1):
            for j in range(segs):
                j2 = (j + 1) % segs
                self.face((rows[i][j], rows[i + 1][j], rows[i + 1][j2], rows[i][j2]), mat)

    def spike(self, base, direction, length, radius, mat, part, flat=0.55, segs=4, ref=(1, 0, 0)):
        """笔触尖刺：扁圆锥，从 base 沿 direction 伸出"""
        d = nrm(direction)
        u, w = frame_from(d, ref)
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs + math.pi / segs
            ring.append(self.vert(V(base) + u * (radius * math.cos(a)) + w * (radius * flat * math.sin(a)), part))
        tip = self.vert(V(base) + d * length, part)
        for j in range(segs):
            self.face((ring[j], ring[(j + 1) % segs], tip), mat)
        c = self.vert(V(base), part)
        for j in range(segs):
            self.face((c, ring[(j + 1) % segs], ring[j]), mat)

    def block(self, center, size, mat, part, rot=None, taper=1.0, bevel=0.0):
        """方块（石头、棱角）：size 全长；taper 顶面缩放；bevel 顶 / 底面切角比例"""
        c = V(center)
        sx, sy, sz = (s / 2 for s in size)
        M = rot.to_matrix() if rot is not None else None
        pts = []
        for z, k in ((-sz, 1.0), (sz, taper)):
            b = bevel
            ring = [(-sx * k, -sy * k * (1 - b)), (-sx * k * (1 - b), -sy * k), (sx * k * (1 - b), -sy * k), (sx * k, -sy * k * (1 - b)),
                    (sx * k, sy * k * (1 - b)), (sx * k * (1 - b), sy * k), (-sx * k * (1 - b), sy * k), (-sx * k, sy * k * (1 - b))] if b > 0 else \
                   [(-sx * k, -sy * k), (sx * k, -sy * k), (sx * k, sy * k), (-sx * k, sy * k)]
            row = []
            for x, y in ring:
                p = V((x, y, z))
                row.append(self.vert(c + (M @ p if M is not None else p), part))
            pts.append(row)
        A, B = pts
        n = len(A)
        for j in range(n):
            j2 = (j + 1) % n
            self.face((A[j], A[j2], B[j2], B[j]), mat)
        self.face(tuple(reversed(A)), mat)
        self.face(tuple(B), mat)

    def sheet(self, pts, mat, part_of, thick=0.012):
        """薄片（翼膜、叶片）：pts 为三角扇 [(中心), p1, p2, …]，两面各一层，厚 thick；part_of(点) → 部件名"""
        c = V(pts[0])
        P = [V(p) for p in pts[1:]]
        nrmv = nrm((P[0] - c).cross(P[-1] - c))
        for side in (1, -1):
            off = nrmv * thick * 0.5 * side
            ci = self.vert(c + off, part_of(c))
            idx = [self.vert(p + off, part_of(p)) for p in P]
            for j in range(len(idx) - 1):
                tri = (ci, idx[j], idx[j + 1])
                self.face(tri if side > 0 else tuple(reversed(tri)), mat)

    def tris(self):
        return sum(len(f) - 2 for f in self.f)


# ---------------- 骨骼与权重 ----------------
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.dot(ab), 1e-9)))
    return (p - (a + ab * t)).length


def compute_weights(mb, bones, part_bones, falloff=4, top=2):
    segs = {n: (h, t) for n, h, t, _, _ in bones}
    out = []
    for p, part in zip(mb.v, mb.part):
        c = part_bones.get(part, [part])
        if len(c) == 1:
            out.append([(c[0], 1.0)])
            continue
        ws = sorted(((n, 1.0 / (seg_dist(p, *segs[n]) + 0.01) ** falloff) for n in c), key=lambda x: -x[1])[:top]
        tot = sum(w for _, w in ws)
        out.append([(n, w / tot) for n, w in ws if w / tot > 0.02])
    return out


def make_objects(name, mb, bones, weights):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    mats = []
    for mname, col in mb.mats:
        m = bpy.data.materials.new(mname)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Roughness"].default_value = 0.8
        m.diffuse_color = col
        mats.append(m)
    # 按 mb.fo 拆成多个网格对象（主网格 = name，子网格 = name_<组名>），各自只保留用到的顶点；权重按原顶点序号取
    groups = []
    for g in mb.fo or [None] * len(mb.f):
        if g not in groups:
            groups.append(g)
    if not mb.fo:
        mb.fo = [None] * len(mb.f)
    objs = []
    for g in groups:
        fids = [i for i, fg in enumerate(mb.fo) if fg == g]
        used = sorted({vi for i in fids for vi in mb.f[i]})
        remap = {vi: k for k, vi in enumerate(used)}
        oname = name if g is None else name + "_" + g
        me = bpy.data.meshes.new(oname)
        me.from_pydata([tuple(mb.v[vi]) for vi in used], [], [tuple(remap[vi] for vi in mb.f[i]) for i in fids])
        mused = sorted({mb.fm[i] for i in fids})
        mslot = {mi: k for k, mi in enumerate(mused)}
        for mi in mused:
            me.materials.append(mats[mi])
        for k, poly in enumerate(me.polygons):
            poly.material_index = mslot[mb.fm[fids[k]]]
            poly.use_smooth = True
        me.validate()
        me.update()
        obj = bpy.data.objects.new(oname, me)
        scene.collection.objects.link(obj)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
        objs.append((obj, used))
    ad = bpy.data.armatures.new(name + "_rig")
    arm = bpy.data.objects.new(name + "_rig", ad)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    ebs = {}
    for n, h, t, p, d in bones:
        eb = ad.edit_bones.new(n)
        eb.head, eb.tail = h, t
        eb.roll = 0
        eb.use_deform = d
        if p:
            eb.parent = ebs[p]
        ebs[n] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj, used in objs:
        for n, _, _, _, d in bones:
            if d:
                obj.vertex_groups.new(name=n)
        for k, vi in enumerate(used):
            for n, w in weights[vi]:
                obj.vertex_groups[n].add([k], w, "REPLACE")
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        obj.parent = arm
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return objs[0][0], arm


def bones_list(B):
    return [(n, V(h), V(t), p, d) for n, h, t, p, d in B]


# ---------------- 姿势 ----------------
def P0():
    return {"off": V((0, 0, 0)), "rot": {}}


def R(P, bone, x=0, y=0, z=0):
    r = P["rot"].get(bone, V((0, 0, 0)))
    P["rot"][bone] = r + V((x, y, z))


def S(a, ph=0.0):
    return math.sin(a + ph)


def mkpose(base=None, off=None, **kw):
    """关键姿势：base(P) 先摆基础站姿，再叠加各骨骼欧拉角（度）"""
    P = P0()
    if base:
        base(P)
    if off:
        P["off"] += V(off)
    for b, r in kw.items():
        R(P, b, *r)
    return P


def add_pose(A, B):
    out = P0()
    out["off"] = A["off"] + B["off"]
    for b in set(A["rot"]) | set(B["rot"]):
        out["rot"][b] = A["rot"].get(b, V((0, 0, 0))) + B["rot"].get(b, V((0, 0, 0)))
    return out


def keys_spline(keys, t):
    for i in range(len(keys) - 1):
        t0, A = keys[i]
        t1, B = keys[i + 1]
        if t <= t1 or i == len(keys) - 2:
            u = max(0.0, min(1.0, (t - t0) / max(1e-6, t1 - t0)))
            u = u * u * (3 - 2 * u)
            out = P0()
            out["off"] = A["off"].lerp(B["off"], u)
            for b in set(A["rot"]) | set(B["rot"]):
                out["rot"][b] = A["rot"].get(b, V((0, 0, 0))).lerp(B["rot"].get(b, V((0, 0, 0))), u)
            return out
    return keys[-1][1]


def keys_fn(keys, extra=None):
    """关键姿势表 → 时间函数；extra(t, P) 可叠加持续的次级动作（摆尾、扇翅）"""
    def f(t):
        P = keys_spline(keys, t)
        if extra:
            extra(t, P)
        return P
    return f


# ---------------- 烘焙与导出 ----------------
class Baker:
    def __init__(self, arm, bones, off_bone):
        self.arm = arm
        self.off_bone = off_bone
        self.rest3 = {n: arm.data.bones[n].matrix_local.to_3x3() for n, *_ in bones}

    def basis(self, P):
        out = {}
        for n, r3 in self.rest3.items():
            e = P["rot"].get(n)
            if e is None or e.length < 1e-6:
                q = Quaternion()
            else:
                Rd = Euler((math.radians(e.x), math.radians(e.y), math.radians(e.z)), "YXZ").to_matrix()
                q = (r3.inverted() @ Rd @ r3).to_quaternion()
            loc = V((0, 0, 0))
            if n == self.off_bone:
                loc = r3.inverted() @ P["off"]
            out[n] = (q, loc)
        return out


def bake_action(bk, name, fn, dur, loop, tag="creature"):
    arm = bk.arm
    n = int(round(dur * FPS))
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    for f in range(n + 1):
        t = (f % n) / FPS if loop else f / FPS
        B = bk.basis(fn(t))
        for pb in arm.pose.bones:
            q, loc = B[pb.name]
            if pb.name in prev and prev[pb.name].dot(q) < 0:
                q.negate()
            prev[pb.name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name == bk.off_bone:
                pb.location = loc
                pb.keyframe_insert("location", frame=f)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = n
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.action_frame_end = n
    tr.mute = True
    arm.animation_data.action = None
    print("[%s] action %-14s %3d frames (%.2fs)%s" % (tag, name, n, n / FPS, " loop" if loop else ""))


def export_glb(obj, arm, path, tag="creature"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    for o in arm.children:  # 子网格（make_objects 按 mb.fo 拆出来的）一起导出
        o.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = V()
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_skins=True,
        export_morph=False, export_cameras=False, export_lights=False, export_materials="EXPORT",
    )
    print("[%s] exported %s %d KB" % (tag, path, os.path.getsize(path) // 1024))


def build_creature(name, mb, bones, part_bones, off_bone, actions, falloff=4):
    """一站式：权重 → 对象 → 烘焙 actions [(名称, fn, 时长, 循环)] → 导出 assets/models/<name>.glb"""
    T0 = time.time()
    bl = bones_list(bones)
    weights = compute_weights(mb, bl, part_bones, falloff)
    print("[%s] verts %d, tris %d, bones %d" % (name, len(mb.v), mb.tris(), len(bl)))
    obj, arm = make_objects(name, mb, bl, weights)
    bk = Baker(arm, bl, off_bone)
    for a in actions:
        bake_action(bk, a[0], a[1], a[2], a[3], name)
    export_glb(obj, arm, os.path.join(ROOT, "assets", "models", name + ".glb"), name)
    blend = os.path.join(ROOT, "work", name + "_build.blend")
    os.makedirs(os.path.dirname(blend), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print("[%s] done in %.1fs" % (name, time.time() - T0))
