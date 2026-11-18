# Blender 资产脚本

所有角色资产都由 Python 脚本在 Blender 后台生成，不做任何手工编辑，修改脚本后重跑即可。

Blender：便携版 4.5.16 LTS，`D:/tools/blender-4.5.16-windows-x64/blender.exe`

## 主角「白衣散修」

```bash
B=/d/tools/blender-4.5.16-windows-x64/blender.exe
$B -b --factory-startup --python blender/build_hero.py    # → assets/models/hero.glb（另存 work/hero_build.blend 便于查看）
$B -b --factory-startup --python blender/render_hero.py   # 导入 glb 校验 + 渲染 assets/previews/hero_*.png
```

两步加起来十几秒。`render_hero.py` 读取的是**导出后的 glb**，预览图同时也验证了导出结果。

### 尺寸与朝向

- 单位米，原点在脚底，身高约 1.75 m（含发髻 1.84 m），头身比约 6。
- glTF 中 +Y 向上，**角色面向 +Z**。Blender 中对应 Z 向上、面向 -Y，角色左侧为 +X。
- 静止姿势（绑定姿势）为 A 字形，手臂下垂 44°；剑在右手中，指向正前方。
- 约 5.3k 三角面，单个蒙皮网格，按材质拆成 10 个图元。

### 材质（游戏按名称替换为水墨 / 卡通着色器）

| 名称 | 部位 |
|---|---|
| `robe_white` | 外袍、宽袖、下摆 |
| `robe_inner` | 交领、裤管、袖口内衬 |
| `sash_dark` | 腰封、腰带垂带、护腕 |
| `skin` | 脸、颈、手 |
| `hair_black` | 头发、发髻、眉眼 |
| `ribbon_red` | 朱砂发带、发髻红绳（全身唯一亮色之一） |
| `boots_black` | 靴子 |
| `sword_steel` | 剑身 |
| `sword_hilt` | 剑柄、剑格、剑首 |
| `tassel_red` | 剑穗（全身唯一亮色之一） |

### 骨骼（33 根，名称不含 `.`，避免 three.js 清洗节点名）

```
root（不参与蒙皮）
└ hips ─ spine ─ chest ─ neck ─ head ─ ribbon1 ─ ribbon2 ─ ribbon3 ─ ribbon4
  │                    ├ shoulder_L ─ upperarm_L ─ forearm_L ─ hand_L
  │                    │                                    └ sleeve_L
  │                    └ shoulder_R ─ upperarm_R ─ forearm_R ─ hand_R ─ sword ─ tassel1 ─ tassel2
  │                                                         └ sleeve_R
  ├ thigh_L ─ shin_L ─ foot_L        ├ thigh_R ─ shin_R ─ foot_R
  ├ skirt_f1 ─ skirt_f2（前片）       └ skirt_b1 ─ skirt_b2（后片）
```

- 剑是网格的一部分，100% 绑定在 `sword` 骨上（`sword` 是 `hand_R` 的子骨）。挂点、剑尖位置可以从 `sword` 骨取。
- 发带、剑穗、袖、裙摆是次级骨骼。动画里它们的摆动由脚本中的简单物理模拟（Verlet 链 + 碰撞）烘焙出来；游戏里也可以改为实时驱动。

### 动画（30 fps 逐帧采样）

| 名称 | 时长 | 循环 | 说明 |
|---|---|---|---|
| `idle` | 2.00 s | 是 | 持剑待机，呼吸，发带轻飘 |
| `run` | 0.70 s | 是 | 剑拖在身后，发带向后飘 |
| `guard` | 1.00 s | 是 | 横剑格挡，左手扶剑 |
| `slash1` | 0.47 s | 否 | 右上 → 左下斜斩 |
| `slash2` | 0.47 s | 否 | 左上 → 右下反手斩，**起始姿势 = slash1 收势** |
| `slash3` | 0.50 s | 否 | 双手举剑过顶，前冲下劈，**起始姿势 = slash2 收势** |
| `dodge` | 0.40 s | 否 | 原地前冲闪身（位移由游戏代码给出） |
| `cast_point` | 0.47 s | 否 | 施法·点：单手前刺，剑尖指向前方（投射类法术） |
| `cast_sweep` | 0.53 s | 否 | 施法·扫：压低身形，剑由右向左平扫（扇形类法术） |
| `cast_raise` | 0.60 s | 否 | 施法·举：擎剑指天，左手剑诀（布阵 / 召唤 / 增益） |
| `hit` | 0.33 s | 否 | 受击后仰 |
| `die` | 1.20 s | 否 | 踉跄、单膝跪地、拄剑伏身（停在最后一帧） |

