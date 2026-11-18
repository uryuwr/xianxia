"""构筑与成长 v1 · 03 的图：四个流派在各方案下的成型度（草图口径，模拟值）。
用法（仓库根目录）：PYTHONIOENCODING=utf-8 docs/review/numeric/.venv/Scripts/python.exe tools/build_growth/charts.py
读 work/build_pieces.json，写 docs/design/构筑与成长_v1/img/03_成型度.png
"""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
for f in ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"]:
    if os.path.exists(f):
        font_manager.fontManager.addfont(f)
        plt.rcParams["font.family"] = font_manager.FontProperties(fname=f).get_name()
        break
plt.rcParams["axes.unicode_minus"] = False
d = json.load(open(os.path.join(ROOT, "work", "build_pieces.json"), encoding="utf-8"))
SC = [("base", "现状"), ("a", "方向一"), ("b", "方向二"), ("c", "方向三"), ("rec", "框架+练四传功")]
COL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"]
MK = ["o", "s", "^", "D", "v"]
BL = [("jian", "剑势流"), ("fa", "五行（法术）流"), ("shen", "身法流"), ("bao", "雷暴（暴击）流")]
X = ["练一", "练二", "练三", "练四", "练五", "练六", "练七", "练八", "练九", "筑基"]
fig, axs = plt.subplots(1, 4, figsize=(16, 4.2), sharey=True, facecolor="#fcfcfb")
for ax, (bk, bn) in zip(axs, BL):
    ax.set_facecolor("#fcfcfb")
    ax.axhline(70, color="#a7a293", lw=1, ls="--")
    ax.text(0, 72, "成型线 70%", color="#52514e", fontsize=8)
    for (sk, sn), c, m in zip(SC, COL, MK):
        y = [v * 100 for v in d["scen"][sk]["builds"][bk]["sketchScore"]]
        ax.plot(range(10), y, color=c, lw=2, marker=m, ms=5, label=sn)
    ax.set_title(bn, fontsize=12, color="#0b0b0b")
    ax.set_xticks(range(10))
    ax.set_xticklabels(X, fontsize=8, rotation=45)
    ax.set_ylim(0, 102)
    ax.grid(axis="y", color="#e6e4dc", lw=0.6)
    for s in ["top", "right"]:
        ax.spines[s].set_visible(False)
axs[0].set_ylabel("成型度 %（部件可用概率的平均）", color="#52514e")
axs[-1].legend(loc="lower right", fontsize=8, frameon=False)
fig.suptitle("各流派成型度：真实掉率蒙特卡洛（3 种画像 × 1000 次），草图口径", fontsize=13, color="#0b0b0b")
fig.tight_layout()
out = os.path.join(ROOT, "docs", "design", "构筑与成长_v1", "img", "03_成型度.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
fig.savefig(out, dpi=110)
print("saved", out)
