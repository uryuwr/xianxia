# 实测对比度：读 shoot.mjs 写在 work/_tj_m/ 的 A（前景隐藏）/ B（前景品红遮罩）/ C（原样）三张裁片，
# 在遮罩核心像素（品红覆盖率 ≥ 0.7）上算 C 对 A 的 WCAG 对比度，输出每个元素的 P10 / 中位数到 measure_dom.json。
# 运行：docs/review/ui/.venv/Scripts/python docs/ui/v3/体检_v1/measure_dom.py
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "work", "_tj_m"))

def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def L(p):
    return 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2])
def cr(a, b):
    x, y = L(a), L(b)
    if x < y: x, y = y, x
    return (x + 0.05) / (y + 0.05)

meta = json.load(open(os.path.join(MD, "meta.json"), encoding="utf-8"))
M = (255, 0, 255)
out = {}
for job, items in meta.items():
    rows = []
    for it in items:
        f = os.path.join(MD, it["file"])
        A = Image.open(f + "_A.png").convert("RGB"); B = Image.open(f + "_B.png").convert("RGB"); C = Image.open(f + "_C.png").convert("RGB")
        pa, pb, pc = A.load(), B.load(), C.load()
        vals = []
        for y in range(A.height):
            for x in range(A.width):
                a, b = pa[x, y], pb[x, y]
                ws = [(b[i] - a[i]) / (M[i] - a[i]) for i in range(3) if abs(M[i] - a[i]) > 50]
                if not ws: continue
                w = sum(ws) / len(ws)
                if w >= 0.7: vals.append(cr(pc[x, y], a))
        if not vals: continue
        vals.sort()
        rows.append({"元素": it["name"], "类": it["kind"], "字号": it["fs"], "P10": round(vals[len(vals) // 10], 2), "中位": round(vals[len(vals) // 2], 2), "像素": len(vals)})
    out[job] = rows
json.dump(out, open(os.path.join(HERE, "measure_dom.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for job, rows in out.items():
    print(job, " | ".join(f"{r['元素']} {r['P10']}/{r['中位']}" for r in rows))
