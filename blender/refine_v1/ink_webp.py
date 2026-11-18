# 墨贴图 PNG（2048）→ WebP（1024），供小样页面内联（页面体积减半）
#   $B -b -t 8 --factory-startup --python blender/refine_v1/ink_webp.py -- hero_v2 qingya_v2
import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "docs", "art", "精细化小样_v1", "assets"))
names = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["hero_v2", "qingya_v2"]
sc = bpy.context.scene
sc.render.image_settings.file_format = "WEBP"
sc.render.image_settings.quality = 92
sc.render.image_settings.color_mode = "RGB"
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "None"
for n in names:
    src = os.path.join(OUT, n + "_ink.png")
    im = bpy.data.images.load(src)
    im.colorspace_settings.name = "Non-Color"
    im.scale(1024, 1024)
    dst = os.path.join(OUT, n + "_ink.webp")
    im.save_render(dst, scene=sc)
    print("[ink_webp]", dst, os.path.getsize(dst) // 1024, "KB")
