# 实测数据 — 09-01-slider-pill-thumb

取样方式：自有无头 Chrome `--remote-debugging-port=9227`（profile `/tmp/cdp-9227`）+ 本目录 `shoot.mjs`（改自父任务 `research/shoot.mjs`），页面 `http://localhost:3200/zh/docs/dev/components`，视口 1280×900 @2x。截图在 `before/{dark,light}/`、`after/{dark,light}/`。

## 弹簧选型（`spring.ts` 同一模拟器，DT 1/240，`spring-reversals.mjs`）

"速度反向"分两种计法：`revAll` 数所有符号翻转；`revOutsideBand` 只数发生在稳定带（|x−1| ≥ 0.001）之外的翻转——带内那次是回到 1 时 0.05% 量级的抖动，肉眼不可见。父任务表里 480/34 记 1 次，对应后者。

| k / c | ζ | settle | 过冲 | 欠冲 | 反向（全部 / 可见） |
|---|---|---|---|---|---|
| 480 / 34（snappy） | 0.776 | 400ms | +1.40% | 0.02% | 2 / 1 |
| 520 / 34 | 0.745 | 383ms | +2.16% | 0.05% | 2 / 1 |
| 540 / 34 | 0.732 | 371ms | +2.56% | 0.07% | 2 / 1 |
| **560 / 34（选定）** | 0.718 | **362ms** | **+2.97%** | 0.09% | 2 / **1** |
| 580 / 34 | 0.706 | 392ms | +3.40% | 0.12% | 2 / 2 |
| 600 / 34 | 0.694 | 396ms | +3.83% | 0.15% | 2 / 2 |
| 600 / 30 | 0.612 | 442ms | +7.69% | 0.59% | 3 / 2 |
| 640 / 36 | 0.712 | 338ms | +3.15% | 0.10% | 2 / 1 |

选 560/34：落在 2–5% 过冲区间、可见反向 1 次、362ms ≤ 420ms，且是 design.md 的起点值。`resolveTransition({ stiffness: 560, damping: 34 })` 输出 34 个采样、duration 362ms；采样序列峰值 1.0297（第 18 个点），尾部 0.9995 → 1 是编译器把末值强制为 1 造成的带内抖动。

## 改前（HEAD `b376f9edb`）

| 状态 | 折射板 w×h | 圆角 | 不透明度 | backdrop | 轨道 | 原生 thumb |
|---|---|---|---|---|---|---|
| rest | 38 × 17 | 13px | 0 | blur(0) sat(1) | 6px | 18px 白盘可见 |
| hover | 68.39 × 30.59 | 13px | 1 | blur(6px) sat(1.65) | 8px | 溶解 |
| drag | 89.67 × 40.11 | 13px | 1 | blur(10px) sat(1.9) | 10px | scale 1.16 |
| focus | 68.39 × 30.59 | 13px | 1 | 同 hover | 8px | 圆盘 + 3px 环 |

`--tx-slider-thumb-size` 18px；drag 到两端时折射板出轨道 35.84px（89.67 宽 − 18 命中）。Radio 指示条参照（暗色）：35 × 28、`999px`、底 `overlay 88%`、描边 `border-light 50%`、`0 2px 8px rgba(15,23,42,.08) + inset 0 1px 0 rgba(255,255,255,.17)`。

## 改后（暗色 / 亮色几何相同，颜色不同；`after/{dark,light}/metrics.log`）

| 状态 | 胶囊 w×h | 圆角 | 不透明度 | backdrop | 描边（rim） | 轨道 | 原生 thumb |
|---|---|---|---|---|---|---|---|
| rest | 40 × 20 | 999px | 1 | blur(8px) sat(1.6) | border-light 55% | 6px | 透明、无边框、无阴影 |
| hover | 40 × 20 | 999px | 1 | blur(8px) sat(1.8) | border-light 75% | 8px | 同上 |
| press 120ms | 43.19 × 21.59 | 999px | 1 | blur(10px) sat(1.9) | primary 30% 混入 | 10px | 同上 |
| drag（稳定） | 43.19 × 21.59 | 999px | 1 | blur(10px) sat(1.9) | 同上 | 10px | 同上 |
| focus（Tab） | 40 × 20 | 999px | 1 | blur(8px) sat(1.8) | border-light 75% + 末尾 `0 0 0 3px` 焦点环 | 8px | 同上 |

