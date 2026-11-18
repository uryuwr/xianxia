---
name: role-knowledge
description: 《墨途》各专业岗位（数值策划、关卡设计、UI设计、战斗设计、性能工程、美术管线、宣传视频、玩法系统）的知识沉淀规范。任何岗位子 agent 开工前加载：告诉你本岗位的知识放在哪、有哪些工具、踩过哪些坑、有哪些可沿用的优秀设计，以及干完活怎么写回。
---

# 岗位知识沉淀（墨途）

你是某个专业岗位的子 agent。本 skill 规定你**开工前读什么、遇到不会的怎么学、干完活写回什么**。目的是让知识在岗位之间、在多次开 agent 之间累积，而不是每次从零开始。

## 一、确定你的岗位目录

| 岗位 | 知识目录 | agent 定义 |
|---|---|---|
| 数值策划 | docs/knowledge/数值策划/ | .claude/agents/numeric-designer.md |
| 关卡设计 | docs/knowledge/关卡设计/ | .claude/agents/level-designer.md |
| UI 设计 | docs/knowledge/UI设计/ | .claude/agents/ui-designer.md |
| 战斗设计 | docs/knowledge/战斗设计/ | .claude/agents/combat-designer.md |
| 性能工程 | docs/knowledge/性能工程/ | .claude/agents/perf-engineer.md |
| 美术管线 | docs/knowledge/美术管线/ | .claude/agents/art-pipeline.md |
| 宣传视频 | docs/knowledge/宣传视频/ | .claude/agents/video-producer.md |
| 玩法系统（流程 / 洞府 / 委托开发） | docs/knowledge/玩法系统/ | .claude/agents/gameplay-dev.md |

跨岗位任务（例如关卡 + 数值）两个目录都要读，各自写回。

## 二、开工前（必做，按顺序）

1. 读 `docs/knowledge/README.md`（全局写作规则）。
2. 读你岗位目录下**全部**文件，至少：
   - `方法论.md`：业内方法、公式、框架
   - `工具.md`：已安装的工具、路径、运行命令
   - `坑.md`：踩过的坑和规避办法——**动手前逐条对照**
   - `范例.md`：本项目做得好的设计，优先沿用
   - `本项目约定.md`：数据格式、文件归属、已定决策
3. 读与任务相关的项目文档：`docs/设计文档_v0.3.md`、`docs/最小闭环设计_v1.md`、`docs/开发约定_v1.md`，以及 `docs/review/` 下本岗位的历史报告。
4. 如果目录还是空的，你就是第一个人：本次任务结束前必须把五个文件建起来。

## 三、知识不够时：主动学

- 用 WebSearch / WebFetch 检索业内资料：GDC 演讲、行业博客、经典书籍、学术论文、竞品拆解与开发者访谈。只采信可追溯来源，记下链接。
- 需要工具就装：
  - Python 库装进本岗位的 venv（例如 `docs/review/numeric/.venv`），写清安装命令；
  - 下载的二进制放进单独的新目录，只作为工具执行，不要在下载目录里运行解释器；
  - Node 工具优先用项目已有依赖（vite、playwright-core）。
- 学到的东西先在当前任务里用上，用实测验证，再写进知识库。

## 四、干完活（必做）：写回知识库

| 写什么 | 写到哪 | 怎么写 |
|---|---|---|
| 新学到的通用方法、公式 | 方法论.md | 方法 + 变量含义 + 本项目取值 + 出处链接 |
| 装了或用了什么工具 | 工具.md | 安装命令、路径、运行命令、参数、典型输出 |
| 踩到的坑 | 坑.md | 现象 → 原因 → 规避办法 → 日期 |
| 做得好、值得沿用的设计 | 范例.md | 设计是什么 → 为什么好（用户反馈或数据）→ 文件或截图位置 → 适用场景 |
| 只对墨途成立的规则 | 本项目约定.md | 规则 + 原因 + 决策日期 / 谁拍板 |
| 读过的资料 | 参考资料.md | 标题 + 链接 + 一句话结论 |
| 被实测推翻的假设 | 直接改原条目，并在 坑.md 记一笔 | 不要留过时内容 |

**多人共写同一目录时（重要）**：文件已存在时，只能用 Edit 追加或修改自己那一节，**绝不能用 Write 整文件覆盖**；写前先 Read 最新内容。每个人的条目放在自己的二级标题下（例如"## 洞府（模块 C）"），不要改别人的节。

最终回复里列出：**本次读了哪些知识条目、沿用了哪些范例、新增或修改了哪些条目**。

## 五、全局约定（所有岗位）

- 不做任何 git 操作；改别的岗位负责的文件前，先用 SendMessage 和对方沟通，或报告主管。
- 品级只有一套：`src/core/items.js` 的 RARITY（凡 / 灵 / 宝 / 仙 / 极及颜色），可读深色用 `src/fx/rarity_tint.js` 的 `inkReadable`。
- 新特效和新 UI 遵守 `docs/性能优化_v1.md` 第 7 节。
- UI 方案先出可交互 HTML 草图给用户选，再落地。
- 测试：`node tools/run.mjs <场景> [query]`；全量回归 `bash tools/regress.sh`。只做可运行测试，手感由用户试玩。
- 回复用中文。
