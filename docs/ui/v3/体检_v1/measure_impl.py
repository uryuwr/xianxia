# UI 体检 v1 落地复测：读 tools/scenarios/ui_hud_v1.mjs 写在 work/_tj_impl/<TAG>/ 的 A（前景隐藏）/ B（前景品红）/ C（原样）三张裁片，
# 在遮罩核心像素（品红覆盖率 ≥ 0.7）上算 C 对 A 的 WCAG 对比度，取 P10 / 中位数（与 measure_dom.py 同一算法，用 numpy 提速）。
# 运行：docs/review/ui/.venv/Scripts/python docs/ui/v3/体检_v1/measure_impl.py before after   → measure_impl.json
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))

def lum(a):
    c = a / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]

def measure(tag):
    md = os.path.join(ROOT, "work", "_tj_impl", tag)
    meta = json.load(open(os.path.join(md, "meta.json"), encoding="utf-8"))
    M = np.array([255.0, 0.0, 255.0])
    out = {}
    for job, items in meta.items():
        for it in items:
            f = os.path.join(md, it["file"])
            A, B, C = (np.asarray(Image.open(f + s).convert("RGB"), dtype=np.float64) for s in ("_A.png", "_B.png", "_C.png"))
            d = M - A
            ok = np.abs(d) > 50
            w = np.where(ok, (B - A) / np.where(ok, d, 1), 0).sum(-1) / np.maximum(ok.sum(-1), 1)
            mask = (ok.sum(-1) > 0) & (w >= 0.7)
            if job == "tele":
                # 3D 预警经过水墨后期（纸纹、描线），品红到不了满值、细线边缘多是半覆盖像素：取相对核心 w ≥ 0.85 × P98(w)
                cand = w[(ok.sum(-1) > 0) & (w > 0.3)]
                if cand.size: mask = (ok.sum(-1) > 0) & (w >= 0.85 * np.percentile(cand, 98))
            if not mask.any():
                out[it["name"]] = None
                continue
            la, lc = lum(A)[mask], lum(C)[mask]
            hi, lo = np.maximum(la, lc), np.minimum(la, lc)
            v = np.sort((hi + 0.05) / (lo + 0.05))
            out[it["name"]] = {"P10": round(float(v[len(v) // 10]), 2), "中位": round(float(v[len(v) // 2]), 2), "像素": int(len(v)), "字号": it.get("fs")}
    return out

tags = sys.argv[1:] or ["after"]
res = {t: measure(t) for t in tags}
p = os.path.join(HERE, "measure_impl.json")
old = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
old.update(res)
json.dump(old, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
names = []
for t in tags:
    for k in res[t]:
        if k not in names: names.append(k)
with open(os.path.join(HERE, "measure_impl.txt"), "w", encoding="utf-8") as fo:
    fo.write("元素\t" + "\t".join(tags) + "\n")
    for k in names:
        fo.write(k + "\t" + "\t".join(("%.2f / %.2f" % (res[t][k]["P10"], res[t][k]["中位"])) if res[t].get(k) else "—" for t in tags) + "\n")
print("ok", p)
