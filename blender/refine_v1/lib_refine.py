# 墨途 · 精细化小样 v1：Blender 侧公共库（高模 → 低模 → UV → 烘焙 → 蒙皮 → 导出）
#   由 build_hero_v2.py / build_qingya_v2.py 调用；SDF 与网格化在 lib_sdf.py（纯 numpy）。
#
# 管线（每个材质组 Group 一条）：
#   1. lib_sdf：图元 smooth-union + 窄带位移 → 距离场 → Surface Nets 高模（3–6 mm 体素）
#   2. 高模上逐顶点算：AO（Cycles 烘到顶点色）、曲率 / 缝隙、程序化固有色与笔触（角色脚本的 paint 函数）
#   3. 高模减面（Decimate collapse）→ 低模；所有低模一起 Smart UV + 打包成一张图集
#   4. Cycles 选中→活动 烘焙：切线空间法线、固有色、墨（笔触 / 曲率 / AO）、ORM，逐组烘、numpy 合成 + 外扩
#   5. 蒙皮：低模顶点按"最近图元的 part"套用原脚本的 PART_BONES 距离权重公式，再沿网格平滑（融合处不撕裂）
#   6. 骨骼与全部动画直接执行原 build 脚本得到（骨骼名、动画名、命中帧逐帧不变），只换网格后导出 GLB
import os
import sys
import math
import time
import numpy as np
import bpy
from mathutils import Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
BL = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(BL, ".."))
OUT_DIR = os.path.join(ROOT, "docs", "art", "精细化小样_v1", "assets")
WORK = os.path.join(ROOT, "work", "refine_v1")
sys.path.insert(0, HERE)
from lib_sdf import *  # noqa: E402,F401,F403

T0 = time.time()


def log(*a):
    print("[refine %6.1fs]" % (time.time() - T0), *a, flush=True)


# =============================================================================================
# 原脚本 → 骨骼 + 动画（不改原文件，只在内存里执行它的函数）
# =============================================================================================
def load_legacy_hero():
    path = os.path.join(BL, "build_hero.py")
    src = open(path, encoding="utf-8").read().rstrip()
    assert src.endswith("main()")
    src = src[: -len("main()")]
    ns = {"__file__": path, "__name__": "legacy_hero"}
    exec(compile(src, path, "exec"), ns)
    hc, tp, rib = ns["build_mesh"]()
    bones = ns["define_bones"](hc, tp, rib)
    weights = ns["compute_weights"](bones)
    obj, arm = ns["make_objects"](bones, weights)
    rig = ns["Rig"](arm, bones)
    ns["bake_all"](rig)
    legacy = dict(v=np.array([tuple(v) for v in ns["mb"].v]), part=list(ns["mb"].part), objs=[obj])
    return ns, arm, bones, legacy


def load_legacy_creature(script, falloff=4):
    path = os.path.join(BL, script)
    if BL not in sys.path:
        sys.path.insert(0, BL)
    import lib_creature as LC

    cap = {}

    def fake_build(name, mb, bones, part_bones, off_bone, actions, falloff=4):
        cap.update(name=name, mb=mb, bones=bones, part_bones=part_bones, off_bone=off_bone, actions=actions, falloff=falloff)

    real = LC.build_creature
    LC.build_creature = fake_build
    ns = {"__file__": path, "__name__": "legacy_" + script}
    try:
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), ns)
    finally:
        LC.build_creature = real
    bl = LC.bones_list(cap["bones"])
    weights = LC.compute_weights(cap["mb"], bl, cap["part_bones"], cap["falloff"])
    obj, arm = LC.make_objects(cap["name"], cap["mb"], bl, weights)
    bk = LC.Baker(arm, bl, cap["off_bone"])
    for a in cap["actions"]:
        LC.bake_action(bk, a[0], a[1], a[2], a[3], cap["name"])
    mb = cap["mb"]
    legacy = dict(v=np.array([tuple(v) for v in mb.v]), part=list(mb.part), objs=[o for o in arm.children])
    return ns, arm, bl, cap, legacy