- 原地动画，不带根运动。
- 连段的命中帧约在第 0.22 s（slash1 / slash2）和 0.26 s（slash3）。
- 攻击动作结尾停在"半收势"姿势，接 `idle` 或下一段连击时由游戏做淡入淡出。
- 游戏按招式时长调整播放速度（`src/data/player.js` 的 `MOVES` / `CASTS`），出伤时间点以数据表为准，不读动画。
- 预览：`assets/previews/hero_poses.png`（普攻与身法）、`hero_poses_cast.png`（施法、受击、倒地）。

### 调整入口（`build_hero.py`）

- `MATS`：材质颜色。
- `TORSO`、`build_mesh()`：造型与比例。
- `idle()` / `run()` / `guard()`：循环动作，是关于时间的函数。
- `slash*_keys()` / `dodge_keys()` / `cast_*_keys()` / `hit_keys()` / `die_keys()`：关键姿势。手腕目标点、肘部朝向、剑的指向与刃口朝向、躯干旋转都在世界坐标中描述，由脚本的两骨 IK 求解。
- `Rig.chains`：次级动态参数（阻尼、刚度、重力、风）。

## 敌人「竹林狼妖」

```bash
$B -b --factory-startup --python blender/build_wolf.py    # → assets/models/wolf.glb（另存 work/wolf_build.blend）
$B -b --factory-startup --python blender/render_wolf.py   # 导入 glb 校验 + 渲染 assets/previews/wolf_*.png
```

- 约 2.1k 三角面，肩高约 1.1 m，原点在脚底，glTF 中 +Y 向上、**面向 +Z**。首领在游戏里放大 1.5 倍并换色，不另建模型。
- 材质：`fur_ink`（墨黑身体）、`fur_light`（颈鬃 / 胸毛 / 下颌，首领染紫）、`eye_red`（朱红眼，带自发光）、`claw`（骨白爪牙）。`aura_purple` 预留未用（首领妖气由游戏粒子表现）。
- 骨骼 25 根：`root`（不蒙皮）、`hips spine chest neck head jaw`、`tail1~4`、前腿 `fup_* flow_* fpaw_*`、后腿 `hup_* hlow_* hmeta_* hpaw_*`（`*` = L / R）。
- 动画（30 fps，原地，无根运动；冲扑位移由游戏代码给出）：

| 名称 | 时长 | 说明 |
|---|---|---|
| `idle` | 2.0 s 循环 | 压低身子伺机而动，尾巴慢摆 |
| `run` | 0.6 s 循环 | 疾驰，脊柱伸缩 |
| `attack_bite` | 0.6 s | 后坐蓄势 → 扑咬，**命中帧约 0.32 s** |
| `attack_claw` | 0.5 s | 抬左前爪横扫，**命中帧约 0.28 s** |
| `hit` | 0.33 s | 受击后仰 |
| `die` | 1.0 s | 侧倒（停在末帧） |
| `howl` | 1.0 s | 坐起仰头长嚎（首领增益） |

- 动作是正向运动学：`build_wolf.py` 里每根骨骼一个"骨架空间"欧拉角，`BITE / CLAW / HIT / DIE / HOWL` 是关键姿势表；尾巴是逐节相位滞后的摆动。
- 游戏里命中帧写在 `src/data/enemies.js` 的 `animHit`：蓄力阶段按 `animHit / windup` 放慢播放，保证出手瞬间和预警结束对齐。

