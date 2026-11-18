#!/usr/bin/env bash
# 全量回归：由主 agent 在实现收工后串行跑所有场景，汇总 PASS / FAIL。用法：REGRESS_DIR=work/regress-final bash tools/regress.sh
cd "$(dirname "$0")/.."
REGRESS_DIR="${REGRESS_DIR:-work/regress}"
mkdir -p "$REGRESS_DIR"
LIST=(
  "loop_flow|scene=title"
  "loop_flow_levels|scene=run"
  "loop_quests|scene=cave&slot=3"
  "prep_layout|scene=cave&slot=3"
  "prep_pill_q|scene=cave&slot=3"
  "loop_cave|"
  "cave_spell_permissions|scene=title"
  "garden_station|"
  "garden_layout|"
  "inner_hall|scene=cave&slot=6"
  "gongfa_hint|scene=cave&slot=3"
  "loop_fac_unlock|"
  "gongfa_v2|scene=run&region=r1"
  "loop_content|"
  "loop_targeting|"
  "loop_levels|"
  "integ_leap|scene=cave&slot=3"
  "hero|"
  "enemies|"
  "skills|"
  "v03|"
  "loop_momentum|scene=run&region=r1"
  "weapon_affixes|scene=run&region=r1"
  "loop_skillbar|scene=run&region=r1"
  "loop_gather_ui|scene=run&region=r1&slot=3"
  "enemy_cliff|scene=run&region=r1"
  "loop_bag_v2|scene=run&region=r1&slot=4"
  "loop_loot|scene=run&region=r1&slot=4"
  "loop_slots_pages|scene=run&region=r1&slot=6"
  "loop_map|scene=run&region=r1&slot=2"
  "loop_mirror_v2|"
  "loop_forge_v2|"
  "result_res|scene=title"
  "boss_flow|scene=run&region=r1&slot=5"
  "boss_qingya|scene=run&region=r1&slot=8"
  "loop_pickup|scene=run&region=r1&slot=6"
  "loop_boss_loot|scene=run&region=r1&slot=7"
  "ui_esc|scene=title"
)
failed=0
run1() {
  local name="${1%%|*}" q="${1#*|}" code
  RUN_MAX=1 node tools/run.mjs "$name" "$q" > "$REGRESS_DIR/$name.log" 2>&1
  code=$?
  echo "exit $code" >> "$REGRESS_DIR/$name.log"
  if (( code != 0 )); then failed=1; fi
}
# 方法隔离专项单独用 Node，不交给浏览器场景 runner，也不替代上面的真实青牙整场。
node tools/check_enemy_reentrancy.mjs > "$REGRESS_DIR/enemy_reentrancy.log" 2>&1
node_code=$?
printf '\nexit %s\n' "$node_code" >> "$REGRESS_DIR/enemy_reentrancy.log"
printf '%-18s exit %s\n' "enemy_reentrancy" "$node_code"
if (( node_code != 0 )); then failed=1; fi
for e in "${LIST[@]}"; do
  run1 "$e"
done
for e in "${LIST[@]}"; do
  n="${e%%|*}"; f="$REGRESS_DIR/$n.log"
  p=$(grep -cE "^(PASS|✔)" "$f"); x=$(grep -cE "^(FAIL|✘)|scenario error" "$f")
  printf "%-18s pass %3s  fail %2s  %s\n" "$n" "$p" "$x" "$(tail -1 "$f")"
  if (( x > 0 )); then failed=1; fi
done
exit "$failed"
