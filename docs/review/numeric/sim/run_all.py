"""一键重跑：蒙特卡洛 CURRENT vs PROPOSED，输出图表到 ../charts/ 与 results.json。

    cd docs/review/numeric
    .venv/Scripts/python.exe sim/run_all.py            # 默认每画像 2000 次
    .venv/Scripts/python.exe sim/run_all.py 500        # 快速
开发数据落地后：改 sim/params.py 里 CURRENT 的对应字段（尤其标【假设】的），重跑即可。
"""
import json, os, statistics as st, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from params import CURRENT, PROPOSED
from econ import monte_carlo, SRC
from tune import TARGET
import combat as C

OUT = os.path.join(HERE, "..", "charts")
os.makedirs(OUT, exist_ok=True)
for f in ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"]:
    if os.path.exists(f):
        font_manager.fontManager.addfont(f)
        plt.rcParams["font.family"] = font_manager.FontProperties(fname=f).get_name()
        break
plt.rcParams["axes.unicode_minus"] = False

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
PROFS = ["谨慎", "贪心", "新手"]
DOC_CUM = [60, 320, 620, 1070, 1870, 2870, 4440]
DOC_SHARE = {"感悟": 30, "炼化": 55, "丹药": 10, "首杀/遗府": 5, "委托/奇遇": 0}
SETS = {"当前": CURRENT, "建议": PROPOSED}
COL = {"当前": "#8a3b2e", "建议": "#2e5e8a"}

sims = {k: {p: monte_carlo(P, p, N) for p in PROFS} for k, P in SETS.items()}
res = {"n_per_profile": N}


def q(a, x):
    return float(np.percentile(a, x))


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, name), dpi=110)
    plt.close(fig)


# ---------- c1 累计修为 vs 文档七局路线 ----------
fig, axs = plt.subplots(1, 3, figsize=(15, 4.6), sharey=True)
res["cum_xp"] = {}
for ax, prof in zip(axs, PROFS):
    for k in SETS:
        g = {}
        for x in sims[k][prof]:
            last = 0
            for r in range(1, 13):
                e = next((e for e in x.log if e["run"] == r), None)
                last = e["gained"] if e else (4370 if x.layer >= 10 else last)
                g.setdefault(r, []).append(min(last, 4370))
        rs = sorted(g)
        ax.plot(rs, [st.mean(g[r]) for r in rs], color=COL[k], label=k, lw=2)
        ax.fill_between(rs, [q(g[r], 10) for r in rs], [q(g[r], 90) for r in rs], color=COL[k], alpha=.15)
        res["cum_xp"][f"{k}·{prof}"] = [round(st.mean(g[r])) for r in rs[:8]]
    ax.plot(range(1, 8), DOC_CUM, "k:", label="文档 §10.3（七局）", lw=1)
    ax.plot(range(1, 9), TARGET, "k--o", label="目标（G6 八局）", ms=4)
    ax.axhline(4370, color="gray", lw=.8)
    ax.set_title(f"累计修为 / 局（{prof}，阴影 p10–p90）")
    ax.set_xlabel("局次")
    ax.set_xlim(1, 12)
axs[0].set_ylabel("累计获得修为（4370 = 筑基）")
axs[0].legend()
save(fig, "c1_修为曲线.png")

# ---------- c2 修为来源占比 ----------
fig, ax = plt.subplots(figsize=(10, 4.6))
labels, rows = [], []
for k in SETS:
    for prof in PROFS:
        r = sims[k][prof]
        src = {s: st.mean(x.xp_src[s] for x in r) for s in DOC_SHARE}
        t = sum(src.values())
        labels.append(f"{k}·{prof}")
        rows.append([src[s] / t * 100 for s in DOC_SHARE])
