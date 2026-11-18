# UI 体检 v1 落地：改前 / 改后对比拼图（不开浏览器，PIL 拼）。
# 读 work/shots/ui_hud_v1_{before,after}_<态>.png → 复制成 png/impl_{before,after}_<态>.png，拼 png/impl_compare.png（每行一个态，左改前右改后）
# 和局部放大 png/impl_zoom.png（左上气血组 / 敌人头顶 / 地面预警 / 右上小字）。
# 运行：docs/review/ui/.venv/Scripts/python docs/ui/v3/体检_v1/impl_sheet.py
import os, shutil
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
SH = os.path.join(ROOT, "work", "shots")
OUT = os.path.join(HERE, "png")
STATES = [("full", "满血"), ("hit", "受击瞬间（62%）"), ("low", "残血 24%"), ("low_hit", "残血 + 受击"), ("enemies", "敌人头顶血条 · 境界标签"), ("tele", "地面预警（扇形 / 直线 / 圆形）")]
FONT = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
SMALL = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)

def img(tag, st):
    return Image.open(os.path.join(SH, f"ui_hud_v1_{tag}_{st}.png")).convert("RGB")

for tag in ("before", "after"):
    for st, _ in STATES:
        shutil.copy(os.path.join(SH, f"ui_hud_v1_{tag}_{st}.png"), os.path.join(OUT, f"impl_{tag}_{st}.png"))

# 总对比：每格 640×360
W, H, HD = 640, 360, 34
S = Image.new("RGB", (W * 2 + 6, HD + len(STATES) * (H + HD)), (30, 30, 30))
d = ImageDraw.Draw(S)
d.text((10, 4), "改前（现状）", fill=(240, 236, 220), font=FONT)
d.text((W + 16, 4), "改后（UI 体检 v1 推荐方案落地）", fill=(255, 190, 170), font=FONT)
for i, (st, name) in enumerate(STATES):
    y = HD + i * (H + HD)
    d.text((10, y + 4), name, fill=(220, 214, 196), font=SMALL)
    for j, tag in enumerate(("before", "after")):
        S.paste(img(tag, st).resize((W, H), Image.LANCZOS), (j * (W + 6), y + HD - 4))
S.save(os.path.join(OUT, "impl_compare.png"))

# 局部放大：每行一个区域，左右对照（原尺寸 ×k）
ZOOM = [("full", (0, 0, 480, 150), 1.5, "左上气血组（满血）"), ("low", (0, 0, 480, 150), 1.5, "左上气血组（残血）"),
        ("enemies", (330, 190, 600, 160), 1.2, "敌人头顶：精英 / 普通"), ("tele", (260, 180, 760, 440), 0.95, "地面预警"),
        ("full", (440, 0, 840, 270), 0.85, "上中 / 右上小字")]
rows = []
for st, (x, y, w, h), k, name in ZOOM:
    a = img("before", st).crop((x, y, x + w, y + h)).resize((int(w * k), int(h * k)), Image.LANCZOS)
    b = img("after", st).crop((x, y, x + w, y + h)).resize((int(w * k), int(h * k)), Image.LANCZOS)
    rows.append((name, a, b))
ZW = max(r[1].width for r in rows)
ZH = sum(r[1].height + HD for r in rows) + HD
Z = Image.new("RGB", (ZW * 2 + 6, ZH), (30, 30, 30))
d = ImageDraw.Draw(Z)
d.text((10, 4), "改前", fill=(240, 236, 220), font=FONT)
d.text((ZW + 16, 4), "改后", fill=(255, 190, 170), font=FONT)
y = HD
for name, a, b in rows:
    d.text((10, y + 4), name, fill=(220, 214, 196), font=SMALL)
    Z.paste(a, (0, y + HD - 4))
    Z.paste(b, (ZW + 6, y + HD - 4))
    y += a.height + HD
Z.save(os.path.join(OUT, "impl_zoom.png"))
print("ok", os.path.join(OUT, "impl_compare.png"), os.path.join(OUT, "impl_zoom.png"))
