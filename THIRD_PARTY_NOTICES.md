# 第三方说明

本项目代码与文档保留所有权利（package.json：UNLICENSED），未授予开源许可。以下为所用第三方内容：

| 内容 | 来源 | 许可 |
|---|---|---|
| three.js 等 npm 依赖（不随仓库分发，`npm ci` 安装） | 见 package.json / package-lock.json | three.js、vite 为 MIT；playwright-core 为 Apache-2.0 |
| 单文件小样页面（docs/art/**/index.html）中内联打包的 three.js | https://github.com/mrdoob/three.js | MIT，Copyright © 2010-2025 three.js authors |
| 字体 Ma Shan Zheng、Long Cang、Zhi Mang Xing（assets/fonts/） | Google Fonts | SIL Open Font License 1.1，许可全文见 assets/fonts/OFL_*.txt |
| 程序化贴图烘焙等思路（tools/art_refine_v1/，文件头已注明出处） | 听雨园 https://github.com/Wode44398/tingyuyuan | MIT（仅借鉴思路） |
| 主角头部基础网格（docs/art/精细化小样_v1/，详见该目录 THIRD_PARTY.md） | MakeHuman / MPFB2 核心资产 | CC0 |
| blender/ 下的构建脚本 | 在 Blender 中运行，调用 Blender Python API（bpy） | Blender 为 GPL；脚本不随 Blender 分发 |
