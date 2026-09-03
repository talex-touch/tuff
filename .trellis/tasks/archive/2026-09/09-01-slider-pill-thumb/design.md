# Design — slider 胶囊拖钮

## 一个物件，不是两个

现状是"原生圆钮负责静止态、折射板负责活动态"两个物件轮流出场，hover 时还要把圆钮溶解掉给折射板让位。改后只有**一个**视觉物件：`.tx-slider__surface` 胶囊，三态常驻。原生 `::-webkit-slider-thumb` 退化为纯命中区域（`background: transparent; border: 0; box-shadow: none`），它的存在只为让浏览器处理指针 / 键盘与 value 映射。

| 层 | 职责 | 尺寸 |
|---|---|---|
| 原生 thumb | 命中 + value↔px 映射 | 宽 = `--tx-slider-thumb-size` = 胶囊宽；高 = `--tx-slider-height` |
| `.tx-slider__surface` | 全部视觉 | 宽 `--tx-slider-surface-width × extent`，高 `--tx-slider-surface-size × extent` |

`refreshMetrics()` 读 `--tx-slider-thumb-size` 算 `thumbCenterPx`，胶囊用 `left: thumbCenterPx` 跟随，填充条终点也是 `thumbCenterPx`。把命中宽度设成胶囊宽度后，value=0 时胶囊中心在 `宽/2`，胶囊左缘贴轨道左端；value=100 同理，两端不出界。这条链一个字不改，只改 `--tx-slider-thumb-size` 的值。

`thumbSurface: false`：`.tx-slider:not(.has-surface)` 覆盖 `--tx-slider-thumb-size: 18px` 并恢复原生圆钮的可见样式；`refreshMetrics()` 读到的是 class 解析后的值，所以扁平路径自动回到旧几何。

## 胶囊配方（对齐 Radio 指示条）

Radio 三种 indicator 的实测配方：

- `plain`：`bg-overlay 88%` + `border-color-light 50%` 描边 + `0 2px 8px rgba(15,23,42,.08)` + `inset 0 1px 0 rgba(255,255,255,.17)` 高光
- `blur`：`bg-overlay 10%` + `border-color-light 40%` 描边 + `backdrop-filter`
- `glass`：`TxGlassSurface` SVG 位移滤镜（重，每帧 rAF）

slider 取 **blur 的骨架 + plain 的高光**，不上 SVG 滤镜（滑块每帧写 `left`，再叠一层位移滤镜会把主线程压垮，这也是 Radio 里 glass 只在拖拽时才亮起的原因）：

```
--tx-slider-surface-size: 20px;                 /* 高，公开覆盖点，语义不变 */
--tx-slider-surface-width: 40px;
--tx-slider-surface-radius: 999px;
--tx-slider-surface-extent: 1;                  /* rest = hover */
--tx-slider-surface-opacity: 1;                 /* 三态常驻 */
--tx-slider-surface-blur: 8px;
--tx-slider-surface-saturate: 160%;
--tx-slider-surface-tint: color-mix(in srgb, var(--tx-bg-color-overlay) 22%, transparent);
--tx-slider-surface-rim: color-mix(in srgb, var(--tx-border-color-light) 55%, transparent);
box-shadow:
  inset 0 0 0 1px var(--tx-slider-surface-rim),
  inset 0 1px 0 rgba(255, 255, 255, 0.17),
  0 2px 8px rgba(15, 23, 42, 0.08);
```

- `bg-overlay` 亮色 `#fff`、暗色 `#1d1e1f`：22% 混透明后亮色是霜白、暗色是比页面略浅的深灰——正是 Radio 暗色截图里那枚胶囊。
- 不再用 `--tx-color-primary` 做底色。蓝色来自胶囊压在填充条上时 `backdrop-filter` 透上来的那一半，左半蓝右半灰，这正是现在拖拽截图里好看的部分。
- hover：`--tx-slider-surface-rim` 提到 75%，`saturate` 提到 180%，尺寸不变。drag：`extent: 1.08`，`blur: 10px`，`rim` 混入 `--tx-color-primary` 30%。

具体数值在实机上校准，以"与 Radio 格子并排不违和"为准，不以本文为准。

**落地值（2026-09-02，`research/after/{dark,light}/side-by-side.png`）**：上面的配方原样落地，只有两处与草案不同——高光写成 `color-mix(in srgb, var(--tx-color-white, #fff) 17%, transparent)` 而不是 `rgba(255,255,255,.17)`（组件样式里不留 rgba 字面量；Radio 指示条本身仍是字面量，没动）；drag 的 rim 是 `color-mix(primary 30%, hover-rim)`，即在 hover 的 75% 描边上再混入主色，而不是从 55% 基线混。实测胶囊 40 × 20 → drag 43.19 × 21.59；暗色底 `#1d1e1f` 22%、亮色 `#fff` 22%；焦点环追加为第四层 `0 0 0 3px var(--tx-focus-ring-color)`。

