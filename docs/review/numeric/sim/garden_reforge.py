"""药园与重铸 v1：ECON_NEW（经济复核后）vs ECON_GR（+ 药园 v2、灵田、重铸）的灵石收支、设施时间点、重铸次数、到筑基局数 / 分钟。
    cd docs/review/numeric && PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe sim/garden_reforge.py 2000
"""
import json, os, statistics as st, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from params import ECON_NEW, ECON_GR, ECON_MP, ECON_ECO, ECON_ECO2, ECON_ECO3, ECON_XIAN
from econ import monte_carlo

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
PROFS = ["谨慎", "贪心", "新手"]
FAC = ["炼器鼎Lv1", "灵泉Lv2", "储物袋24", "炼丹炉Lv2", "炼器鼎Lv2", "储物袋32", "药园Lv1", "药园Lv2", "药园Lv3"]
res = {"n": N}
SETS = [("经济复核后", ECON_NEW), ("+药园 v2 / 灵田 / 重铸", ECON_GR), ("+真气 / 亭子 / 灵气充盈", ECON_MP), ("+怪物生态 / 区域规划 v2", ECON_ECO), ("回调：精英感悟 ×4、宝箱 5–10", ECON_ECO2), ("回调：精英感悟 ×3、宝箱 5–10", ECON_ECO3)]
if len(sys.argv) > 2 and sys.argv[2] == "mp":
    SETS = SETS[1:3]
if len(sys.argv) > 2 and sys.argv[2] == "eco":
    SETS = SETS[3:]
if len(sys.argv) > 2 and sys.argv[2] == "xian":  # 区域一仙品权重下调（上界：两区域一起改）
    SETS = [SETS[3], ("区域一仙品下调（上界）", ECON_XIAN)]
for tag, P in SETS:
    res[tag] = {}
    print(f"\n[{tag}]")
    for prof in PROFS:
        r = monte_carlo(P, prof, N)
        runs = [x.runs for x in r]
        mins = [x.minutes for x in r]
        m = lambda f: round(st.mean(f(x) for x in r))
        fac = {}
        for f in FAC:
            got = [x.bought_at[f] for x in r if f in x.bought_at]
            fac[f] = (round(len(got) / N, 2), float(np.percentile(got, 50)) if got else None)
        rf_first = [x.rf_first for x in r if x.rf_first]
        out = {"runs": (float(np.percentile(runs, 50)), float(np.percentile(runs, 90))), "min": (round(float(np.percentile(mins, 50))), round(float(np.percentile(mins, 90)))),
               "stones_in": m(lambda x: x.stone_in), "garden": m(lambda x: x.garden_stones), "lingtian": round(st.mean(x.lingtian for x in r), 2),
               "sink": m(lambda x: x.stone_sink), "reforge": m(lambda x: x.rf_spent), "rolls": round(st.mean(x.rf_rolls for x in r), 1),
               "rf_first_p50": float(np.percentile(rf_first, 50)) if rf_first else None, "refined": m(lambda x: x.stone_refined),
               "left": m(lambda x: x.stones), "facilities": fac}
        res[tag][prof] = out
        print(f"  {prof}: 局数 {out['runs'][0]:.0f}/{out['runs'][1]:.0f}  分钟 {out['min'][0]}/{out['min'][1]}  灵石 带回 {out['stones_in']}（药园+灵田 {out['garden']}，灵田 {out['lingtian']} 片）"
              f"  花 {out['sink']}（重铸 {out['reforge']}，{out['rolls']} 次，首次第 {out['rf_first_p50']} 局）  炼化 {out['refined']}  剩 {out['left']}")
        print("        设施（买到比例 / 中位第几局）：" + "  ".join(f"{k} {v[0]:.0%}/{v[1]}" for k, v in fac.items()))
with open(os.path.join(HERE, "..", "charts", "garden_reforge_results.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
