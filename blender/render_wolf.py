# 墨途 · 狼妖预览渲染 + 导出校验（导入 wolf.glb 后渲染）
#   blender.exe -b --factory-startup --python blender/render_wolf.py
# 产出：assets/previews/wolf_side.png / wolf_front.png / wolf_topdown45.png / wolf_poses.png

import bpy
import math
import os
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GLB = os.path.join(ROOT, "assets", "models", "wolf.glb")
OUT = os.path.join(ROOT, "assets", "previews")
TMP = os.path.join(ROOT, "work", "wolf_tmp")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=GLB)

arm = next(o for o in scene.objects if o.type == "ARMATURE")
meshes = [o for o in scene.objects if o.type == "MESH" and o.parent == arm]
tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
mn = Vector((1e9, 1e9, 1e9))
mx = -mn
for m in meshes:
    for v in m.data.vertices:
        w = m.matrix_world @ v.co
        mn = Vector(map(min, mn, w))
        mx = Vector(map(max, mx, w))
print("[verify] tris", tris, "bbox", tuple(round(c, 2) for c in mn), tuple(round(c, 2) for c in mx))
print("[verify] bones", len(arm.data.bones))
print("[verify] materials", sorted({s.material.name for m in meshes for s in m.material_slots if s.material}))
acts = {a.name: a for a in bpy.data.actions}
for k, a in acts.items():
    print("[verify] action", k, tuple(round(x, 2) for x in a.frame_range))


def set_pose(name, frame):
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks:
        tr.mute = True
    a = next(v for k, v in acts.items() if k == name or k.startswith(name + "_") or k.startswith(name + "."))
    ad.action = a
    if hasattr(ad, "action_slot") and ad.action_slot is None and len(a.slots):
        ad.action_slot = a.slots[0]
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
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


set_pose("idle", 0)
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.6
look((6, -0.2, 0.85), (0, -0.2, 0.85))
render(os.path.join(OUT, "wolf_side.png"), 900, 700)
look((0, -6, 0.85), (0, 0, 0.85))
render(os.path.join(OUT, "wolf_front.png"), 600, 700)
cam_data.type = "PERSP"
cam_data.lens = 85
h = 5.5
az = math.radians(-120)
look((h * math.cos(az), h * math.sin(az), 0.6 + h), (0, -0.1, 0.6))
render(os.path.join(OUT, "wolf_topdown45.png"), 800, 800)
cam_data.lens = 35
render(os.path.join(OUT, "wolf_game_scale.png"), 480, 270)

cam_data.lens = 60
az = math.radians(-35)
look((6.0 * math.cos(az), 6.0 * math.sin(az), 2.6), (0, -0.1, 0.7))
W, H = 380, 340
poses = [("idle", 0), ("run", 2), ("run", 9), ("attack_bite", 7), ("attack_bite", 10), ("attack_claw", 6), ("attack_claw", 9), ("hit", 2), ("howl", 15), ("die", 30)]
tiles = []
for i, (a, f) in enumerate(poses):
    set_pose(a, f)
    p = os.path.join(TMP, "pose_%d.png" % i)
    render(p, W, H)
    img = bpy.data.images.load(p)
    px = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    tiles.append(px.reshape(H, W, 4))
    bpy.data.images.remove(img)
rows = [np.concatenate(tiles[:5], axis=1), np.concatenate(tiles[5:], axis=1)]
st = np.concatenate([rows[1], rows[0]], axis=0)  # 图片像素自下而上：第一行放在后面
out = bpy.data.images.new("wolf_poses", st.shape[1], st.shape[0], alpha=False)
out.pixels.foreach_set(st.ravel())
out.filepath_raw = os.path.join(OUT, "wolf_poses.png")
out.file_format = "PNG"
out.save()
print("[render] done", ", ".join("%s@%d" % p for p in poses))
