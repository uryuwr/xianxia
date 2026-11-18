"""经济复核 v1：不化灵 / 现行化灵公式 / 新 HUALING 三种情况下的灵石收支、设施购买时间点、到筑基的局数与分钟。
    cd docs/review/numeric && PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe sim/economy.py 2000
"""
import json, os, statistics as st, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from params import ECON_NO_HL, ECON_CURRENT, ECON_NEW
from econ import monte_carlo

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
PROFS = ["谨慎", "贪心", "新手"]
FAC = ["炼丹炉Lv1", "炼器鼎Lv1", "灵泉Lv2", "储物袋24", "炼丹炉Lv2", "炼器鼎Lv2", "储物袋32", "药园Lv2"]
res = {"n": N}
for tag, P in [("不化灵（旧假设）", ECON_NO_HL), ("现行化灵公式", ECON_CURRENT), ("新 HUALING", ECON_NEW)]:
    res[tag] = {}
    print(f"\n[{tag}]")
    for prof in PROFS:
        r = monte_carlo(P, prof, N)
        runs = [x.runs for x in r]
        mins = [x.minutes for x in r]
        tot = lambda f: round(st.mean(f(x) for x in r))
        src = {k: st.mean(x.xp_src[k] for x in r) for k in r[0].xp_src}
        allxp = sum(src.values())
        fac = {}
        for f in FAC:
            got = [x.bought_at[f] for x in r if f in x.bought_at]
            fac[f] = {"p_bought": round(len(got) / N, 2), "run_p50": float(np.percentile(got, 50)) if got else None}
        out = {"runs_p50": float(np.percentile(runs, 50)), "runs_p90": float(np.percentile(runs, 90)),
               "min_p50": round(float(np.percentile(mins, 50))), "min_p90": round(float(np.percentile(mins, 90))),
               "stones_in": tot(lambda x: x.stone_in), "hualing": tot(lambda x: x.hl_stones), "hualing_from_xp_items": tot(lambda x: x.hl_xp_items),
               "sink": tot(lambda x: x.stone_sink), "refined": tot(lambda x: x.stone_refined),
               "xp_share": {k: round(v / allxp * 100, 1) for k, v in src.items()}, "wasted_xp": tot(lambda x: x.wasted), "facilities": fac}
        res[tag][prof] = out
        print(f"  {prof}: 局数 {out['runs_p50']:.0f}/{out['runs_p90']:.0f}  分钟 {out['min_p50']}/{out['min_p90']}  "
              f"灵石 带回 {out['stones_in']}（化灵 {out['hualing']}，其中灵物妖丹 {out['hualing_from_xp_items']}）花 {out['sink']} 炼化 {out['refined']}  "
              f"修为来源 {out['xp_share']}  封顶浪费 {out['wasted_xp']}")
        print("        设施（买到的比例 / 中位第几局）：" + "  ".join(f"{k} {v['p_bought']:.0%}/{v['run_p50']}" for k, v in fac.items()))
with open(os.path.join(HERE, "..", "charts", "economy_results.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
