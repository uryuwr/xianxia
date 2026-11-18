# 体检_v1 对比度量：node 不需要；运行  docs/review/ui/.venv/Scripts/python docs/ui/v3/体检_v1/measure.py
# 1) 把精细化小样截图左上角的"精细版 · X"标题抹掉，存到 img/bg_*.png（草图底图）
# 2) 按 HUD 分区统计背景亮度分布（P5 / P50 / P95），算各 HUD 元素在"最差背景"上的对比度（WCAG 相对亮度公式，XAG 101 ≥ 4.5:1）
# 3) 量每个分区背景的"纹理强度"（3×3 邻域亮度标准差的中位数）：精细化后细线条会不会被纹理吃掉
# 输出：measure.json（报告里的表格从这里抄）
import json, os
from PIL import Image, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.abspath(__file__))
PRJ = os.path.abspath(os.path.join(ROOT, "..", "..", "..", ".."))
ART = os.path.join(PRJ, "docs", "art", "精细化小样_v1", "png")
SRC = {
    "现状": os.path.join(ART, "old_game.png"),
    "A": os.path.join(ART, "A_game.png"),
    "B": os.path.join(ART, "B_game.png"),
    "C": os.path.join(ART, "C_game.png"),
}

def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def L(rgb):
    r, g, b = rgb[:3]
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def cr(a, b):
    la, lb = L(a), L(b)
    if la < lb: la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)

def over(fg, a, bg):  # sRGB 空间 alpha 混合（浏览器 CSS 默认就是 sRGB 混合）
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3))

def hexrgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# 1) 去标题：把 y 34..60 这一带复制到 y 6..32（只在 x < 470），再轻微模糊接缝
os.makedirs(os.path.join(ROOT, "img"), exist_ok=True)
clean = {}
for k, p in SRC.items():
    im = Image.open(p).convert("RGB")
    band = im.crop((0, 34, 470, 62))
    im.paste(band, (0, 6))
    seam = im.crop((0, 28, 470, 40)).filter(ImageFilter.GaussianBlur(1.2))
    im.paste(seam, (0, 28))
    out = os.path.join(ROOT, "img", f"bg_{ {'现状': 'old', 'A': 'A', 'B': 'B', 'C': 'C'}[k] }.png")
    im.save(out)
    clean[k] = im

# 2) 分区（1280×720 设计坐标，取自 hud.js / runhud.js / skillbar.js 的实际位置）
ZONES = {
    "左上·气血组": (14, 12, 430, 140),
    "上中·天时": (470, 6, 810, 80),
    "右上·估价": (940, 10, 1090, 92),
    "右上·镜下方位": (1090, 180, 1270, 202),
    "右侧·机缘/委托": (1130, 230, 1270, 260),
    "下中·技能栏字": (300, 676, 800, 714),
    "右下·境界修为": (1020, 640, 1262, 704),
}

def pct(vals, q):
    s = sorted(vals); return s[min(len(s) - 1, int(q * len(s)))]

