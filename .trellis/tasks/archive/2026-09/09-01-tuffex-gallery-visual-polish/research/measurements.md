# 实测数据 — 2026-09-01 nexus 画廊

取样方式：无头 Chrome `--remote-debugging-port=9226`（私有 profile `/tmp/cdp-gallery-9226`）+ `apps/nexus/scripts/audit-cdp-client.mjs`，页面 `http://localhost:3200/zh/docs/dev/components`，视口 1280×900 @2x。暗色 = `Emulation.setEmulatedMedia` + `localStorage nuxt-color-mode=dark` + `html.dark`；亮色反之。脚本：本目录 `shoot.mjs`（三格 + slider 三态）、`shoot-radio.mjs`（Radio 参照物）。

截图落在 `/tmp/gallery-shots/{dark,light}/*.png`（临时目录，不入库；用脚本可重现）。

**坑**：`Page.captureScreenshot` 的 `clip` 要文档坐标（`getBoundingClientRect` + `scrollX/scrollY`）并加 `captureBeyondViewport: true`，否则得到纯色空图而 `getComputedStyle` 一切正常——第一轮就是这样被骗的。

## 主题 token（暗色，`html.dark`）

| token | 值 |
|---|---|
| `--tx-color-success` | `#67c23a`（继承 `:root`，`.dark` 未定义） |
| `--tx-color-warning` | `#e6a23c`（同上） |
| `--tx-color-danger` | `#f56c6c`（同上） |
| `--tx-color-primary` | `#409eff` |
| `--tx-text-color-primary` | `#e5eaf3` |
| `--tx-bg-color` | `#141414` |
| 画廊格子底 | 透明，透出页面 ≈ `#131212` |

## StatusBadge（暗色）

用户截图取样（838×474，页面 `#131212`）：

| 徽标 | 文字/图标 | 填充 | 描边 | 文字:页面 | 填充:页面 | 描边:页面 |
|---|---|---|---|---|---|---|
| Online | `#67c23a` | `#1e2719` | `#355924` | 8.33 | 1.21 | 2.32 |
| Reviewing | `#e6a23d` | `#2d2419` | `#674c26` | 8.55 | 1.23 | 2.35 |
| Failed | `#f56c6d` | `#2f1d1e` | `#6d3738` | 6.45 | 1.17 | 2.01 |

计算样式（CDP）：`font-size 12px`、`font-weight 600`、`padding 4px 12px`、`gap 6px`、`border-radius 8px`、图标 `font-size 14px` 但实渲 **16.8 × 16.8px**（nexus `presetIcons({ scale: 1.2 })`），徽标高 27px。

图标：success `i-carbon-checkmark-filled`（实心）、warning `i-carbon-warning`（描线）、danger `i-carbon-close-outline`（描线）、info `i-carbon-information`（描线）、muted `i-carbon-minimize`（横线）。`@iconify-json/carbon@1.2.24` 里 `checkmark-outline` / `circle-dash` 均存在。

亮色：同 hex 在 `#ffffff` 上文字对比度 2.24 / 2.19 / 2.90（本任务不管亮色文字对比度，只记录）。

候选暗色 token（在 `#141414`）：

| token | 候选 | 文字 CR | 12% 填充 | 32% 描边 CR |
|---|---|---|---|---|
| success | `#4ade80` | 10.57 | `#1a2c21` | 2.13 |
| success | `#5fd37b` | 9.73 | `#1d2b20` | 2.05 |
| warning | `#fbbf24` | 11.04 | `#302916` | 2.19 |
| warning | `#f5b942` | 10.44 | `#2f281a` | 2.13 |
| danger | `#f87171` | 6.66 | `#2f1f1f` | 1.73 |
| danger | `#fb7185` | 6.84 | `#301f22` | 1.75 |
| （高对比套）`#86efac / #facc15 / #fda4af` | | 13.1 / 12.0 / 9.7 | | 白墨水压 `#fda4af` 仅 1.8，不可作普通暗色 |

## Slider（暗色 / 亮色数值相同，颜色不同）

| 状态 | class | 折射板 w×h | 圆角 | 不透明度 | backdrop | 轨道高 |
|---|---|---|---|---|---|---|
| rest | `has-surface` | 38 × 17 | 13px | 0 | blur(0) sat(1) | 6px |
| hover | `is-hovering` | 68.39 × 30.59 | 13px | 1 | blur(6px) sat(1.65) | 8px |
| drag | `is-hovering is-dragging` | 89.67 × 40.11 | 13px | 1 | blur(10px) sat(1.9) | 10px |

