# 墨途（xianxia）

斜 45° 俯视的水墨修仙动作探索游戏（Web · Three.js）。单机搜打撤：练气 → 筑基，两个区域，洞府经营，首领青牙 / 碧鳞 / 心魔。

- 运行：`npm ci && npx vite`，浏览器打开开发服务器地址；调试入口 `?scene=title|cave|run&slot=N&region=r1`，F8 调试面板。
- 回归测试：`bash tools/regress.sh`（Playwright 驱动无头 Chromium 跑 tools/scenarios/ 下的场景脚本）。
- 美术：Blender 无头脚本（blender/）生成角色与怪物 glTF；环境 / 建筑在运行时程序化生成。
- 设计文档：docs/（设计文档、各岗位方案与知识库 docs/knowledge/）。

本快照为美术精细化重构开始前的稳定版本（2026-11-18）。第三方说明见 THIRD_PARTY_NOTICES.md。
