"""构筑与成长 v1 · 局程表：每局在哪个区域、开局 / 结束时第几层、是否撤离成功、遗府 / 碧鳞首杀发生在哪一局。
复用数值组的经济 / 进度模拟器（docs/review/numeric/sim/econ.py，参数集 ECON_XIAN = 当前最新），只改一处：
  青牙 v2 已是可选的守谷之王，区域二只看练五（原模拟器要求先杀青牙）→ 开局把 boss_r1 置真，青牙首杀另由 pieces.mjs 按"练六起第一次回区域一"掷。
到筑基后再多跑 POST 局（区域二），用来看"筑基时"的构筑。
用法（仓库根目录）：
  PYTHONIOENCODING=utf-8 docs/review/numeric/.venv/Scripts/python.exe tools/build_growth/schedule.py [N=1000] [POST=3]
输出：work/build_schedule.json  { personas: { 谨慎: [ [ {run, region, l0, l1, ok, ruin, boss2, min}, ... ], ... ] } }
"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "docs", "review", "numeric", "sim"))
from params import ECON_XIAN  # noqa: E402
from econ import Sim  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
POST = int(sys.argv[2]) if len(sys.argv) > 2 else 3
PERSONAS = ["谨慎", "贪心", "新手"]


def trace(P, prof, seed):
    sim = Sim(P, prof, seed)
    s = sim.s
    s.boss_r1 = True  # 青牙可选：区域二只看练五
    rows = []
    post = 0
    while s.runs < 40:
        l0, d0, r1, r2, b2, m0 = s.layer, s.deaths, s.ruin_r1, s.ruin_r2, s.boss_r2, s.minutes
        sim.run()
        lg = s.log[-1]
        rows.append({"run": s.runs, "region": lg["region"], "l0": l0, "l1": s.layer, "ok": s.deaths == d0,
                     "ruin": (not r1 and s.ruin_r1) or (not r2 and s.ruin_r2), "boss2": (not b2 and s.boss_r2),
                     "min": round(s.minutes - m0, 2)})
        if s.layer >= 10:
            post += 1
            if post > POST:
                break
    return rows


out = {"n": N, "post": POST, "params": "ECON_XIAN + 青牙可选", "personas": {}}
for prof in PERSONAS:
    out["personas"][prof] = [trace(ECON_XIAN, prof, 1 + k * 7919) for k in range(N)]
    zj = sorted(next(r["run"] for r in t if r["l1"] >= 10) for t in out["personas"][prof])
    print(f"{prof}: 到筑基 p50 第 {zj[len(zj)//2]} 局, p90 第 {zj[int(len(zj)*0.9)]} 局")
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
with open(os.path.join(ROOT, "work", "build_schedule.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print("saved work/build_schedule.json")
