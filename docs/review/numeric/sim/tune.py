"""调参辅助：python tune.py → 打印 CURRENT / PROPOSED 的累计修为、局数 / 分钟、来源占比、封顶浪费、极品。"""
import statistics as st
from params import CURRENT, PROPOSED
from econ import monte_carlo, SRC

# 目标曲线（G6 八局：区域一 2–5 局，第 5 局青牙；区域二 6–8 局，第 8 局碧鳞 → 筑基）
TARGET = [60, 260, 480, 750, 1150, 1950, 3000, 4370]


def report(P, tag, n=400, profs=("谨慎", "贪心", "新手")):
    print("==", tag, "目标", TARGET)
    for prof in profs:
        r = monte_carlo(P, prof, n)
        g = {}
        for x in r:
            last = 0
            for k in range(1, 11):
                e = next((e for e in x.log if e["run"] == k), None)
                last = e["gained"] if e else (4370 if x.layer >= 10 else last)
                g.setdefault(k, []).append(min(last, 4370))
        runs = sorted(x.runs for x in r)
        mins = sorted(x.minutes for x in r)
        src = {k: st.mean(x.xp_src[k] for x in r) for k in SRC}
        tot = sum(src.values())
        pj = sum(1 for x in r if any(not j[2] for j in x.jackpot_src)) / len(r)  # 碧鳞之前拿到（v1 内用得上）
        r2 = [next((e["run"] for e in x.log if e["region"] == "r2"), 99) for x in r]
        print(f"{prof} 局数 p50 {runs[len(r)//2]} p90 {runs[int(.9*len(r))]} | 分钟 p50 {mins[len(r)//2]:.0f} p90 {mins[int(.9*len(r))]:.0f} | 首入区域二 p50 第{sorted(r2)[len(r)//2]}局"
              f" | 浪费 {st.mean(x.wasted for x in r):.0f} | 碧鳞前极品 P {pj:.2f} | 灵潮均值 {st.mean(x.tide_sum / max(1, x.runs - 1) for x in r):.2f}")
        print("   累计:", " ".join(f"{k}:{st.mean(v):.0f}" for k, v in sorted(g.items()) if k <= 9))
        print("   来源:", " ".join(f"{k}{v / tot * 100:.0f}%" for k, v in src.items()))


if __name__ == "__main__":
    report(CURRENT, "当前")
    report(PROPOSED, "建议")
