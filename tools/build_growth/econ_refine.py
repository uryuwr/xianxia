"""构筑与成长 v1 · 法宝祭炼 / 阵盘升重的灵石开销放进经济模拟，看会不会挤掉设施、拖慢筑基。
在数值组模拟器（docs/review/numeric/sim/econ.py，参数集 ECON_XIAN = 当前最新）上：
  - 青牙可选（同 schedule.py：开局 boss_r1 = True）
  - 祭炼作为"必需"开销插在 炼丹炉Lv2 之后：本命 2 重（练六起）、3 重（练八起），可选 4 重（筑基，要两倍余钱）
用法（仓库根目录）：
  PYTHONIOENCODING=utf-8 docs/review/numeric/.venv/Scripts/python.exe tools/build_growth/econ_refine.py [N=2000]
"""
import copy, os, sys, statistics as st
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "docs", "review", "numeric", "sim"))
from params import ECON_XIAN  # noqa: E402
from econ import Sim  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
PROFS = ["谨慎", "贪心", "新手"]


def with_refine(P, costs):
    Q = copy.deepcopy(P)
    ups = list(Q["upgrades"])
    i = next(k for k, u in enumerate(ups) if u[0] == "炼丹炉Lv2") + 1
    ups[i:i] = costs
    Q["upgrades"] = ups
    return Q


SETS = [
    ("现状（无祭炼开销）", ECON_XIAN),
    ("祭炼 2重 120 / 3重 300", with_refine(ECON_XIAN, [("祭炼2", 120, "layer6", True), ("祭炼3", 300, "layer8", True), ("祭炼4", 700, "layer10", False)])),
    ("祭炼 2重 200 / 3重 500（贵一档）", with_refine(ECON_XIAN, [("祭炼2", 200, "layer6", True), ("祭炼3", 500, "layer8", True), ("祭炼4", 1000, "layer10", False)])),
    ("祭炼 + 阵盘二重 150", with_refine(ECON_XIAN, [("祭炼2", 120, "layer6", True), ("祭炼3", 300, "layer8", True), ("阵二重", 150, "layer8", False), ("祭炼4", 700, "layer10", False)])),
]


def run(P, prof, seed):
    sim = Sim(P, prof, seed)
    sim.s.boss_r1 = True
    post = 0
    while sim.s.runs < 40:
        sim.run()
        if sim.s.layer >= 10:
            post += 1
            if post > 2:
                break
    return sim.s


for tag, P in SETS:
    print(f"\n[{tag}]")
    for prof in PROFS:
        rs = [run(P, prof, 1 + k * 7919) for k in range(N)]
        zj = [next((r["run"] for r in s.log if r["layer"] >= 10), 99) for s in rs]
        mins = [next((r["minutes"] for r in s.log if r["layer"] >= 10), 999) for s in rs]
        def at(name):
            got = [s.bought_at[name] for s in rs if name in s.bought_at]
            return f"{len(got)/N:.0%}/第{np.percentile(got, 50):.0f}局" if got else "-"
        fac = "  ".join(f"{n} {at(n)}" for n in ["灵泉Lv2", "炼丹炉Lv2", "储物袋32", "炼器鼎Lv2", "祭炼2", "祭炼3", "祭炼4", "阵二重"])
        print(f"  {prof}: 到筑基 第 {np.percentile(zj,50):.0f}/{np.percentile(zj,90):.0f} 局, {np.percentile(mins,50):.0f}/{np.percentile(mins,90):.0f} 分钟 | 重铸 {st.mean(s.rf_spent for s in rs):.0f} 灵石 | 剩 {st.mean(s.stones for s in rs):.0f} | 炼化 {st.mean(s.stone_refined for s in rs):.0f}")
        print(f"        {fac}")
