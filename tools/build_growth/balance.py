"""构筑与成长 v1 · 流派平衡：把 num_ttk 实测（本体持续 DPS + 五行破盾秒数）换算成青牙 / 碧鳞用时，叠上测不了的新机制（解析估算），
再算有效生命（EHP）和一局可放法术次数。
输入：work/num_ttk_build_base.json（现状配装 练三/六/九/筑基）、work/num_ttk_build_v2.json（五个流派 练六/练九）
用法（仓库根目录）：PYTHONIOENCODING=utf-8 docs/review/numeric/.venv/Scripts/python.exe tools/build_growth/balance.py
输出：控制台表格 + work/build_balance.json

换算：
  defAdj = (100 + 假人防御) / (100 + 首领防御)            （伤害 ∝ 100 / (100 + def)，护盾吸收的是减防后的伤害）
  破盾速度 v(el) = 测试护盾量 / 实测破盾秒                  （从 0 势开打，含法术 / 法宝 / 阵）
  机器人用时 = Σ 护盾_i / (v(el_i) × defAdj) + 气血 / (本体 DPS × defAdj × (1 + 解析加成))
  真人用时 ≈ 机器人用时 ÷ 首领输出窗口 0.55（02 §8.3 / boss_青牙_v2 的目标窗口）
"""
import json, os, statistics as st

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = lambda f: os.path.join(ROOT, "work", f)
rows = []
for f in ["num_ttk_build_base.json", "num_ttk_build_v2.json"]:
    if os.path.exists(W(f)):
        rows += json.load(open(W(f), encoding="utf-8"))["rows"]

BOSS = {
    "青牙": {"hp": 15000, "def": 25, "shields": [("wood", 1500), ("earth", 1500)]},
    "碧鳞": {"hp": 12000, "def": 40, "shields": [("fire", 2400), ("earth", 2400), ("wood", 2400)]},
    "心魔": {"hp": 15000, "def": None, "shields": []},  # 镜像：防御 = 主角 × 0.8，见下
}
# 测不了的新机制（02 草案）对首领本体 DPS 的解析加成（练九口径；练六按一半）。依据见 03 §3.4
ADD = {"base": 0, "jian": 0.0, "fa": 0.0, "shen": 0.06, "bao": 0.08, "shou": 0.05}
WINDOW = 0.55


def ttk(r, boss):
    B = BOSS[boss]
    bdef = B["def"] if B["def"] is not None else 0.8 * r["hero"]["def"]
    adj = (100 + r["def"]) / (100 + bdef)
    L = int(r["id"].split("-L")[1])
    add = ADD.get(r["id"].split("-")[0], 0) * (1 if L >= 9 else 0.5)
    t_sh = 0
    for el, amt in B["shields"]:
        t = r["shields"].get(el)
        if t is None:  # 没测到这一行（只测了 wood/earth/fire）或超时：按 30 秒上限
            t = 30
        v = r["shieldHp"] / max(t, 0.5)
        t_sh += amt / (v * adj)
    t_body = B["hp"] / (r["body"]["dps"] * adj * (1 + add))
    return round(t_sh + t_body, 1), round(t_sh, 1)


def ehp(r):
    h = r["hero"]
    return round(h["hp"] * (1 + h["def"] / 100))


out = {}
print("流派-层   本体DPS  斩占比  法术占比  破盾秒(木/土/火)      青牙 机器人/真人≈   碧鳞 机器人/真人≈   EHP   真气 耗/回/施法")
for r in rows:
    b = r["body"]
    tot = b["dmg"]["total"] or 1
    q, qs = ttk(r, "青牙")
    bl, bls = ttk(r, "碧鳞")
    sh = r["shields"]
    o = {"dps": b["dps"], "charge": round(b["dmg"]["charge"] / tot, 2), "spell": round(b["dmg"]["spell"] / tot, 2),
         "art": round(b["dmg"]["art"] / tot, 2), "shields": sh, "qingya": q, "qingyaShield": qs, "bilin": bl, "bilinShield": bls, "ehp": ehp(r), "mp": b.get("mp"), "hero": r["hero"]}
    out[r["id"]] = o
    m = b.get("mp") or {}
    print(f"{r['id']:<10} {b['dps']:>6}  {o['charge']:>5.0%}  {o['spell']:>6.0%}   {sh.get('wood')}/{sh.get('earth')}/{sh.get('fire')}".ljust(62)
          + f"{q:>6} / {q / WINDOW:>5.0f}    {bl:>6} / {bl / WINDOW:>5.0f}   {o['ehp']:>5}   {m.get('spent')}/{m.get('gain')}/{m.get('casts')}")

# 同档位与中位数的偏差
for L in (6, 9):
    ids = [k for k in out if k.endswith(f"-L{L}") and not k.startswith("base")]
    if len(ids) < 2:
        continue
    for boss in ("qingya", "bilin"):
        vals = {k: out[k][boss] for k in ids}
        med = st.median(vals.values())
        print(f"练{'六' if L == 6 else '九'} {boss} 中位 {med}s：" + "  ".join(f"{k.split('-')[0]} {v}s({(v / med - 1):+.0%})" for k, v in vals.items()))
json.dump(out, open(W("build_balance.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved work/build_balance.json")

# ---------------- 建议调整后的估算（03 §4.4 的旋钮，乘在实测本体 DPS / 破盾速度上；落地后必须用 num_ttk bcurve 复测）----------------
#   五行：葫芦主动 ×2.5 + 被动法力 +8×重、《凝神》法术伤害 +25% / 法力 +15% → 本体 ×1.36；克制法术打盾 ×1.25（凝神"克盾"）
#   身法：机器人测不到的完美闪身 / 止水反击 / 拂柳 / 凌波 / 剑影（解析 +33%）+ 定风珠场内受伤 +8%、流云闪后 +20% → ×1.50
#   守御：《不动》反震 + 镇山印主动 50→90 → ×1.18（允许比中位慢 35%，EHP 高 70%）
#   剑势：《连环》每层 +4% → +3%、《蓄势》斩伤 +10% → +5%、剑意封顶 60% → ×0.90，护盾段 ×0.9；雷暴：《锋锐》暴伤 +30% → +20%、雷痕每层 +4% → +3% → ×0.86（雷痕解析加成照算）
PROP = {"jian": (0.9, 0.9), "bao": (0.86, 1.0), "fa": (1.36, 1.25), "shen": (1.50, 1.2), "shou": (1.18, 1.1)}
print("\n建议调整后（估算）：")
for L in (6, 9):
    res = {}
    for k, o in out.items():
        b, lv = k.split("-L")
        if int(lv) != L or b not in PROP:
            continue
        r = next(x for x in rows if x["id"] == k)
        m, sm = PROP[b]
        r2 = json.loads(json.dumps(r))
        r2["body"]["dps"] = r["body"]["dps"] * m / ((1 + ADD.get(b, 0) * (1 if L >= 9 else 0.5)) if b in ("shen", "shou") else 1)  # 身法 / 守御的解析加成已含在 m 里
        r2["shields"] = {e: (t / sm if t else t) for e, t in r["shields"].items()}
        res[b] = (ttk(r2, "青牙")[0], ttk(r2, "碧鳞")[0])
    for i, boss in enumerate(("青牙", "碧鳞")):
        med = st.median(v[i] for v in res.values())
        print(f"  练{'六' if L == 6 else '九'} {boss} 中位 {med:.1f}s（真人≈{med / WINDOW:.0f}s）：" + "  ".join(f"{b} {v[i]}s({v[i] / med - 1:+.0%})" for b, v in res.items()))
