# 墨途 · 通用生物预览渲染 + 导出校验（导入 assets/models/<name>.glb 后渲染）
#   blender.exe -b --factory-startup --python blender/render_creature.py -- golem
# 产出：assets/previews/<name>_side.png / _front.png / _topdown45.png / _game_scale.png / _poses.png
# 取景按包围盒自动计算；动作帧表：每个动作取 2 帧（循环动作取 1/4、3/4，招式取"命中帧"附近与末帧）。
import bpy
import math
import os
import sys
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["golem"]
NAME = ARGS[0]
# 可选参数（美术管线 2026-11-17 加，旧用法不变）：
#   --scale=2.6        游戏里的缩放（只影响 _game_scale.png，让大体型首领按真实大小出图）
#   --hide=a,b         隐藏这些网格对象（按名字，如 qingya_crack,qingya_eyefire = 一阶段外观）
#   --tag=_p2          输出文件名后缀（qingya_p2_topdown45.png …）
#   --poses=0          不出动作拼图（只出静态视图，换外观时用）
#   --zoom=1.6         动作拼图取景放大倍数
OPT = dict(a[2:].split("=", 1) for a in ARGS[1:] if a.startswith("--") and "=" in a)
GSCALE = float(OPT.get("scale", 1))
HIDE = [h for h in OPT.get("hide", "").split(",") if h]
TAG = OPT.get("tag", "")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GLB = os.path.join(ROOT, "assets", "models", NAME + ".glb")
OUT = os.path.join(ROOT, "assets", "previews")
TMP = os.path.join(ROOT, "work", NAME + "_tmp")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=GLB)

arm = next(o for o in scene.objects if o.type == "ARMATURE")
meshes = [o for o in scene.objects if o.type == "MESH" and o.parent == arm]
print("[verify] meshes", [(m.name, sum(len(p.vertices) - 2 for p in m.data.polygons)) for m in meshes])
for m in meshes:
    if m.name in HIDE or (m.data and m.data.name in HIDE):
        m.hide_render = True
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
# 地面（看清离地高度）
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
ground = bpy.context.active_object
gm = bpy.data.materials.new("ground")
gm.diffuse_color = (0.86, 0.83, 0.75, 1)
ground.data.materials.append(gm)
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


# glTF 导入后：Blender Z 向上，生物面向 -Y
c = (mn + mx) / 2
size = max(mx.x - mn.x, mx.y - mn.y, mx.z) * 1.25
set_pose("idle", 0)
cam_data.type = "ORTHO"
cam_data.ortho_scale = size
look((c.x + 20, c.y, c.z), (c.x, c.y, c.z))
render(os.path.join(OUT, NAME + TAG + "_side.png"), 900, 700)
look((c.x, c.y - 20, c.z), (c.x, c.y, c.z))
render(os.path.join(OUT, NAME + TAG + "_front.png"), 700, 700)
# 游戏视角：斜 45° 俯视，从前左方
cam_data.type = "PERSP"
cam_data.lens = 85
d = size * 2.6
az = math.radians(-120)
look((c.x + d * math.cos(az), c.y + d * math.sin(az), c.z * 0.5 + d), (c.x, c.y, c.z * 0.5))
render(os.path.join(OUT, NAME + TAG + "_topdown45.png"), 800, 800)
# 游戏里的大小：与主角相同的镜头距离（约 14 m 外、45°）
cam_data.lens = 35
arm.scale = (GSCALE, GSCALE, GSCALE)
look((10 * math.cos(az), 10 * math.sin(az), 10), (0, 0, 0.8))
render(os.path.join(OUT, NAME + TAG + "_game_scale.png"), 480, 270)
arm.scale = (1, 1, 1)
if OPT.get("poses") == "0":
    print("[render] done (no poses)")
    raise SystemExit

cam_data.lens = 60
az = math.radians(-35)
d = size * 2.3 / float(OPT.get("zoom", 1))  # --zoom=1.6 拼图取景更近
look((c.x + d * math.cos(az), c.y + d * math.sin(az), c.z + size * 0.6), (c.x, c.y, c.z * 0.8))
W, H = 380, 340
poses = []
for k, a in acts.items():
    f0, f1 = a.frame_range
    n = f1 - f0
    if k in ("idle", "run"):
        poses += [(k, f0 + n * 0.25), (k, f0 + n * 0.75)]
    else:
        poses += [(k, f0 + n * 0.4), (k, f1)]
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
COLS = 6
while len(tiles) % COLS:
    tiles.append(np.ones((H, W, 4), dtype=np.float32))
rows = [np.concatenate(tiles[i:i + COLS], axis=1) for i in range(0, len(tiles), COLS)]
st = np.concatenate(rows[::-1], axis=0)  # 图片像素自下而上
out = bpy.data.images.new(NAME + "_poses", st.shape[1], st.shape[0], alpha=False)
out.pixels.foreach_set(st.ravel())
out.filepath_raw = os.path.join(OUT, NAME + TAG + "_poses.png")
out.file_format = "PNG"
out.save()
print("[render] done", ", ".join("%s@%d" % (a, f) for a, f in poses))
