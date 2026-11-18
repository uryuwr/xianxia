#!/bin/sh
# 关卡评审全流程（在 docs/review/level 下运行）：生成定稿 → 硬崖补丁原型 → 烘焙高度场 → 渗漏检查 → 分析出图导 JSON → 差异文件
set -e
cd "$(dirname "$0")/.."
node tools/make_proposed.mjs
sed -e 's#from "../render/glsl.js"#from "../../../../src/render/glsl.js"#' \
    -e 's#      return f \* f \* (3 - 2 \* f);#      return this.def.hardCliffs ? (f < 0.5 ? 0 : 1) : f * f * (3 - 2 * f); // 评审：def.hardCliffs 时崖边取硬台阶（碰撞上没有中间高度，只有坡道 / 石阶能上下）#' \
    ../../../src/world/heightfield.js > tools/hf_hard.mjs
mkdir -p _cache
for r in r1 r2; do
  node tools/export_hf.mjs ../../../src/data/levels/$r.js _cache/cur_$r
  HF=tools/hf_hard.mjs node tools/export_hf.mjs proposed/$r.js _cache/new_$r
done
rm -f _cache/leaks.json
PY=./.venv/Scripts/python
for t in cur new; do
  PYTHONIOENCODING=utf-8 $PY tools/leaks.py ${t}_r1 "50,-22;40,0;1.4;2.8" "50,-22;64,38;1.4;2.8" "0,30;-30,-10;1.2;2.6" "40,30;60,-2;1.2;2.6"
  PYTHONIOENCODING=utf-8 $PY tools/leaks.py ${t}_r2 "-10,20;-60,0;1.2;3.2" "10,20;40,0;1.2;3.2" "-60,0;-100,-40;5.4;7.6" "0,-30;-40,-80;5;8"
done
PYTHONIOENCODING=utf-8 $PY tools/analyze.py
git diff --no-index --no-color ../../../src/world/heightfield.js tools/hf_hard.mjs | sed 's#b/tools/hf_hard.mjs#b/src/world/heightfield.js#; s#a/../../../src/world/heightfield.js#a/src/world/heightfield.js#' > _cache/hf.diff || true
$PY -c "
s=open('_cache/hf.diff',encoding='utf-8').read()
i=s.index('@@'); j=s.index('@@', s.index('glsl.js'))
open('proposed/heightfield_hardCliffs.diff','w',encoding='utf-8').write(s[:i]+s[j:])
"
echo OK