res = {"zones": {}, "elements": [], "texture": {}}
for k, im in clean.items():
    g = im.convert("L")
    edge = g.filter(ImageFilter.FIND_EDGES)
    for zn, box in ZONES.items():
        reg = im.crop(box)
        px = list(reg.getdata())
        ls = sorted(px, key=L)
        d = ls[int(0.05 * len(ls))]; m = ls[len(ls) // 2]; b = ls[int(0.95 * len(ls))]
        tex = ImageStat.Stat(edge.crop(box)).mean[0]
        res["zones"].setdefault(zn, {})[k] = {
            "P5": "#%02x%02x%02x" % tuple(map(int, d)), "P50": "#%02x%02x%02x" % tuple(map(int, m)), "P95": "#%02x%02x%02x" % tuple(map(int, b)),
            "L5": round(L(d), 3), "L50": round(L(m), 3), "L95": round(L(b), 3), "边缘强度": round(tex, 1),
        }

# 3) 元素：fg 颜色 + alpha；底衬 wash（颜色 + alpha，没有就 None）；在每个分区 P5 / P95 背景上算对比度，取最差
PAPER = (240, 234, 218)
ELS = [
    # 名称, 分区, 前景, 前景 alpha, 底衬 alpha（None = 无底衬，只有 3px 纸色 text-shadow）, 说明
    ("气血条·现状焦墨 #1a1c1e", "左上·气血组", "#1a1c1e", 1, 0.80, "hud.js .hp .fill"),
    ("气血条·朱 #b8291a", "左上·气血组", "#b8291a", 1, 0.80, "风格指南 .hp"),
    ("真气条 #3f8fa8", "左上·气血组", "#3f8fa8", 1, 0.80, "hud.js .mp .fill 中段"),
    ("气势条 焦墨", "左上·气血组", "#15181b", 1, 0.80, "momentum.js"),
    ("气血数值 15px #1c1e20", "左上·气血组", "#1c1e20", 1, 0.80, "hud.js .val"),
    ("天时小字 12px ink-zhong", "上中·天时", "#15181b", 0.58, None, "runhud .mk-tod .sub"),
    ("天时刻度 15px ink-dan", "上中·天时", "#15181b", 0.36, None, "runhud .mk-tod .ticks"),
    ("估价大数 #9a7526", "右上·估价", "#9a7526", 1, None, "runhud .mk-val .n"),
    ("储物袋小字 12px ink-zhong", "右上·估价", "#15181b", 0.58, None, "runhud .mk-val .s"),
    ("镜下方位 12px ink-zhong", "右上·镜下方位", "#15181b", 0.58, None, "runhud .mk-mirror-w .cap"),
    ("镜下方位 朱字 14px", "右上·镜下方位", "#b8291a", 1, None, "runhud .cap b"),
    ("机缘 12px ink-zhong", "右侧·机缘/委托", "#15181b", 0.58, None, "runhud .mk-quests .fo"),
    ("技能解锁字 11px ink-zhong", "下中·技能栏字", "#15181b", 0.58, None, "skillbar .ct small"),
    ("境界小字 11px ink-zhong", "右下·境界修为", "#15181b", 0.58, None, "runhud .mk-realm .r small"),
    ("本局感悟 11px #8a6a22", "右下·境界修为", "#8a6a22", 1, None, "runhud .mk-realm .n"),
]
for name, zn, fg, fa, wa, src in ELS:
    worst = None
    rows = {}
    for k in clean:
        z = res["zones"][zn][k]
        vals = []
        for key in ("P5", "P50", "P95"):
            bg = hexrgb(z[key])
            under = over(PAPER, wa, bg) if wa else bg
            col = over(hexrgb(fg), fa, under)
            vals.append(round(cr(col, under), 2))
        rows[k] = vals
        w = min(vals)
        if worst is None or w < worst[0]: worst = (w, k)
    res["elements"].append({"元素": name, "分区": zn, "来源": src, "底衬": wa, "各背景[P5,P50,P95]": rows, "最差": worst[0], "最差背景": worst[1]})

# 朱 vs 场景红柱 / 敌人血条红 / 预警红：色差（CIE76 粗略）——判断撞色
def lab(rgb):
    def f(t): return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    r, g, b = [lin(c) for c in rgb]
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))
def de(a, b):
    A, B = lab(a), lab(b); return round(sum((A[i] - B[i]) ** 2 for i in range(3)) ** 0.5, 1)
# 红柱取样（B / C 截图里山神庙朱柱的中段像素）
pil = {}
for k in ("B", "C"):
    im = clean[k]
    cols = [im.getpixel((x, y)) for x in range(444, 456) for y in range(240, 280)]
    cols = sorted(cols, key=lambda c: c[0] - (c[1] + c[2]) / 2)[-len(cols) // 3:]
    pil[k] = tuple(int(sum(c[i] for c in cols) / len(cols)) for i in range(3))
reds = {"朱 #b8291a（风格指南 HP）": "#b8291a", "敌人血条 #d8402a": "#d8402a", "预警 INKC.red #d2321e": "#d2321e", "精英血条紫 #8a5ab8": "#8a5ab8"}
res["撞色"] = {}
for k, c in pil.items():
    res["撞色"][f"{k} 朱柱 #%02x%02x%02x" % c] = {n: de(hexrgb(v), c) for n, v in reds.items()}

json.dump(res, open(os.path.join(ROOT, "measure.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok")