折射板底色 `color(srgb 0.25 0.62 1 / 0.10)`（drag 0.16），内描边 `inset 0 0 0 1px primary 16%`。原生 thumb 在 CDP 的 `::-webkit-slider-thumb` 计算样式读不到真实值（返回整条 input 的尺寸），以截图为准：rest 有 18px 白盘，hover 溶解，drag 放大。

按下弹跳（按关键帧 + 每段 `cubic-bezier(0.22, 1.2, 0.36, 1)` 模拟，240fps）：

| 动画 | 轨迹 | min / max | 摆幅 | 速度反向 |
|---|---|---|---|---|
| thumb press | 1 → 0.90 → 1.32 → 1.08 → 1.16 | 0.899 / 1.325 | 43% | 4 |
| surface press | 0.61 → 1.27 → 1.0 → 1.0 | 0.610 / 1.279 | 67%（drag 盒 55–115px） | 2 |

状态曲线 `cubic-bezier(0.34, 1.5, 0.5, 1)`：峰值 1.080（+8% 过冲）在 53% 时长处；rest→drag 折射板宽度峰值 93.8px；hover→rest 下冲到 35.6px。

弹簧候选（`liquid/src/spring.ts` 同一模拟器，DT 1/240）：

| k / c | ζ | settle | 过冲 | 速度反向 |
|---|---|---|---|---|
| 480 / 34（snappy） | 0.78 | 400ms | +1.4% | 1 |
| 600 / 30 | 0.61 | 442ms | +7.7% | 3 |
| 700 / 30 | 0.57 | 442ms | +10.3% | 2 |
| 190 / 26（smooth） | | 587ms | 0 | 0 |
| 320 / 17（bouncy） | | 746ms | +17.6% | 多 |

目标区间（过冲 2–5%、反向 1 次）落在 480/34 与 600/30 之间，实现时从 560/34 起调。

## Radio 指示条（参照物，暗色）

组：125 × 36，`border-radius 999px`，底 `bg-overlay 10%`，描边 `border-color-light 72%`，`padding 3px`。
指示条 `indicator-plain`：35 × 28，`border-radius 999px`，底 `color-mix(bg-overlay 88%, transparent)`（暗色实渲近 `#1d1e1f`），描边 `border-color-light 50%`，`box-shadow 0 2px 8px rgba(15,23,42,.08) + inset 0 1px 0 rgba(255,255,255,.17)`。命中层 `indicator-hit` `cursor: grab`，拖拽 `scale(1.08)`，弹簧 JS rAF（drag k 112 / c 9；idle 110 / 12）。
亮色：同结构，指示条是白胶囊 + 发丝描边 + 极淡投影。

## ProgressBar（暗色）

| 实例 | 轨道 w×h | `::after` 描边 | mask 底 | mask backdrop | bar 底 | bar 阴影 |
|---|---|---|---|---|---|---|
| 画廊 62% | 240 × 5 | `rgba(135,135,136,.66)` 1px | `#1d1e1f` @ .14 | blur(16px) sat(1.5) | `#409eff` | `0 10px 24px primary 22%`（被 `overflow: hidden` 裁掉） |
| 画廊 indeterminate | 240 × 5 | 同上 | 同上 | 同上 | 透明 | 无 |
| 别处 TxProgress（`mask-background="mask"`） | 202 × 6 | 0px | `#1d1e1f` 不透明 | none | `#409eff` | 同上 |

亮色：`::after` 描边 `rgba(238,240,244,.66)`，几乎不可见 → "空管子"是暗色专属。

## 爆炸半径

读取 `--tx-color-(success|warning|danger)` 的 tuffex 组件目录（30）：ai-elements alert attachment-tray badge button chain-of-thought chat context-indicator context-menu dropdown-menu empty-state flat-input form icon input message-actions progress-bar select stat-card status-badge steps stream-markdown tab-bar tag textarea timeline toast tool-call-card tool-confirmation version-capsule。

用语义色做**实心底**的：`tool-confirmation/src/TxToolConfirmation.vue:201`（`.is-dangerous` → `--tx-color-danger`），墨水为按钮默认色。

下游调用：`TxStatusBadge` 33 个 nexus/core-app 文件；`TxProgressBar` 直接调用 nexus `pages/dashboard/storage.vue`（渐变 `color` + `height 8px`）、core-app `components/plugin/tabs/PluginStorage.vue`（`indicator-effect="sparkle" hover-effect="glow"`）、5 个 nexus `Components*Demo.vue` + 3 个 `ProgressBar*Demo.vue`；`TxSlider` core-app `ThemeStyle.vue` / `CanvasGridEditor.vue`、plugin `touch-music` 两处。wrapper：`TxProgress → TxProgressBar`；slider / status-badge 无 wrapper。