def delete_objects(objs):
    for o in objs:
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


# =============================================================================================
# 网格
# =============================================================================================
def mesh_obj(name, V, Fc, coll=None):
    me = bpy.data.meshes.new(name)
    V = np.asarray(V, np.float32)
    Fc = np.asarray(Fc, np.int32)
    k = Fc.shape[1]
    me.vertices.add(len(V))
    me.vertices.foreach_set("co", V.ravel())
    me.loops.add(Fc.size)
    me.loops.foreach_set("vertex_index", Fc.ravel())
    me.polygons.add(len(Fc))
    me.polygons.foreach_set("loop_start", np.arange(0, Fc.size, k, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), bool))
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def np_verts(ob):
    me = ob.data
    a = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3).astype(np.float64)


def np_vnormals(ob):
    me = ob.data
    a = np.empty(len(me.vertices) * 3, np.float32)
    me.vertex_normals.foreach_get("vector", a)
    return a.reshape(-1, 3).astype(np.float64)


def np_edges(ob):
    me = ob.data
    a = np.empty(len(me.edges) * 2, np.int32)
    me.edges.foreach_get("vertices", a)
    return a.reshape(-1, 2)


def np_tris(ob):
    me = ob.data
    me.calc_loop_triangles()
    a = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", a)
    return a.reshape(-1, 3)


def smooth_field(x, E, n_iter=2, a=0.5):
    """沿网格边做拉普拉斯平滑（x: (N,) 或 (N,k)）"""
    x = np.asarray(x, np.float64)
    N = len(x)
    deg = np.bincount(E.ravel(), minlength=N).astype(np.float64)
    deg = np.maximum(deg, 1)
    for _ in range(n_iter):
        s = np.zeros_like(x)
        np.add.at(s, E[:, 0], x[E[:, 1]])
        np.add.at(s, E[:, 1], x[E[:, 0]])
        m = s / (deg if x.ndim == 1 else deg[:, None])
        x = x * (1 - a) + m * a
    return x


def curvature(V, Nn, E):
    """离散平均曲率（凸 > 0，凹 < 0），单位 1/米"""
    N = len(V)
    d = V[E[:, 1]] - V[E[:, 0]]
    l2 = np.maximum(np.einsum("ij,ij->i", d, d), 1e-12)
    c0 = -np.einsum("ij,ij->i", d, Nn[E[:, 0]]) / l2
    c1 = np.einsum("ij,ij->i", d, Nn[E[:, 1]]) / l2
    s = np.zeros(N)
    np.add.at(s, E[:, 0], c0)
    np.add.at(s, E[:, 1], c1)
    deg = np.maximum(np.bincount(E.ravel(), minlength=N), 1)
    return 2 * s / deg


def set_color_attr(ob, name, rgba):
    me = ob.data
    if name in me.color_attributes:
        me.color_attributes.remove(me.color_attributes[name])
    at = me.color_attributes.new(name, "FLOAT_COLOR", "POINT")
    rgba = np.asarray(rgba, np.float32)
    if rgba.shape[1] == 3:
        rgba = np.concatenate([rgba, np.ones((len(rgba), 1), np.float32)], 1)
    at.data.foreach_set("color", rgba.ravel())
    return at


def get_color_attr(ob, name):
    at = ob.data.color_attributes[name]
    a = np.empty(len(at.data) * 4, np.float32)
    at.data.foreach_get("color", a)
    return a.reshape(-1, 4)


