# 墨途 · 场景件预览（导入 assets/models/props/*.glb 渲染）：每件一张 45° 俯视 + 一张侧视，另拼一张总览
#   blender.exe -b --factory-startup --python blender/render_props.py [-- id1 id2 …]
# 产出：assets/previews/props_<id>_topdown45.png、props_<id>_side.png、props_wolfvalley_sheet.png（旁边放 1.75 米人形标尺）
import bpy
import math
import os
import sys
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "assets", "models", "props")
OUT = os.path.join(ROOT, "assets", "previews")
TMP = os.path.join(ROOT, "work", "props_tmp")
os.makedirs(TMP, exist_ok=True)
IDS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["wolf_king_rock", "fang_pillar", "fang_pillar_broken", "wolf_totem", "wolf_totem_fallen", "wolf_rock", "mist_gate", "bone_long", "bone_mid", "bone_short", "bone_rib", "wolf_skull", "antler", "straw_nest"]


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_object_outline = True
    sh.object_outline_color = (0.05, 0.05, 0.05)
    sh.show_cavity = True
    sh.cavity_type = "WORLD"
    w = bpy.data.worlds.new("paper")
    w.color = (0.93, 0.9, 0.83)
    sc.world = w
    sc.display.render_aa = "8"
    sc.view_settings.view_transform = "Standard"
    bpy.ops.mesh.primitive_plane_add(size=60)
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.diffuse_color = (0.86, 0.83, 0.75, 1)
    g.data.materials.append(gm)
    # 人形标尺：1.75 米的圆柱（林墨身高）
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=1.75, location=(0, 0, 0.875))
    ref = bpy.context.active_object
    rm = bpy.data.materials.new("ref")
    rm.diffuse_color = (0.95, 0.95, 0.93, 1)
    ref.data.materials.append(rm)
    cd = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam, ref


def look(cam, pos, tgt):
    cam.location = Vector(pos)
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()


def render(sc, path, w, h):
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


tiles = []
W, H = 520, 460
for pid in IDS:
    sc, cam, ref = setup()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, pid + ".glb"))
    objs = [o for o in sc.objects if o.type == "MESH" and o.name not in ("Plane", "Cylinder")]
    for o in objs:  # glTF 导入只写节点颜色，Workbench 读 diffuse_color
        for sl in o.material_slots:
            m = sl.material
            n = m and m.node_tree and m.node_tree.nodes.get("Principled BSDF")
            if n:
                m.diffuse_color = tuple(n.inputs["Base Color"].default_value)
    mn = Vector((1e9, 1e9, 1e9))
    mx = -mn
    tris = 0
    for o in objs:
        tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            mn = Vector(map(min, mn, p))
            mx = Vector(map(max, mx, p))
    print("[verify] %s tris %d bbox %s %s mats %s" % (pid, tris, tuple(round(c, 2) for c in mn), tuple(round(c, 2) for c in mx),
                                                   sorted({s.material.name for o in objs for s in o.material_slots if s.material})))
    size = max(mx.x - mn.x, mx.y - mn.y, mx.z, 2.0)
    ref.location = (mn.x - 0.6, mx.y + 0.3, 0.875)
    c = (mn + mx) / 2
    cam.data.type = "PERSP"
    cam.data.lens = 50
    d = size * 2.4
    az = math.radians(-110)
    look(cam, (c.x + d * math.cos(az), c.y + d * math.sin(az), d), (c.x, c.y, c.z * 0.5))  # 45° 俯视（与游戏同向：从正面偏左上方看）
    p = os.path.join(OUT, "props_%s_topdown45.png" % pid)
    render(sc, p, W, H)
    look(cam, (c.x, c.y - d * 1.2, c.z * 0.6 + 0.3), (c.x, c.y, c.z * 0.6))
    render(sc, os.path.join(OUT, "props_%s_side.png" % pid), W, H)
    img = bpy.data.images.load(p)
    px = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    tiles.append(px.reshape(H, W, 4))
if len(IDS) > 1:
    COLS = 4
    while len(tiles) % COLS:
        tiles.append(np.ones((H, W, 4), dtype=np.float32))
    rows = [np.concatenate(tiles[i:i + COLS], axis=1) for i in range(0, len(tiles), COLS)]
    st = np.concatenate(rows[::-1], axis=0)
    out = bpy.data.images.new("sheet", st.shape[1], st.shape[0], alpha=False)
    out.pixels.foreach_set(st.ravel())
    out.filepath_raw = os.path.join(OUT, "props_wolfvalley_sheet.png")
    out.file_format = "PNG"
    out.save()
print("[render] done")