labels.append("文档目标")
rows.append(list(DOC_SHARE.values()))
rows = np.array(rows, dtype=float)
left = np.zeros(len(rows))
for i, s in enumerate(DOC_SHARE):
    ax.barh(labels, rows[:, i], left=left, label=s)
    for y, (l, v) in enumerate(zip(left, rows[:, i])):
        if v > 4:
            ax.text(l + v / 2, y, f"{v:.0f}%", ha="center", va="center", fontsize=8, color="white")
    left += rows[:, i]
ax.invert_yaxis()
ax.set_xlabel("%")
ax.set_title("修为来源占比（首杀 / 遗府固定 940 = 4370 的 21%，文档 5% 目标与自身数值矛盾）", fontsize=10)
ax.legend(ncol=4, loc="lower center", bbox_to_anchor=(.5, -.3))
save(fig, "c2_修为来源占比.png")
res["source_share"] = {l: dict(zip(DOC_SHARE, [round(float(v), 1) for v in r])) for l, r in zip(labels, rows)}

# ---------- c3 到筑基局数 / 分钟 ----------
fig, axs = plt.subplots(1, 2, figsize=(13, 4.4))
res["to_zhuji"] = {}
for k in SETS:
    for i, prof in enumerate(PROFS):
        r = sims[k][prof]
        runs = [x.runs for x in r]
        mins = [x.minutes for x in r]
        ls = ["-", "--", ":"][i]
        axs[0].hist(runs, bins=np.arange(4.5, 18.5), histtype="step", color=COL[k], ls=ls, lw=1.8, density=True, label=f"{k}·{prof}")
        axs[1].hist(mins, bins=np.arange(50, 200, 5), histtype="step", color=COL[k], ls=ls, lw=1.8, density=True, label=f"{k}·{prof}")
        res["to_zhuji"][f"{k}·{prof}"] = {"runs_p50": q(runs, 50), "runs_p90": q(runs, 90), "min_p10": round(q(mins, 10)), "min_p50": round(q(mins, 50)), "min_p90": round(q(mins, 90)),
                                          "cap_runs": round(st.mean(x.cap_runs for x in r), 2), "wasted_xp": round(st.mean(x.wasted for x in r)),
                                          "discard_value_per_run": round(st.mean(x.discarded_value / x.runs for x in r))}
axs[0].axvline(8, color="k", ls="--")
axs[0].set_title("到筑基所需局数（目标 8，含身陨 7–10）")
axs[1].axvspan(80, 100, color="gray", alpha=.15, label="目标 80–100 分钟")
axs[1].set_title("到筑基所需分钟")
axs[0].legend(fontsize=8)
axs[1].legend(fontsize=8)
save(fig, "c3_到筑基分布.png")

# ---------- c4 灵石流向 ----------
fig, axs = plt.subplots(1, 2, figsize=(13, 4.4), sharey=True)
res["stones"] = {}
for ax, k in zip(axs, SETS):
    r = sims[k]["谨慎"]
    by = {}
    for x in r:
        prev = {"stones_in": 0, "sink": 0, "refined": 0}
        for e in x.log:
            d = {kk: e[kk] - prev[kk] for kk in prev}
            prev = {kk: e[kk] for kk in prev}
            by.setdefault(e["run"], []).append(d)
    rs = [r_ for r_ in sorted(by) if r_ <= 9]
    w = .27
    for j, (kk, lab) in enumerate([("stones_in", "带回"), ("sink", "设施 / 符箓花费"), ("refined", "炼化")]):
        ax.bar(np.array(rs) + (j - 1) * w, [st.mean(d[kk] for d in by[r_]) for r_ in rs], w, label=lab)
    ax.set_title(f"灵石流向 / 局（{k}·谨慎）")
    ax.set_xlabel("局次")
    res["stones"][k] = {kk: round(st.mean(x.log[-1][kk] for x in r if x.log)) for kk in ["stones_in", "sink", "refined"]}
axs[0].legend()
save(fig, "c4_灵石流向.png")

