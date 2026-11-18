# 水墨光标

由 `node tools/cursor_gen.mjs` 生成。每种光标有 32 / 64 两个尺寸，64 是 32 的两倍坐标。

| 名称 | 用途 | 热点 32 | 热点 64 |
|---|---|---|---|
| `default` | 默认（场景中） | 3, 3 | 6, 6 |
| `ui` | 悬停可点的界面元素 | 3, 3 | 6, 6 |
| `interact` | 可交互物（拾取、对话、开阵、撤离点） | 3, 3 | 6, 6 |
| `enemy` | 指向敌人 | 16, 16 | 32, 32 |
| `invalid` | 不可施放 / 超出范围 / 冷却中 | 16, 16 | 32, 32 |
| `aim-metal` | 瞄准（金） | 16, 16 | 32, 32 |
| `aim-wood` | 瞄准（木） | 16, 16 | 32, 32 |
| `aim-water` | 瞄准（水） | 16, 16 | 32, 32 |
| `aim-fire` | 瞄准（火） | 16, 16 | 32, 32 |
| `aim-earth` | 瞄准（土） | 16, 16 | 32, 32 |

CSS 用法（界面层）：`cursor: image-set(url(cursors/default_32.svg) 1x, url(cursors/default_64.svg) 2x) 3 3, default;`

游戏内若用自绘光标（隐藏系统光标、DOM/Canvas 元素跟随鼠标），把热点坐标当作元素的 transform-origin / 偏移即可；
光标元素放在最上层、`pointer-events: none`，不参与水墨后处理（保证任何画面下都清楚）。