## 两区域敌人（第一版闭环，`lib_creature.py` 公共库）

`lib_creature.py` 是从 `build_wolf.py` 抽出来的通用部分：网格构建器 `MB`（`loft` 放样 / `ellipsoid` / `spike` 笔触尖刺 / `block` 切角石块 / `sheet` 双层薄片）、按部件就近两骨权重、"骨架空间"欧拉角关键姿势（`mkpose` / `keys_fn` / `add_pose`）、烘焙与 GLB 导出（`build_creature`）。新敌人脚本只写造型、骨骼表和关键姿势。

```bash
$B -b --factory-startup --python blender/build_golem.py      # → assets/models/golem.glb
$B -b --factory-startup --python blender/build_bat.py        # → assets/models/bat.glb
$B -b --factory-startup --python blender/build_vine.py       # → assets/models/vine.glb
$B -b --factory-startup --python blender/build_serpent.py    # → assets/models/serpent.glb
$B -b --factory-startup --python blender/render_creature.py -- golem   # 校验 + assets/previews/golem_{side,front,topdown45,game_scale,poses}.png
```

约定同上：Z 向上、面向 -Y、原点在脚底；导出后 +Y 向上、面向 +Z。命中帧（秒）对应 `src/data/enemies.js` 的 `animHit`。

| 模型 | 用于 | 三角面 / 骨骼 | 材质 | 动画（命中帧） | 剪影要点（45° 俯视） |
|---|---|---|---|---|---|
| `golem.glb` 山神庙石傀 | `golem` | 926 / 15 | `stone_dark` `stone_light` `rune_glow` `moss` | idle、run、attack_slam（0.55）、attack_swipe（0.35）、hit、die | 倒梯形宽肩 + 两块垂到膝下的大石拳，背上一排石刺；额心、胸口、小臂发光符文 |
| `bat.glb` 蝠妖 | `bat` | 616 / 9 | `fur_ink` `wing_membrane` `eye_red` `claw` | idle、run（扇翅）、attack_swoop（0.4，身体压到离地 0.6 m）、attack_bite（0.25）、hit、die（坠地） | 翼展 2.6 m 的锯齿"八"字，身体悬停 1.7 m |
| `vine.glb` 藤妖 | `vine`、`vine_elite`（×1.4 染紫） | 1918 / 11 | `bark` `vine_green` `leaf_green` `eye_glow` `flower_red` | idle、run（滑行）、attack_spit（0.45）、attack_lash（0.32）、attack_cast（0.5）、hit、die（枯萎） | 放射根座 + 扭藤干 + 叶苞头（发光独眼）+ 头顶朱红藤花，两条带刺长藤臂 |
| `serpent.glb` 碧鳞水蟒（Boss） | `bilin` | 1628 / 18 | `scale_dark` `scale_jade` `belly` `eye_gold` `claw` | idle、run（蜿蜒）、attack_bite（0.4）、attack_tail（0.45）、attack_spout（0.6）、dive（潜入地下）、emerge（破水而出）、roar（换盾怒吼）、hit、die | 后半身在地上盘成 C 形大弧，前半身立起 3.3 m，背脊碧玉鳍刺、金色竖瞳、两根后弯角 |

- 复用模型：灰毛狼妖 `wolf_grey`（狼 ×0.85 染灰）、狼妖首领 `wolf_elite`（×1.5 染紫）（Boss 青牙 v2 已改用专属模型 `qingya.glb`，见下文）；心魔 `xinmo` 用主角 `hero.glb`，游戏里换成墨色倒影材质（朱砂发带 / 剑穗保留）。
- 骨骼：石傀每段石块刚性绑定（`hips spine chest head upperarm_* forearm_* fist_* thigh_* shin_*`）；蝠妖 `body head wing1_* wing2_* wtip_*`（翼膜按距离蒙到三节翼骨）；藤妖 `base trunk1 trunk2 head arm1~3_*`；水蟒 `hips`（盘身与立身的接点，带位移）→ 前段 `f1~f6 head jaw`、后段 `t1~t8`。
- 水蟒的 `dive` 把整条蛇沉到地下 3.8 m，`emerge` 从地下冲出；游戏里"潜水突袭"在预警期间播 `dive`、出招瞬间瞬移到落点再播 `emerge`。