def decimate(ob, target_tris, name, voxel=None, sym=False):
    """先体素重网格（OpenVDB，得到封闭流形，修掉 Surface Nets 在薄处的非流形边），再 Decimate collapse 到目标面数"""
    me = ob.data
    me.calc_loop_triangles()
    nt = len(me.loop_triangles)
    rm = None
    if voxel:
        rm = ob.modifiers.new("rm", "REMESH")
        rm.mode = "VOXEL"
        rm.voxel_size = voxel
        rm.adaptivity = 0.0
        dg = bpy.context.evaluated_depsgraph_get()
        nt = len(ob.evaluated_get(dg).data.polygons) * 2
    ratio = min(1.0, target_tris / max(nt, 1))
    mod = ob.modifiers.new("dec", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    if sym:
        mod.use_symmetry = True
        mod.symmetry_axis = "X"
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    new = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.remove(mod)
    if rm:
        ob.modifiers.remove(rm)
    for an in [a.name for a in new.color_attributes]:
        try:
            new.color_attributes.remove(new.color_attributes[an])
        except Exception:
            pass
    lo = bpy.data.objects.new(name, new)
    bpy.context.scene.collection.objects.link(lo)
    new.polygons.foreach_set("use_smooth", np.ones(len(new.polygons), bool))
    new.calc_loop_triangles()
    log("decimate %-16s %7d → %6d tris" % (name, nt, len(new.loop_triangles)))
    return lo


# =============================================================================================
# 高模：AO（顶点色）
# =============================================================================================
_GPU = None


def enable_gpu():
    """Cycles 用显卡烘焙（主管 2026-11-18：不占满用户 CPU）。OPTIX 优先、不行用 CUDA，只启用 RTX 3070；失败退回 CPU"""
    global _GPU
    if _GPU is not None:
        return _GPU
    _GPU = False
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA"):
            try:
                pr.compute_device_type = kind
            except TypeError:
                continue
            pr.get_devices()
            devs = [d for d in pr.devices if d.type == kind]
            ok = False
            for d in pr.devices:
                d.use = d.type == kind and "3070" in d.name
                ok |= d.use
            if not ok and devs:  # 名字不含 3070 时用第一块该类型的卡
                devs[0].use = True
                ok = True
            if ok:
                _GPU = kind
                log("Cycles GPU:", kind, [d.name for d in pr.devices if d.use])
                break
    except Exception as e:  # noqa: BLE001
        log("GPU 不可用，退回 CPU：", e)
    return _GPU


def setup_cycles(samples=16):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU" if enable_gpu() else "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    if sc.world is None:
        sc.world = bpy.data.worlds.new("W")
    return sc


def only_select(objs, active):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def bake_ao_vertex(highs, dist, samples=48, hide=(), hide_for=None):
    """hide_for: {高模名: [烘它时要隐藏的对象]}（不同阶段的部件互不遮挡）"""
    sc = setup_cycles(samples)
    sc.world.light_settings.distance = dist
    for o in hide:
        o.hide_render = True
    for hi in highs:
        extra = (hide_for or {}).get(hi.name, [])
        for o in extra:
            o.hide_render = True
        at = set_color_attr(hi, "ao", np.ones((len(hi.data.vertices), 4)))
        hi.data.color_attributes.active_color = at
        only_select([hi], hi)
        t = time.time()
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        log("AO bake %-12s %.1fs" % (hi.name, time.time() - t))
        for o in extra:
            o.hide_render = False
    for o in hide:
        o.hide_render = False


# =============================================================================================
# 材质（烘焙用 / 导出用）
# =============================================================================================
def emit_material(name, attr):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = attr
    em = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(ca.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    m["attr_node"] = ca.name
    return m


def set_emit_attr(m, attr):
    m.node_tree.nodes[m["attr_node"]].layer_name = attr


def image_target_material(name, img, white=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if white:
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (1, 1, 1, 1)
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    else:
        bs = nt.nodes.new("ShaderNodeBsdfDiffuse")
        nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    tex.select = True
    return m


def new_image(name, res, noncolor=True, float_buf=False):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, res, res, alpha=True, float_buffer=float_buf)
    img.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
    img.generated_color = (0, 0, 0, 0)
    return img


def img_np(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def img_set(img, arr):
    img.pixels.foreach_set(np.ascontiguousarray(arr, np.float32).ravel())
    img.update()


def dilate(arr, mask, iters=24):
    """把有效像素向外扩（UV 岛外的空隙），避免 mipmap 与接缝漏色"""
    a = arr.copy()
    m = mask.astype(np.float32)
    a[m == 0] = 0
    for _ in range(iters):
        s = np.zeros_like(a)
        c = np.zeros_like(m)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            s += np.roll(np.roll(a * m[..., None], dy, 0), dx, 1)
            c += np.roll(np.roll(m, dy, 0), dx, 1)
        grow = (m == 0) & (c > 0)
        a[grow] = s[grow] / c[grow][:, None]
        m = np.where(grow, 1.0, m)
        if not grow.any():
            break
    return a


def save_webp(img, path, size=1024):
    """非颜色数据图存 WebP（小样页面内联用）：复制一份缩放后按原值写出"""
    cp = img.copy()
    cp.colorspace_settings.name = "Non-Color"
    if cp.size[0] != size:
        cp.scale(size, size)
    sc = bpy.context.scene
    st = sc.render.image_settings
    st.file_format, st.quality, st.color_mode = "WEBP", 92, "RGB"
    sc.view_settings.view_transform, sc.view_settings.look = "Standard", "None"
    cp.save_render(path, scene=sc)
    bpy.data.images.remove(cp)
    log("webp", path, os.path.getsize(path) // 1024, "KB")


def save_img(img, path, fmt="PNG"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = fmt
    img.save()


# =============================================================================================
# UV
# =============================================================================================
def uv_atlas(lows, density=None, margin=0.004):
    """所有低模一起 Smart UV → 按 density（组名 → 倍数）放大重点部位 → 打包到一张图"""
    only_select(lows, lows[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    if density:
        for lo in lows:
            k = density.get(lo.get("group", ""), 1.0)
            if k != 1.0:
                uv = lo.data.uv_layers.active.data
                a = np.empty(len(uv) * 2, np.float32)
                uv.foreach_get("uv", a)
                uv.foreach_set("uv", a * k)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    try:
        bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, margin_method="FRACTION", margin=margin, shape_method="CONCAVE")
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


# =============================================================================================
# 烘焙：高 → 低（逐组），numpy 合成
# =============================================================================================
def soft_normals(lo, c, r, k=0.75):
    """卡通脸：顶点法线向椭球法线靠（k = 椭球占比，脸前最强、颈部不变），写成自定义法线，glTF 导出带上"""
    P = np_verts(lo)
    N = np_vnormals(lo)
    q = (P - c) / (r * r)
    Ne = nrm(q)
    w = k * sstep(1.46, 1.52, P[:, 2]) * sstep(0.04, -0.03, P[:, 1])
    Nn = nrm(N * (1 - w[:, None]) + Ne * w[:, None])
    lo.data.normals_split_custom_set_from_vertices([tuple(v) for v in Nn])
    log("soft normals", lo.name, "avg weight %.2f" % w.mean())


def bake_maps(pairs, res, passes, extrusion, max_dist, samples=8, out_prefix=None, skip=None):
    """pairs: [(low, high)]；passes: {名: ("NORMAL"|"EMIT", 属性名或 None, noncolor)}。
    返回 {名: np.array(H,W,4)}，外加 "mask"。"""
    sc = setup_cycles(samples)
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = extrusion
    bk.max_ray_distance = max_dist
    bk.margin = 0
    bk.use_clear = False
    bk.normal_space = "TANGENT"
    bk.target = "IMAGE_TEXTURES"
    result = {}
    lows = [l for l, _ in pairs]
    saved = {lo.name: [s.material for s in lo.material_slots] for lo in lows}
    # 覆盖遮罩
    img = new_image("BK_mask", res)
    m = image_target_material("BKM_mask", img, white=True)
    for lo in lows:
        lo.data.materials.clear()
        lo.data.materials.append(m)
    bk.use_selected_to_active = False
    sc.cycles.samples = 1
    only_select(lows, lows[0])
    bpy.ops.object.bake(type="EMIT")
    mask = img_np(img)[..., 0] > 0.5
    result["mask"] = mask
    bk.use_selected_to_active = True
    for pname, (ptype, attr, noncolor) in passes.items():
        t = time.time()
        img = new_image("BK_" + pname, res, noncolor=noncolor)
        if ptype == "NORMAL":  # 不烘法线的组保留"平"的切线空间法线
            img.generated_color = (0.5, 0.5, 1.0, 1.0)
        tm = image_target_material("BKM_" + pname, img)
        for lo in lows:
            lo.data.materials.clear()
            lo.data.materials.append(tm)
        sc.cycles.samples = samples if ptype == "NORMAL" else 2
        for lo, hi in pairs:
            if skip and lo.get("group") in skip.get(pname, []):
                continue
            if ptype == "EMIT":
                for s in hi.material_slots:
                    set_emit_attr(s.material, attr)
            only_select([hi, lo], lo)
            bpy.ops.object.bake(type=ptype)
        arr = img_np(img)
        arr = dilate(arr, mask)
        arr[..., 3] = 1.0
        img_set(img, arr)
        result[pname] = img
        log("bake %-8s %.1fs" % (pname, time.time() - t))
    for lo in lows:
        lo.data.materials.clear()
        for mm in saved[lo.name]:
            lo.data.materials.append(mm)
    return result


# =============================================================================================
# 蒙皮
# =============================================================================================
def part_weights(P, parts, bones, part_bones, power=4, eps=0.01, top=3, bias=None):
    """原脚本同款公式：部件 → 候选骨骼，按到骨段距离的 power 次方反比取前 top 根"""
    segs = {b[0]: (np.array(tuple(b[1])), np.array(tuple(b[2]))) for b in bones}
    out = []
    for p, part in zip(P, parts):
        c = part_bones.get(part, [part])
        if len(c) == 1:
            out.append({c[0]: 1.0})
            continue
        ws = []
        for n in c:
            a, b = segs[n]
            ab = b - a
            t = max(0.0, min(1.0, float((p - a) @ ab) / max(float(ab @ ab), 1e-9)))
            d = float(np.linalg.norm(p - (a + ab * t)))
            if bias and n in bias:
                d *= bias[n]
            ws.append((n, 1.0 / (d + eps) ** power))
        ws.sort(key=lambda x: -x[1])
        ws = ws[:top]
        tot = sum(w for _, w in ws)
        out.append({n: w / tot for n, w in ws if w / tot > 0.01})
    return out


def apply_weights(ob, wlist, bone_names, E=None, smooth_iter=0, rigid=None, max_inf=4):
    """wlist: [{骨: 权重}]；沿网格平滑 smooth_iter 次（rigid：这些顶点不参与平滑），每顶点保留 max_inf 根"""
    names = list(bone_names)
    idx = {n: i for i, n in enumerate(names)}
    W = np.zeros((len(wlist), len(names)))
    for i, w in enumerate(wlist):
        for n, x in w.items():
            W[i, idx[n]] = x
    if smooth_iter and E is not None:
        W0 = W.copy()
        W = smooth_field(W, E, smooth_iter, 0.5)
        if rigid is not None:
            W[rigid] = W0[rigid]
    # 每顶点保留 max_inf 根并归一
    order = np.argsort(-W, 1)
    keep = np.zeros_like(W, bool)
    np.put_along_axis(keep, order[:, :max_inf], True, 1)
    W = np.where(keep & (W > 0.01), W, 0)
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    for n in names:
        if n not in ob.vertex_groups:
            ob.vertex_groups.new(name=n)
    for j, n in enumerate(names):
        vg = ob.vertex_groups[n]
        nz = np.nonzero(W[:, j])[0]
        for i in nz:
            vg.add([int(i)], float(W[i, j]), "REPLACE")


def bind(ob, arm):
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    ob.parent = arm


def join(objs, name):
    only_select(objs, objs[0])
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


# =============================================================================================
# 导出材质（glTF：baseColor / normal / ORM；同一套图集）
# =============================================================================================
def pbr_material(name, imgs, emissive=None, emit_strength=1.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])
    ta = nt.nodes.new("ShaderNodeTexImage")
    ta.image = imgs["albedo"]
    nt.links.new(ta.outputs["Color"], bs.inputs["Base Color"])
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = imgs["normal"]
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bs.inputs["Normal"])
    to = nt.nodes.new("ShaderNodeTexImage")
    to.image = imgs["orm"]
    sp = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(to.outputs["Color"], sp.inputs["Color"])
    nt.links.new(sp.outputs["Green"], bs.inputs["Roughness"])
    nt.links.new(sp.outputs["Blue"], bs.inputs["Metallic"])
    # glTF 的 occlusion：名为 "glTF Material Output" 的节点组
    grp = bpy.data.node_groups.get("glTF Material Output")
    if grp is None:
        grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gn = nt.nodes.new("ShaderNodeGroup")
    gn.node_tree = grp
    nt.links.new(sp.outputs["Red"], gn.inputs["Occlusion"])
    if emissive is not None:
        bs.inputs["Emission Color"].default_value = (*emissive, 1)
        bs.inputs["Emission Strength"].default_value = emit_strength
    return m


def export_glb(objs, arm, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    only_select(list(objs) + [arm], arm)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_skins=True,
        export_morph=False, export_cameras=False, export_lights=False, export_materials="EXPORT",
        export_tangents=True, export_image_format="WEBP", export_image_quality=92,
    )
    log("exported %s %d KB" % (path, os.path.getsize(path) // 1024))


# =============================================================================================
# 预览渲染（Workbench，正交，自动取景），多视角横向拼成一张
# =============================================================================================
def render_views(objs, path, views, size=600, color="VERTEX", attr=None, bg=(0.93, 0.9, 0.83)):
    """views: [(方位角°, 仰角°, 放大)]；方位角 0 = 从角色正面（-Y）看，90 = 从角色左侧（+X）看"""
    sc = bpy.context.scene
    prev_engine = sc.render.engine
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = color
    sh.show_cavity = True
    sh.cavity_type = "BOTH"
    sh.show_object_outline = True
    sh.object_outline_color = (0.05, 0.05, 0.05)
    sh.background_type = "VIEWPORT"
    sh.background_color = bg
    sc.display.render_aa = "8"
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.film_transparent = False
    if attr:
        for o in objs:
            if attr in o.data.color_attributes:
                o.data.color_attributes.active_color = o.data.color_attributes[attr]
                o.data.color_attributes.render_color_index = o.data.color_attributes.find(attr)
    hidden = []
    for o in sc.objects:
        if o.type == "MESH" and o not in objs and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        a = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", a)
        a = a.reshape(-1, 3)
        M = np.array(o.matrix_world)
        pts.append(a @ M[:3, :3].T + M[:3, 3])
        ev.to_mesh_clear()
    pts = np.concatenate(pts)
    lo, hi = pts.min(0), pts.max(0)
    c = (lo + hi) / 2
    ext = float(np.max(hi - lo))
    cam_d = bpy.data.cameras.new("RVcam")
    cam_d.type = "ORTHO"
    cam = bpy.data.objects.new("RVcam", cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    tiles = []
    tmp = os.path.join(WORK, "_rv_tmp.png")
    c0 = c
    for vw in views:
        az, el, zoom = vw[:3]
        c = A(vw[3]) if len(vw) > 3 else c0
        a, e = math.radians(az), math.radians(el)
        d = np.array([math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
        cam.location = Vector(c + d * ext * 3)
        cam.rotation_euler = (Vector(c) - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam_d.ortho_scale = ext * 1.08 / zoom
        cam_d.clip_end = ext * 10
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(tmp)
        tiles.append(img_np(im)[::-1].copy())
        bpy.data.images.remove(im)
    sheet = np.concatenate(tiles, 1)
    out = bpy.data.images.new("RVsheet", sheet.shape[1], sheet.shape[0], alpha=True)
    img_set(out, sheet[::-1])
    save_img(out, path)
    bpy.data.images.remove(out)
    bpy.data.objects.remove(cam)
    for o in hidden:
        o.hide_render = False
    sc.render.engine = prev_engine
    log("preview →", path)


# =============================================================================================
# 一站式：组 → 高模 → AO / 曲率 / 上色 → 预览 → 低模 → 图集 → 烘焙 → 材质分区 → 蒙皮 → 合并 → 导出
# =============================================================================================
def run_pipeline(C):
    """C: dict(
         name, groups [Group], arm, bones, part_bones, weight=dict(power, eps, top, bias),
         paint(gname, P, N, ao, cav) -> (col, ink, rough, metal),
         face_mats(gname, lo) -> np.array[材质名],  pal_emit {材质名: ((r,g,b), 强度)},
         obj_of {组名: 输出对象名}, out_objs [输出对象名…], target {组名: 三角面}, density {组名: 倍数},
         ao_dist, hide_for {组名: [组名…]}, res, extrusion, max_dist, smooth {组名: 迭代},
         previews [(文件名, [组名], views)], only_hi, quick, cav_scale)"""
    groups = C["groups"]
    HIGHS = {}
    for g in groups:
        if getattr(g, "premade", None) is not None:
            V, Q = g.premade
        else:
            D, o, h = g.field(band=C.get("band", 0.012))
            V, Q = surface_nets(D, o, h)
            del D
        hi = mesh_obj("HI_" + g.name, V, Q)
        hi["group"] = g.name
        HIGHS[g.name] = hi
        log("high %-10s %7d verts" % (g.name, len(V)))
    hide_for = {HIGHS[k].name: [HIGHS[x] for x in v] for k, v in C.get("hide_for", {}).items()}
    bake_ao_vertex(list(HIGHS.values()), C["ao_dist"], samples=24 if C.get("quick") else 40, hide_for=hide_for)
    cs = C.get("cav_scale", 160.0)
    for gname, hi in HIGHS.items():
        P = np_verts(hi)
        E = np_edges(hi)
        N = np_vnormals(hi)
        ao = smooth_field(get_color_attr(hi, "ao")[:, 0], E, 3) ** 0.6  # 柔一点：水墨画不要死黑的闭塞
        cav = smooth_field(curvature(P, N, E), E, 2)
        cav = cav / max(float(np.percentile(np.abs(cav), 85)), 1e-6)  # 按分位数归一：与体素大小无关，±1 ≈ 常见起伏，±2.5 = 明显的缝 / 棱
        if gname in C.get("flat", []):  # 脸、手：不要 AO / 曲率噪点（主管：水墨人物的脸要干净）
            ao = np.ones_like(ao)
            cav = np.zeros_like(cav)
        col, ink, rough, metal = C["paint"](gname, P, N, ao, cav)
        set_color_attr(hi, "alb", col)
        set_color_attr(hi, "dat", np.stack([ink, np.clip(0.5 + cav * 0.18, 0, 1), ao], 1))
        set_color_attr(hi, "orm", np.stack([ao, rough, metal], 1))
        m = emit_material("HM_" + gname, "alb")
        hi.data.materials.clear()
        hi.data.materials.append(m)
        log("painted %-10s ink %.2f ao %.2f" % (gname, ink.mean(), ao.mean()))
    for fname, gl, views in C.get("previews", []):
        render_views([HIGHS[k] for k in gl], os.path.join(WORK, fname), views, size=700, attr="alb")
    if C.get("only_hi"):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, C["name"] + "_hi.blend"))
        return None
    GOF = {g.name: g for g in groups}
    LOWS = {}
    for gname, hi in HIGHS.items():
        pre = getattr(GOF[gname], "premade", None) is not None
        lo = decimate(hi, C["target"][gname] * (0.5 if C.get("quick") else 1), "LO_" + gname, voxel=None if pre else GOF[gname].h,
                      sym=gname in C.get("symmetric", []))
        lo["group"] = gname
        if gname in C.get("symmetric", []) and getattr(GOF[gname], "premade", None) is None:  # 左右对称（减面后的三角排布不对称，脸会显歪）
            only_select([lo], lo)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.symmetrize(direction="POSITIVE_X")
            bpy.ops.mesh.quads_convert_to_tris()
            bpy.ops.object.mode_set(mode="OBJECT")
            lo.data.polygons.foreach_set("use_smooth", np.ones(len(lo.data.polygons), bool))
        LOWS[gname] = lo
    uv_atlas(list(LOWS.values()), density=C.get("density"), margin=0.003)
    for gname, (cc, rr) in C.get("soft_normals", {}).items():
        soft_normals(LOWS[gname], cc, rr)
    MAPS = bake_maps([(LOWS[k], HIGHS[k]) for k in LOWS], C["res"],
                     {"normal": ("NORMAL", None, True), "albedo": ("EMIT", "alb", False), "ink": ("EMIT", "dat", True), "orm": ("EMIT", "orm", True)},
                     extrusion=C["extrusion"], max_dist=C["max_dist"], samples=4, skip={"normal": C.get("no_normal", [])})
    for k in ("normal", "albedo", "ink", "orm"):
        save_img(MAPS[k], os.path.join(OUT_DIR, "%s_%s.png" % (C["name"], k)))
    save_webp(MAPS["ink"], os.path.join(OUT_DIR, "%s_ink.webp" % C["name"]), 1024)
    MATS = {}

    def mat(nm):
        if nm not in MATS:
            e = C.get("pal_emit", {}).get(nm)
            MATS[nm] = pbr_material(nm, MAPS, emissive=e[0] if e else None, emit_strength=e[1] if e else 1.0)
        return MATS[nm]

    deform = [b[0] for b in C["bones"] if b[4]]
    W = C.get("weight", {})
    for gname, lo in LOWS.items():
        names = C["face_mats"](gname, lo)
        uniq = sorted(set(names))
        lo.data.materials.clear()
        for u in uniq:
            lo.data.materials.append(mat(u))
        lo.data.polygons.foreach_set("material_index", np.array([uniq.index(n) for n in names], np.int32))
        P = np_verts(lo)
        parts, _ = GOF[gname].eval_parts(P)
        dflt = C.get("default_part", "body")
        parts = [p if p is not None else dflt for p in parts]
        w = part_weights(P, parts, C["bones"], C["part_bones"], power=W.get("power", 4), eps=W.get("eps", 0.01), top=W.get("top", 3), bias=W.get("bias"))
        apply_weights(lo, w, deform, E=np_edges(lo), smooth_iter=C.get("smooth", {}).get(gname, 2))
        bind(lo, C["arm"])
    for o in HIGHS.values():
        o.hide_render = True
        o.hide_set(True)
    FINAL = []
    for oname in C["out_objs"]:
        objs = [LOWS[g] for g in LOWS if C["obj_of"][g] == oname]
        ob = join(objs, oname) if len(objs) > 1 else objs[0]
        ob.name = oname
        ob.data.name = oname
        ob.data.calc_loop_triangles()
        log("final %-16s %6d tris, materials %s" % (oname, len(ob.data.loop_triangles), [m.name for m in ob.data.materials]))
        FINAL.append(ob)
    export_glb(FINAL, C["arm"], os.path.join(OUT_DIR, C["name"] + ".glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, C["name"] + "_build.blend"))
    log("done")
    return FINAL
