"""构筑与成长 v1 · 05 青牙实测的汇总：读 work/num_qingya_build_<流派>.json，对照青牙 v2 §6.3 的标准，出 Markdown 表。
用法（仓库根目录）：PYTHONIOENCODING=utf-8 docs/review/numeric/.venv/Scripts/python.exe tools/build_growth/qingya_report.py [流派,...]
标准（boss_青牙_v2.md §6.3）：
  T2 练四–五：闪 胜 10–30%、莽 0%、熟 40–60%
  T3 练六–七：闪 胜 ≥ 60%、莽 20–40%、熟 ≥ 90%
判定：胜率的 Wilson 95% 区间与目标带不相交 → "出界"（高 / 低）；相交但点估计在带外 → "疑"；点估计在带内 → "在"
"""
import json, math, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BUILDS = sys.argv[1].split(",") if len(sys.argv) > 1 else ["base", "jian", "fa", "shen", "bao", "shou"]
NAME = {"base": "现状通用", "jian": "剑势", "fa": "五行", "shen": "身法", "bao": "雷暴", "shou": "守御"}
BOT = {"masher": "莽", "dodger": "闪", "skilled": "熟"}
TARGET = {("T2", "masher"): (0, 0), ("T2", "dodger"): (0.10, 0.30), ("T2", "skilled"): (0.40, 0.60),
          ("T3", "masher"): (0.20, 0.40), ("T3", "dodger"): (0.60, 1.0), ("T3", "skilled"): (0.90, 1.0)}


def wilson(p, n, z=1.96):
    if n == 0:
        return (0, 1)
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0, c - h), min(1, c + h))


def verdict(tier, bot, p, n):
    lo, hi = TARGET[(tier, bot)]
    a, b = wilson(p, n)
    if lo - 1e-9 <= p <= hi + 1e-9:
        return "在"
    if b < lo - 1e-9:
        return "低"
    if a > hi + 1e-9:
        return "高"
    return "疑高" if p > hi else "疑低"


cells = []
for b in BUILDS:
    f = os.path.join(ROOT, "work", f"num_qingya_build_{b}.json")
    if os.path.exists(f):
        cells += json.load(open(f, encoding="utf-8"))["cells"]
out = {}
print("| 档 | 流派 | 法宝 | 数值套 | 机器人 | n | 胜率 | 判定 | 阵亡 | 到二阶段 | 剩血 | 用时（胜） | 掉血 | 丹 | 处决 | 威折 | 打断 | 撞柱 | 斩 / 法术 / 法宝 / 处决 占比 |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
order = {"base": 0, "jian": 1, "fa": 2, "shen": 3, "bao": 4, "shou": 5}
for c in sorted(cells, key=lambda x: (x["L"], order.get(x["build"], 9), not x["withArt"], x["set"], list(BOT).index(x["bot"]))):
    s = c["summary"]
    tier = "T2" if c["L"] <= 5 else "T3"
    v = verdict(tier, c["bot"], s["win"], s["n"])
    out[c["key"]] = {**s, "verdict": v, "tier": tier}
    art = "—" if c["L"] < 6 and c["build"] != "base" else ("有" if c["withArt"] else "无")
    if c["build"] == "base":
        art = "飞剑" if c["L"] >= 7 else "—"
    print(f"| 练{'一二三四五六七八九'[c['L'] - 1]} | {NAME[c['build']]} | {art} | {c['set']} | {BOT[c['bot']]} | {s['n']} | {s['win']:.0%} | {v} | {s['died']:.0%} | {s['p2']:.0%} | {s['left']:.0%} | {s['sec']:.0f}（{s['winSec'] if s['winSec'] is not None else '-'}） | {s['lost']:.0%} | {s['pots']} | {s['execs']} | {s['breaks']} | {s['interrupts']} | {s['crashes']} | {s['charge']:.0%} / {s['spell']:.0%} / {s['art']:.0%} / {s['exec']:.0%} |")
json.dump(out, open(os.path.join(ROOT, "work", "num_qingya_build_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
# 出界汇总
bad = [(k, v) for k, v in out.items() if v["verdict"] in ("高", "低")]
print(f"\n出界 {len(bad)} 格：")
for k, v in bad:
    print(f"  {k}: 胜 {v['win']:.0%}（{v['tier']} 目标 {TARGET[(v['tier'], k.split('|')[2])]}）→ {v['verdict']}")