# ---------- c5 普通怪几刀死（按 enemies.js 等级缩放；当前与建议相同，未提改动） ----------
fig, ax = plt.subplots(figsize=(10, 4.2))
res["hits"] = {}
P = PROPOSED
for reg, Ls, mobs in [("r1", range(1, 5), ["wolf", "wolf_grey", "golem"]), ("r2", range(5, 10), ["bat", "vine", "wolf"])]:
    for m, mk in zip(mobs, ["o", "s", "^"]):
        hs = [C.hits_to_kill(P, C.eff_atk(P, L), *C.scaled(P, m, L)) for L in Ls]
        ax.plot(list(Ls), np.array(hs) + (mobs.index(m) - 1) * .04, "-" + mk, label=f"{reg} {m}")
        res["hits"][f"{reg}·{m}"] = dict(zip(Ls, hs))
ax.axhspan(2, 4, color="green", alpha=.08, label="目标 2–4 刀（一套三连内）")
ax.set_xlabel("境界层（= 刷怪等级）")
ax.set_ylabel("普攻次数")
ax.set_ylim(1, 6)
ax.set_title("普通妖兽几刀死（同级；enemies.js 气血 ×(1+0.27×等级差)）——两版相同，无需改")
ax.legend(ncol=3, fontsize=8)
save(fig, "c5_普通怪击杀刀数.png")

# ---------- c6 护盾破盾时间 ----------
SC = [("狼妖头目 L3 木盾\n(剑气斩克)", "wolf_elite", 3, "wood"), ("狼妖头目 L4 木盾\n(剑气斩克)", "wolf_elite", 4, "wood"),
      ("藤妖 L6 土盾\n(缠藤诀克)", "vine_elite", 6, "earth"), ("藤妖 L6 火盾\n(无克制)", "vine_elite", 6, "fire"),
      ("藤妖 L8 火盾\n(寒冰锥克)", "vine_elite", 8, "fire"), ("狼妖头目 L8 水盾\n(无克制)", "wolf_elite", 8, "water"),
      ("藤妖 L9 土盾\n(缠藤诀克)", "vine_elite", 9, "earth")]
PREPS = [("spell", "只靠法术栏"), ("fu", "+ 一组五行符"), ("imbue", "附灵剑")]
fig, axs = plt.subplots(1, 2, figsize=(16, 5), gridspec_kw={"width_ratios": [2.4, 1]})
x = np.arange(len(SC))
res["shields"] = {}
w = .13
for j, (k, P) in enumerate(SETS.items()):
    res["shields"][k] = {}
    for m, (prep, plab) in enumerate(PREPS):
        off = (j * 3 + m - 2.5) * w
        ts = [C.shield_break_time(P, L, C.scaled(P, m_, L)[0] * P["shield_frac"], el, C.scaled(P, m_, L)[1], prep)[0] for _, m_, L, el in SC]
        axs[0].bar(x + off, ts, w, color=COL[k], alpha=[1, .6, .3][m], label=f"{k} · {plab}", edgecolor="k", lw=.3)
        for xi, t in zip(x, ts):
            axs[0].text(xi + off, t + .3, f"{t:.0f}", ha="center", fontsize=6)
        res["shields"][k][plab] = {s_[0].replace("\n", " "): round(t, 1) for s_, t in zip(SC, ts)}
    off = (j - .5) * .38
    for name, (tot, parts), xi in [("Boss 青牙 L4", C.boss_ttk(P, "r1", 4), 0), ("Boss 碧鳞 L8", C.boss_ttk(P, "r2", 8), 1)]:
        res["shields"][k][name] = {"total": round(tot, 1), "phases": [[el, t] for el, t, _ in parts]}
        b_ = 0
        for el, t, _ in parts:
            axs[1].bar(xi + off, t, .38, bottom=b_, color=COL[k], edgecolor="white", alpha=.5)
            if t > 4:
                axs[1].text(xi + off, b_ + t / 2, f"{el} {t:.0f}s", ha="center", va="center", fontsize=7)
            b_ += t
        axs[1].bar(xi + off, tot - b_, .38, bottom=b_, color=COL[k], edgecolor="white")
        axs[1].text(xi + off, tot + 1, f"{k} {tot:.0f}s", ha="center", fontsize=8)
