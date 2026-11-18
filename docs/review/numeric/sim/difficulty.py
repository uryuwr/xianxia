"""难度曲线复核 v1：复核前 / 复核后（回填实测）的到筑基局数、分钟、身陨次数，以及【假设】的敏感度。
    cd docs/review/numeric && PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe sim/difficulty.py 2000
"""
import copy, json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from params import REVIEW_BEFORE, REVIEW_AFTER
from econ import monte_carlo

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
PROFS = ["谨慎", "贪心", "新手"]


def stats(P, n=N):
    out = {}
    for prof in PROFS:
        r = monte_carlo(P, prof, n)
        runs = [x.runs for x in r]
        mins = [x.minutes for x in r]
        deaths = [x.deaths for x in r]
        out[prof] = {"runs_p50": float(np.percentile(runs, 50)), "runs_p90": float(np.percentile(runs, 90)),
                     "min_p50": round(float(np.percentile(mins, 50))), "min_p90": round(float(np.percentile(mins, 90))),
                     "deaths_mean": round(float(np.mean(deaths)), 2), "death_rate_per_run": round(float(np.sum(deaths) / np.sum(runs)), 3)}
    return out


def show(tag, s):
    print(f"\n[{tag}]")
    for p, v in s.items():
        print(f"  {p}: 局数 p50 {v['runs_p50']:.0f} / p90 {v['runs_p90']:.0f}　分钟 p50 {v['min_p50']} / p90 {v['min_p90']}　身陨 {v['deaths_mean']} 次（每局 {v['death_rate_per_run']:.1%}）")


res = {"n": N}
for tag, P in [("复核前", REVIEW_BEFORE), ("复核后", REVIEW_AFTER)]:
    res[tag] = stats(P)
    show(tag, res[tag])

# 敏感度：撤离率再低 5 个百分点；单局时长再 +10%
sens = {}
P = copy.deepcopy(REVIEW_AFTER)
for prof in P["profiles"].values():
    prof["p_extract"] = {k: v - 0.05 for k, v in prof["p_extract"].items()}
sens["撤离率再 −5pt"] = stats(P, N // 2)
P = copy.deepcopy(REVIEW_AFTER)
P["run_min"] = {k: v * 1.1 for k, v in P["run_min"].items()}
P["night_end"] *= 1.1
sens["单局时长再 +10%"] = stats(P, N // 2)
for k, v in sens.items():
    show("敏感度 · " + k, v)
res["sensitivity"] = sens
with open(os.path.join(HERE, "..", "charts", "difficulty_results.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