## 弹跳：把关键帧删掉，让过渡本身就是弹簧

现状的问题不在幅度，在**结构**：四个关键帧、每段各套一条过冲 bezier，速度在每个关键帧边界反向。任何幅度下都不会丝滑。

改法：drag 态只是 `extent` 从 1 变到 1.08，这一步 `width/height` 过渡用弹簧曲线，就是全部的"弹跳"。曲线用 `spring.ts` 的 `simulate` 编译成 CSS `linear()`：

| 候选 k / c | ζ | settle | 过冲 | 速度反向 |
|---|---|---|---|---|
| 480 / 34（`presets.snappy`） | 0.78 | 400ms | +1.4% | 1 |
| **560 / 34（选定）** | 0.72 | **362ms** | **+2.97%** | **1** |
| 580 / 34 | 0.71 | 392ms | +3.4% | 2 |
| 600 / 30 | 0.61 | 442ms | +7.7% | 3 |

实测（`research/spring-reversals.mjs`，同 `spring.ts` 模拟器）：560/34 过冲 +2.97%、欠冲 0.09%、可见反向 1 次（稳定带 |x−1| ≥ 0.001 之外；带内还有一次回到 1 时的 0.05% 抖动，肉眼不可见）、362ms 收敛，三条都在需求 4 的窗口内；580/34 起可见反向变成 2 次，600/30 已经二次振荡。`resolveTransition({ stiffness: 560, damping: 34 })` 输出 34 个采样、duration 362ms，即 SCSS 里的静态字符串；`--tx-slider-state-duration` 在 `@supports` 分支同步为 362ms，回退分支 360ms。

写法：

```scss
/* 无 linear() 的环境：无过冲 ease-out，宁可不弹也不要 bezier 假弹 */
--tx-slider-ease: cubic-bezier(0.22, 1, 0.36, 1);
--tx-slider-state-duration: 400ms;

@supports (transition-timing-function: linear(0, 1)) {
  .tx-slider {
    --tx-slider-ease: linear(0, 0.0123, ...);   /* 由 spring.ts 编译，单测锁定 */
  }
}
```

静态字符串而非运行时 `resolveTransition()`：滑块不需要按 props 变刚度，静态省掉一次 `CSS.supports` 探测和一次样式写入；漂移风险用单测堵住——测试里 stub `CSS.supports` 为 true，调 `resolveTransition({ stiffness, damping })`，断言返回的 `linear(...)` 与 SCSS 里的字符串逐字相等。`spring.ts` 的 `linearOK` 是模块级缓存，测试文件要在首次调用前完成 stub。

hover 进出**不能用这条曲线**（需求 4）：hover 只改 rim / saturate / 轨道粗细，这几项走 `--tx-slider-hover-ease: ease-out` 与更短的时长。轨道加粗（6 → 8 → 10px）沿用现状。

## 焦点环

`.is-focused:not(.is-dragging) .tx-slider__surface` 在现有 `box-shadow` 列表**末尾追加** `0 0 0 3px var(--tx-focus-ring-color)`；不能整段覆盖，否则描边和高光在焦点态消失。`--tx-slider-thumb-ring` 只在 `:not(.has-surface)` 路径继续有意义。

## 删除清单

- `@keyframes tx-slider-thumb-press`、`@keyframes tx-slider-surface-press` 及两处 `animation:` 与 reduced-motion 里对应的 `animation: none`
- `--tx-slider-thumb-blur`、`--tx-slider-thumb-opacity`、`--tx-slider-dissolve-duration`、`--tx-slider-thumb-duration` 及 `&.has-surface.is-hovering:not(.is-focused):not(.is-dragging)` 整块
- `--tx-slider-thumb-scale` 在 `.has-surface` 路径下失去意义；保留给 `:not(.has-surface)` 路径或一并简化，实现时定，但删前 grep 外部覆盖点
- `--tx-slider-press-duration`（全库无外部引用，已确认）

## 不做的事

- 不动 `useTooltipMotion` 与 tooltip 的任何参数；只核对 `y = ±28` 不与 20–22px 高的胶囊重叠。
- 不动 `refreshMetrics()`、`thumbCenterPx`、`fillWidthStyle` 的实现。
- 不引入 `TxGlassSurface`。
- 不给 slider 加新 prop；胶囊尺寸通过既有的 `--tx-slider-surface-*` 覆盖点定制。

## 回滚形状

`<style>` 块 + 一个 class 绑定（`has-surface` 已存在）的改动，无 API、无 DOM 结构变化；回滚 = 还原 `TxSlider.vue` 与测试。