axs[0].axhspan(3, 8, color="green", alpha=.1)
axs[0].set_xticks(x, [s_[0] for s_ in SC], fontsize=8)
axs[0].set_ylabel("破盾秒数（普攻 + 按冷却放法术；绿带 3–8 s）")
axs[0].set_title("精英护盾破盾时间（精英气血按等级缩放）")
axs[0].legend(fontsize=7, ncol=2)
axs[1].set_xticks([0, 1], ["青牙 L4", "碧鳞 L8"])
axs[1].set_title("Boss 击杀时间（浅色 = 各段护盾，深色 = 本体）")
save(fig, "c6_护盾破盾时间.png")

# ---------- c7 掉落惊喜 ----------
fig, axs = plt.subplots(1, 2, figsize=(13, 4.4))
res["loot"] = {}
for j, k in enumerate(SETS):
    off = (j - .5) * .38
    r = sims[k]["谨慎"]
    cnt = {qq: st.mean(sum(1 for _, m in x.loot_moments if m == qq) for x in r) for qq in (2, 3, 4)}
    pj = sum(1 for x in r if any(not jj[2] for jj in x.jackpot_src)) / len(r)  # 碧鳞之前拿到（v1 内用得上）
    gaps = []
    for x in r:
        t = sorted([0] + [m for m, qq in x.loot_moments if qq >= 2] + [x.minutes])
        gaps += list(np.diff(t))
    axs[0].bar(np.arange(3) + off, [cnt[2], cnt[3], cnt[4]], .38, color=COL[k], label=k)
    axs[0].text(2 + off, cnt[4] + .05, f"碧鳞前 P={pj:.0%}", ha="center", fontsize=8)
    axs[1].hist(gaps, bins=np.arange(0, 60, 3), histtype="step", lw=2, color=COL[k], density=True, label=f"{k}（中位 {np.median(gaps):.0f} 分钟）")
    res["loot"][k] = {"宝": round(cnt[2], 2), "仙": round(cnt[3], 2), "极": round(cnt[4], 3), "P(碧鳞前得极品)": round(pj, 3), "刻度兑现占比": round(sum(1 for x in r for jj in x.jackpot_src if jj[0] == "fortune") / max(1, sum(len(x.jackpot_src) for x in r)), 2), "宝+间隔中位分钟": round(float(np.median(gaps)), 1)}
axs[0].set_xticks(range(3), ["宝品", "仙品", "极品"])
axs[0].set_title("一周目（到筑基）掉落高光次数（谨慎）")
axs[0].legend()
axs[1].set_title("两次「宝品及以上」之间的分钟数")
axs[1].legend()
save(fig, "c7_掉落惊喜.png")

# ---------- c8 身陨损失 ----------
fig, ax = plt.subplots(figsize=(10, 4.2))
res["death"] = {}
for j, k in enumerate(SETS):
    off = (j - .5) * .38
    vals = []
    for prof in PROFS:
        r = sims[k][prof]
        d = st.mean(x.deaths for x in r)
        d2 = st.mean(getattr(x, "deaths_r2", 0) for x in r)
        lost = st.mean(x.lost_value for x in r)
        vals.append(lost)
        res["death"][f"{k}·{prof}"] = {"身陨次数": round(d, 2), "区域二身陨": round(d2, 2), "损失灵值": round(lost),
                                       "损失/带回灵石": round(lost / max(1, st.mean(x.stone_in for x in r)), 3)}
    ax.bar(np.arange(3) + off, vals, .38, color=COL[k], label=k)
    for i, prof in enumerate(PROFS):
        ax.text(i + off, vals[i] + 5, f"{res['death'][f'{k}·{prof}']['身陨次数']} 次", ha="center", fontsize=8)
