"""构筑与成长 v1 · 一局真气预算（法术流单独算）。全部是解析估算，参数在下面，口径同 docs/review/numeric/真气与炼化增益_v1.md 附录。
用法：PYTHONIOENCODING=utf-8 docs/review/numeric/.venv/Scripts/python.exe tools/build_growth/mp_budget.py
一局可放法术 = (真气上限 + 回气丹 × 每枚回气 + 葫芦吸取 + 灵池 + 凝神返还) ÷ 平均耗蓝（轮转按"一半施法相生"折算）
"""
LV = {"练三": (3, "r1", 2, 3), "练六": (6, "r2", 2, 3), "练九": (9, "r2", 3, 3), "筑基": (10, "r2", 3, 5)}  # (层, 区域, 法术数, 带回气丹)
FOUND = {"r1": 1.1, "r2": 1.7}  # 局内捡到的回气丹（真气报告附录实测）
COST = {2: 25, 3: 27}           # 平均耗蓝
P = dict(pill=40, ningshen_mp=0.25, ningshen_pill=0.25, gourd_mp_per_L=20, gourd_cap=lambda zh: 20 + 4 * (zh - 1), gourd_uses=8,
         pool=45, pool_uses=4, refund=0.4, refund_casts=8, lunzhuan=0.4, lunzhuan_share=0.5, zhong2_cost=0.15)


def run(level, kit):
    L, reg, n, carry = LV[level]
    mp = 360 if L >= 10 else 120 + 12 * (L - 1)
    pill = P["pill"]
    zh = 3 if L >= 10 else 2 if L >= 8 else 1
    if "凝神" in kit:
        mp *= 1 + P["ningshen_mp"]; pill *= 1 + P["ningshen_pill"]
    src = {"真气上限": mp, "回气丹": (carry + FOUND[reg]) * pill}
    if "葫芦" in kit:
        src["真气上限"] += P["gourd_mp_per_L"] * zh
        src["葫芦吸取"] = P["gourd_uses"] * P["gourd_cap"](zh)
    if "灵池" in kit:
        src["灵池"] = P["pool_uses"] * P["pool"]
    cost = COST[n] * (1 - (P["zhong2_cost"] if "二重" in kit else 0))
    if "凝神" in kit:
        src["凝神返还"] = P["refund"] * cost * P["refund_casts"]
    if "轮转" in kit:
        cost *= 1 - P["lunzhuan"] * P["lunzhuan_share"]
    tot = sum(src.values())
    return tot / cost, src, cost


KITS = [("非五行（只有蓝量 + 回气丹）", []), ("非五行 + 核心法术二重", ["二重"]), ("五行★：凝神 + 葫芦", ["凝神", "葫芦"]), ("五行★：凝神 + 灵池", ["凝神", "灵池"]),
        ("五行满配：凝神 + 轮转 + 葫芦 + 灵池 + 二重", ["凝神", "轮转", "葫芦", "灵池", "二重"])]
print("一局可放法术次数（括号 = 相对非五行的倍数）")
for name, kit in KITS:
    line = f"{name:<30}"
    for lv in LV:
        n, src, c = run(lv, kit)
        base, _, _ = run(lv, [])
        line += f"  {lv} {n:5.1f}（×{n / base:.2f}）"
    print(line)
n, src, c = run("练九", ["凝神", "轮转", "葫芦", "灵池", "二重"])
print("练九满配来源：", {k: round(v) for k, v in src.items()}, "平均耗蓝", round(c, 1))
# 冷却上限：一局 10 分钟里约 5 分钟在打，三门法术冷却 8/10/12 秒 → 按冷却能放约 300×(1/8+1/10+1/12) ≈ 92 次
print("按冷却的上限 ≈", round(300 * (1 / 8 + 1 / 10 + 1 / 12)), "次 / 局")