- `--tx-slider-thumb-size` 计算值 **40px**（= 胶囊宽），`refreshMetrics()` 读到 40；drag 到 0 / 100 时胶囊出轨道 **1.59px**（= 1.08 放大的一半：(43.19 − 40) / 2），rest 态两端刚好贴边。
- 填充条终点 `endX` 与胶囊 `centerX` 三态、两端全部相等（837.5 / 913.5 / 713.5）。
- drag / rest = 43.19 / 40 = **1.08** ≤ 1.10。
- 胶囊 `transition-duration`：`0.362s, 0.362s, 0.18s, 0.18s`（width / height 走弹簧，box-shadow / backdrop-filter 走 hover 时钟）；`transition-timing-function` 前两项是 `linear(0 0%, 0.0526 3.03%, …)`，即 `@supports` 分支生效。
- 暗色胶囊底 `color(srgb .114 .118 .122 / .22)`（overlay `#1d1e1f` 22%），亮色 `rgba(255,255,255,.22)`；与 Radio 指示条同一 token 家族，压在填充条上时蓝色由 backdrop 透上来（截图左半蓝右半灰）。
- 焦点环颜色：暗色 `rgb(33, 61, 91)`（`--tx-focus-ring-color` = `primary-light-7`），亮色 `rgb(198, 226, 255)`。暗色环在 `#1d1e1f` 胶囊上偏暗，仍可辨；这是 token 的既有取值，不在本任务范围。

Tooltip 叠放：拖拽态 tooltip 的 `y = −28px` 与 21.59px 高的胶囊不重叠（截图 `after/dark/slider-drag.png`：tooltip 底边与胶囊顶边之间留有间隙）。

## 文档页 5 个 demo（`after/{dark,light}/demos/`，`demos.mjs`）

`/zh/docs/dev/components/slider` 上共 19 个 `.tx-slider`（4 个基础 demo + elastic tooltip demo 的参数面板 15 个），全部渲染为胶囊、无白圆钮；禁用 demo 胶囊随 `opacity: .6` 一起变淡、无填充色透出（`demo-1.png`）。拖拽第一个 demo：tooltip 高 32px（文档页字号）、底边到胶囊顶边 **1.2px**（`gapPx`），弹簧峰值再多 0.32px 仍不重叠；静态 harness（`after/harness/`，tooltip 28px）里是 3.2px。`tooltipStyle` 的 `y = ±28` 未动。

## 其它核对

- `prefers-reduced-motion: reduce`（`reduced.log` / `harness.log`）：`--tx-slider-state-duration` / `--tx-slider-hover-duration` 皆 `0ms`，胶囊 / 轨道 / 填充 / 扁平圆钮的 `transition-duration` 全为 `0s`。
- 扁平路径（`thumbSurface=false`，`harness-{dark,light}.png`）：`--tx-slider-thumb-size` 18px，原生圆钮可见，hover 3px 环 / drag 6px 环 / focus 焦点环、scale 1.08 / 1.16 都在。画廊里把 `has-surface` 去掉后 `refreshMetrics()` 读到的值从 40px 变成 18px（`slider-flat-path-simulated.png`）。
- 焦点环：Tab 到滑块后 `is-focused`、`:focus-visible` 为真，胶囊阴影列表末尾出现 `0 0 0 3px` 环（`slider-focus.png`，两主题）。



> 2026-09-02 curation: the two `demo-4` elastic-tooltip page captures per theme (full page, ~600 KB each), `logs/coreapp-typecheck.log` (a build log) and the raw `pg-*.html` page dumps were dropped from the repo copy; `demos.mjs` regenerates the captures and `after/*/demos/metrics.log` keeps the measurements.
