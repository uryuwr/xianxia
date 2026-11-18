# 墨途 · 林墨头部：用 MPFB（MakeHuman 的 Blender 插件）生成 CC0 基础网格的头 + 颈，导出纯数据给 build_hero_v2.py
#   MPFB 2.0.18（GPL-3.0，extensions.blender.org/add-ons/mpfb/），装在独立目录 D:/tools/mpfb2/extensions（不碰用户自己的 Blender 配置）：
#     export BLENDER_USER_CONFIG=D:/tools/mpfb2/config BLENDER_USER_EXTENSIONS=D:/tools/mpfb2/extensions
#     $B -b -t 8 --python blender/refine_v1/mpfb_head.py      # → work/refine_v1/mpfb_head.npz（+ mpfb_head_preview.png）
#   只用插件自带的 MakeHuman 基础网格 base.obj 与 targets（CC0）；不用任何 CC-BY / 第三方资产包。
#   插件是 GPL：调用插件 API 的代码只在本脚本里；其他构建脚本只读这里导出的 .npz（顶点 / 面 / 关节点），不 import 插件。
import os
import sys
import json
import numpy as np
import bpy
import addon_utils

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "work", "refine_v1", "mpfb_head.npz")

addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

# 宏参数：男、25 岁上下、偏瘦、"理想化"比例、东亚
MACRO = {"gender": 1.0, "age": 0.5, "muscle": 0.55, "weight": 0.42, "proportions": 0.8, "height": 0.6, "cupsize": 0.5, "firmness": 0.5,
         "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0}}
bm = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=MACRO)
dg = bpy.context.evaluated_depsgraph_get()
ev = bm.evaluated_get(dg)
me = ev.to_mesh()
nv = len(me.vertices)
V = np.empty(nv * 3, np.float32)
me.vertices.foreach_get("co", V)
V = V.reshape(-1, 3).astype(np.float64)
M = np.array(bm.matrix_world)
V = V @ M[:3, :3].T + M[:3, 3]

gname = {g.index: g.name for g in bm.vertex_groups}
member = {}
for v in bm.data.vertices:
    for g in v.groups:
        if g.weight > 0.5:
            member.setdefault(gname[g.group], []).append(v.index)
joints = {k: V[np.array(idx)].mean(0).tolist() for k, idx in member.items() if k.startswith("joint-")}
body = np.zeros(nv, bool)
body[member["body"]] = True
eye = np.zeros(nv, bool)
for k in ("helper-l-eye", "helper-r-eye"):
    eye[member[k]] = True

neck_z = joints["joint-neck"][2]
cut = neck_z - 0.035
polys = [list(p.vertices) for p in me.polygons]
keep = []
for f in polys:
    pv = V[f]
    if all(body[i] for i in f) and pv[:, 2].min() > cut:
        keep.append(f)
    elif all(eye[i] for i in f):
        keep.append(f)
used = sorted({i for f in keep for i in f})
remap = {v: k for k, v in enumerate(used)}
Vh = V[used]
lab = np.where(eye[used], 1, 0)
nmax = max(len(f) for f in keep)
F = np.full((len(keep), nmax), -1, np.int32)
for i, f in enumerate(keep):
    F[i, :len(f)] = [remap[v] for v in f]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
np.savez(OUT, V=Vh, F=F, label=lab, joints=json.dumps(joints), macro=json.dumps(MACRO))
print("[mpfb_head] body verts %d → head %d verts, %d faces; neck z %.3f, height %.3f m" % (nv, len(Vh), len(keep), neck_z, V[:, 2].max()))
print("[mpfb_head] joints", {k: [round(x, 3) for x in joints[k]] for k in ("joint-neck", "joint-head", "joint-head-2", "joint-l-eye", "joint-r-eye", "joint-mouth", "joint-jaw") if k in joints})
print("[mpfb_head] wrote", OUT)
