# 墨途 · 主角预览渲染 + 导出校验（导入 hero.glb 后渲染，顺带验证导出结果）
#   blender.exe -b --factory-startup --python blender/render_hero.py
# 产出：assets/previews/hero_front.png / hero_side.png / hero_back.png / hero_topdown45.png / hero_game_scale.png / hero_poses.png

import bpy
import math
import os
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GLB = os.path.join(ROOT, "assets", "models", "hero.glb")
OUT = os.path.join(ROOT, "assets", "previews")
TMP = os.path.join(ROOT, "work", "hero_tmp")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30  # 导入前设置，帧号与导出时一致
bpy.ops.import_scene.gltf(filepath=GLB)

# ---- 校验 ----
arm = next(o for o in scene.objects if o.type == "ARMATURE")
meshes = [o for o in scene.objects if o.type == "MESH" and o.parent == arm]  # 排除导入器生成的骨骼显示球
tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
mn = Vector((1e9, 1e9, 1e9))
mx = -mn
for m in meshes:
    for v in m.data.vertices:
        w = m.matrix_world @ v.co
        mn = Vector(map(min, mn, w))
        mx = Vector(map(max, mx, w))
print("[verify] meshes", [m.name for m in meshes], "tris", tris)
print("[verify] bbox min", tuple(round(c, 3) for c in mn), "max", tuple(round(c, 3) for c in mx))
print("[verify] bones", len(arm.data.bones), [b.name for b in arm.data.bones])
print("[verify] materials", sorted({s.material.name for m in meshes for s in m.material_slots if s.material}))
acts = {}
for a in bpy.data.actions:
    acts[a.name] = a
    print("[verify] action", a.name, tuple(round(x, 2) for x in a.frame_range))


def find_action(name):
    for k, a in acts.items():
        if k == name or k.startswith(name + "_") or k.startswith(name + "."):
            return a
    raise KeyError(name)


def set_pose(name, frame):
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks:
        tr.mute = True
    ad.action = find_action(name)
    if hasattr(ad, "action_slot") and ad.action_slot is None and len(ad.action.slots):
        ad.action_slot = ad.action.slots[0]
    scene.frame_set(int(frame))


# ---- 渲染设置：Workbench 平光 + 描边，宣纸色背景 ----
scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light = "STUDIO"
sh.color_type = "MATERIAL"
sh.show_object_outline = True
sh.object_outline_color = (0.05, 0.05, 0.05)
sh.show_cavity = True
sh.cavity_type = "WORLD"
sh.show_shadows = False
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
    d = Vector(target) - Vector(pos)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render(path, w, h):
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# 正 / 侧 / 背：正交
set_pose("idle", 0)
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.05
for name, pos in (("front", (0, -6, 0.92)), ("side", (6, 0, 0.92)), ("back", (0, 6, 0.92))):
    look(pos, (0, 0, 0.92))
    render(os.path.join(OUT, "hero_%s.png" % name), 600, 900)

# 45° 俯视（与游戏镜头一致：窄视角透视，从角色右前方俯瞰）
cam_data.type = "PERSP"
cam_data.lens = 85
h = 4.6
az = math.radians(-120)  # 相机在角色右前方
look((h * math.cos(az), h * math.sin(az), 0.85 + h), (0, 0, 0.85))
render(os.path.join(OUT, "hero_topdown45.png"), 800, 800)
# 游戏实际大小：角色在 720p 画面中约 120 像素高
cam_data.lens = 35
render(os.path.join(OUT, "hero_game_scale.png"), 480, 270)

# 动作关键帧条：3/4 前视
cam_data.lens = 70
az = math.radians(-115)
look((5.0 * math.cos(az), 5.0 * math.sin(az), 2.2), (0, 0, 0.95))
W, H = 360, 520


def strip(poses, name):
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
    st = np.concatenate(tiles, axis=1)
    out = bpy.data.images.new(name, st.shape[1], st.shape[0], alpha=False)
    out.pixels.foreach_set(st.ravel())
    out.filepath_raw = os.path.join(OUT, name + ".png")
    out.file_format = "PNG"
    out.save()
    print("[verify] %s:" % name, ", ".join("%s@%d" % p for p in poses))


strip([("idle", 0), ("run", 4), ("slash1", 3), ("slash1", 7), ("slash2", 6), ("slash3", 4), ("slash3", 8), ("dodge", 5), ("guard", 0)], "hero_poses")
# 施法手势、受击、倒地（v0.3）
strip([("cast_point", 2), ("cast_point", 6), ("cast_sweep", 3), ("cast_sweep", 8), ("cast_raise", 10), ("hit", 3), ("die", 6), ("die", 18), ("die", 35)], "hero_poses_cast")
# 首领处决（青牙 v2）：跃起、插甲、居合
strip([("execute_leap", 4), ("execute_leap", 10), ("execute_leap", 16), ("execute_stab", 4), ("execute_stab", 6), ("execute_draw", 9), ("execute_draw", 18), ("execute_draw", 23), ("execute_draw", 34)], "hero_poses_exec")
print("[render] done")