## 低阶怪与异种（区域规划 v2 · 怪物生态 v1，2026-11-17）

```bash
for n in rat crow spider snake toad; do
  $B -b --factory-startup --python blender/build_$n.py
  $B -b --factory-startup --python blender/render_creature.py -- $n
done
```

| 模型 | 用于 | 三角面 / 骨骼 | 材质 | 动画（命中帧） | 45° 俯视剪影 |
|---|---|---|---|---|---|
| `rat.glb` 山鼠妖 | `rat`（区域一，成群、快） | 788 / 11 | fur_brown fur_ink eye_red claw | idle、run、attack_bite（0.25）、hit、die | 大圆耳、尖吻、细长墨尾、背脊短刺 |
| `crow.glb` 鸦妖 | `crow`（区域一，飞行俯冲） | 558 / 9 | feather feather_light beak eye_red claw | 同蝠妖：idle、run、attack_swoop（0.4）、attack_bite（0.25）、hit、die | 墨羽"八"字翼 + 翼缘长羽、金喙、扇形尾 |
| `spider.glb` 蛛妖 | `spider`（区域一，远程吐丝减速） | 972 / 20 | carapace silk eye_red claw | idle、run、attack_spit（0.45）、attack_bite（0.25）、hit、die | 放射"米"字长腿、骨白丝纹、朱红眼簇 |
| `snake.glb` 竹叶青 | `snake`（区域二，贴地扑咬；游戏缩放 ×1.4） | 586 / 11 | snake_green snake_belly eye_gold claw | idle、run、attack_bite（0.3）、hit、die | S 形青身、前段微抬、三角头 |
| `toad.glb` 寒蟾 | `toad`（区域二，寒气吐息 / 跳砸，霸体） | 1552 / 8 | toad_skin toad_belly wart eye_ice | idle、run（跳）、attack_breath（0.5）、attack_slam（0.48）、hit、die | 宽扁蹲身、霜白疣粒、冰蓝凸眼 |

- `build_crow.py` 由 `work/mk_crow.mjs` 从 `build_bat.py` 派生：骨架与扇翅动作沿用蝠妖，只换造型。
- 异种不另建模：赤狼 `chilang` = 狼模型 ×1.3 + 火红染色 + 橙色头顶光环；玄鳞蝠 `xuanlin_bat` = 蝠妖 ×1.45 + 玄墨身、金纹翼 + 冰蓝光环。数据在 `src/data/enemies.js`（tint / halo / nameColor）。
- 所有模型都有 `head` 骨（"隙"字、喘息墨气取头位）。

## 首领「狼王青牙」v2（docs/design/boss_青牙_v2.md §9，2026-11-17）

```bash
$B -b --factory-startup --python blender/build_qingya.py      # → assets/models/qingya.glb
$B -b --factory-startup --python blender/render_creature.py -- qingya --scale=2.2 --hide=qingya_crack,qingya_eyefire --zoom=1.7
$B -b --factory-startup --python blender/render_creature.py -- qingya --scale=2.2 --hide=qingya_armor --tag=_p2 --poses=0
```