ax.set_xticks(range(3), PROFS)
ax.set_ylabel("一周目身陨损失灵值（灵石当量）")
ax.set_title("身陨损失（文字 = 平均身陨次数）")
ax.legend()
save(fig, "c8_身陨损失.png")

# ---------- c9 九层封顶浪费 ----------
fig, ax = plt.subplots(figsize=(8, 4))
for j, k in enumerate(SETS):
    off = (j - .5) * .38
    w = [res["to_zhuji"][f"{k}·{p}"]["wasted_xp"] for p in PROFS]
    ax.bar(np.arange(3) + off, w, .38, color=COL[k], label=k)
    for i, p in enumerate(PROFS):
        ax.text(i + off, w[i] + 20, f"{w[i]}\n({res['to_zhuji'][f'{k}·{p}']['cap_runs']} 局)", ha="center", fontsize=8)
ax.set_xticks(range(3), PROFS)
ax.set_ylabel("练气九层圆满后溢出的修为")
ax.set_title("封顶浪费（括号 = 卡在九层圆满的平均局数）")
ax.legend()
save(fig, "c9_封顶浪费.png")


# ---------- c10 假设敏感度（建议版 · 谨慎，到筑基分钟 p50） ----------
import copy
def med_min(P, n=300):
    return float(np.median([x.minutes for x in monte_carlo(P, "谨慎", n, seed=11)]))
base = med_min(PROPOSED)
SENS = [("每分钟击杀", lambda P, f: P["kill_rate"].update({k: v * f for k, v in P["kill_rate"].items()})),
        ("精英数 / 局", lambda P, f: P["elites"].update({k: v * f for k, v in P["elites"].items()})),
        ("宝箱数 / 局", lambda P, f: P["chests"].update({k: v * f for k, v in P["chests"].items()})),
        ("灵光点出灵物概率", lambda P, f: P.update({"glow_treasure_p": min(1, P["glow_treasure_p"] * f)})),
        ("区域二灵石倍率", lambda P, f: P["stone_mul"].update({"r2": P["stone_mul"]["r2"] * f})),
        ("每局固定石费", lambda P, f: P["per_run_stone_sinks"].update({k: v * f for k, v in P["per_run_stone_sinks"].items()})),
        ("单局时长", lambda P, f: P["run_min"].update({k: v * f for k, v in P["run_min"].items()}))]
rows = []
for name, fn in SENS:
    out = []
    for f in (0.75, 1.25):
        P = copy.deepcopy(PROPOSED)
        fn(P, f)
        out.append(med_min(P))
    rows.append((name, out[0], out[1]))
rows.sort(key=lambda r: -abs(r[2] - r[1]))
fig, ax = plt.subplots(figsize=(9, 4))
for i, (name, lo, hi) in enumerate(rows):
    ax.barh(i, lo - base, left=base, color="#2e5e8a", alpha=.6, label="× 0.75" if i == 0 else None)
    ax.barh(i, hi - base, left=base, color="#8a3b2e", alpha=.6, label="× 1.25" if i == 0 else None)
    ax.text(max(lo, hi) + .5, i, f"{lo:.0f} / {hi:.0f}", va="center", fontsize=8)
ax.axvline(base, color="k")
ax.set_yticks(range(len(rows)), [r[0] for r in rows])
ax.invert_yaxis()
ax.set_xlabel(f"到筑基分钟 p50（基准 {base:.0f}）")
ax.set_title("【假设】量 ±25% 的敏感度（建议版 · 谨慎）")
ax.legend()
save(fig, "c10_敏感度.png")
res["sensitivity"] = {"base": base, **{r[0]: [r[1], r[2]] for r in rows}}

# ---------- 承伤表（不出图） ----------
res["hit_pct"] = {k: {name: {L: round(C.hit_pct(P, name, L, L) * 100, 1) for L in ([1, 4] if name.startswith("r1") else [5, 7, 9])} for name in C.ENEMY_HITS} for k, P in SETS.items()}

with open(os.path.join(OUT, "results.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1, default=str)
print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
