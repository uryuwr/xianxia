# 精细化小样 v1 · 第三方资产与代码登记

> 本目录的产物（`assets/hero_v2.glb` 等）里用到或参考过的第三方东西，逐项登记来源、版本、许可、用法。新增第三方内容必须先登记再用。

| 名称 | 版本 / 获取 | 许可 | 用了什么 | 怎么用 | 进不进游戏包 |
|---|---|---|---|---|---|
| MPFB（MakeHuman 的 Blender 插件） | 2.0.18，`https://extensions.blender.org/add-ons/mpfb/`，下载包 `add-on-mpfb-v2.0.18.zip`（sha256 `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad`），装在 `D:/tools/mpfb2/extensions`（独立目录） | 插件代码 **GPL-3.0-or-later** | 只调用 `HumanService.create_human()` 生成人体 | 只在 `blender/refine_v1/mpfb_head.py` 里 import；该脚本导出纯数据 `work/refine_v1/mpfb_head.npz`（顶点 / 面 / 关节点），其余构建脚本只读这个数据、不 import 插件 | 插件代码**不进**；只有由 CC0 资产生成的网格进 |
| MakeHuman 系统资产：基础网格 hm08（`data/3dobjs/base.obj`）、macro targets（gender / age / muscle / weight / proportions / height / race） | 随 MPFB 2.0.18 插件包自带 | **CC0 1.0** | 取头 + 颈（去掉眼球、牙、舌等 helper 几何），宏参数：男、age 0.5、muscle 0.55、weight 0.42、proportions 0.8、height 0.6、asian 1.0 | 对齐、对称、下颌收窄、五官区域抹平、补洞、细分 / 减面后成为 `hero_v2.glb` 的头部网格 | 进（CC0，无署名义务；仍在此登记出处） |
| 听雨园（tingyuyuan） | 只读克隆 `D:/research_ext/tingyuyuan_src`，作者 Wode44398 | MIT | `src/materials/baker.js` 的思路（高度场 → 法线 / 缝隙积灰 / 边缘磨损 / 地平线 AO） | **只参考思路，未复制任何代码**；本项目的角色贴图由 Blender 从高模烘焙，实现无关 | — |

未使用：MakeHuman 社区资产包里的 CC-BY 资产（头发、衣服、皮肤贴图等）一律不用；头发、衣服、剑全部是本项目程序化生成。FLAME / SMPL-X / BFM 等学术人脸模型（非商用许可）禁用。

许可依据：
- [MakeHuman LICENSE.md（资产 CC0 1.0，含基础网格、targets、皮肤、姿势等；输出不受限制）](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md)
- [MPFB FAQ：Is it really free?](https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html)、[Can I sell models made with MPFB?](https://static.makehumancommunity.org/mpfb/faq/can_i_sell_models.html)
- 听雨园 `LICENSE`（MIT，Copyright (c) 2026 Wode44398）