- 不再复用狼模型（旧的"狼 ×2.3"作废）：肩宽胸厚、短粗腿、头大前探，游戏 scale 2.2（肩高 2.75 米）。骨骼与竹林狼同名同层级（25 根）。
- 子网格（共用骨骼，游戏里由 `src/fx/boss_look.js` 切换）：`qingya` 本体 2024 面 · `qingya_armor` 一阶段背部 4 块骨板 352 · `qingya_crack` 二阶段裂开的骨板 + 青光裂缝 424 · `qingya_eyefire` 眼焰火芯 32。一阶段可见 2376 面、二阶段 2480 面。
- 材质：`fur_qing` `fur_belly` `fur_light` `fang_jade` `bone_armor`（含爪）`eye_jade` `crack_glow` `eye_fire`。
- 动画（30 fps，原地；括号内为命中帧 animHit）：idle 2.0 循环、run 0.6 循环、lie 3.0 循环、wake 1.4、cower 1.4、attack_claw 0.6（0.28）、attack_bite 0.6（0.32）、bite_double_a 0.53（0.30）、bite_double_b 0.6（0.25，起始 = a 收势）、turn_bite 0.7（0.40，前 0.42 秒尾巴竖起抖动）、howl 1.0（0.30）、howl_moon 2.6（2.2）、sink 0.8（末帧整只沉到地下）、emerge 0.6（0.05，作 strikeAnim）、crash 0.5、dizzy 1.2 循环、stagger 0.8、down 0.6、down_loop 2.0 循环、rise 0.9、leap_perch 0.8、armor_burst 1.2（0.5 秒炸开）、exec_hit 1.0（0.12 剑入）、kneel 0.8、final 1.6、hit 0.33、die 1.0。

## 主角处决动画（追加，原有 12 段逐帧不变）

| 名称 | 时长 | 关键时刻 | 说明 |
|---|---|---|---|
| `execute_leap` | 0.53 s | 0.14 下蹲、0.32 腾空 | 双手反握剑高举、剑尖朝下（位移 / 抬高由处决系统给） |
| `execute_stab` | 0.40 s | **0.20 剑尖插入** | 起始姿势 = leap 末帧；单膝跪地双手下插 |
| `execute_draw` | 1.37 s | 0–0.6 收剑于左腰、**0.78 拔斩**、0.9–1.14 残心 | 终结处决的居合 |

预览 `assets/previews/hero_poses_exec.png`。比对旧动画：`python tools/glb_anim_diff.py 旧.glb assets/models/hero.glb`。

## 狼谷场景件（静态，`build_wolfvalley.py`）

`assets/models/props/<id>.glb`，原点底面中心、正面 +Z；材质 `rock_ink rock_pale bone cloth_banner rope totem_glow`（关卡 `src/world/markers.js` 按前缀换材质、按 id 自动替换程序化占位）。

| id | 面数 | 说明 |
|---|---|---|
| `wolf_king_rock` | 418 | 狼王石：平顶卧台高 2.45，顶上爪痕、骨屑、小头骨 |
| `fang_pillar` / `fang_pillar_broken` | 225 / 179 | 狼牙石柱：高 3.2 弯牙；残桩 0.9 米 + 6 块矮碎石（同原点） |
| `wolf_totem` / `wolf_totem_fallen` | 658 / 670 | 狼骨图腾：骨节杆、头骨、横杆、两面破幡；totem_glow = 眼窝 + 幡上符纹；倒地版上半截倒向 +X |
| `wolf_rock` | 96 | 狼岩 r≈1.25 |
| `mist_gate` | 302 | 墨雾门石桩：两根外倾立石 x = ±1.5（门宽 3 米，`mist_gate(W)` 参数），悬链草绳 + 骨符（雾由关卡 fogWall 做） |
| `bone_long` / `bone_mid` / `bone_short` / `bone_rib` | 136 / 130 / 136 / 56 | 狼窝散件：长骨 1.08 / 0.78 / 0.48 米（沿 +X）、弯肋骨；原点在底面中心 |
| `wolf_skull` | 170 | 狼颅（吻部朝 +Z）+ 散落下颌；眼窝 rock_ink |
| `antler` | 118 | 啃过的鹿角，沿 +X 长 1.06 |
| `straw_nest` | 138 | 狼窝草垫：直径约 3.4、高 0.13，材质 `straw` |

生成单件：`$B -b --factory-startup --python blender/build_wolfvalley.py -- <id…>`（不写 = 全部）。

预览 `blender/render_props.py` → `assets/previews/props_*`。
