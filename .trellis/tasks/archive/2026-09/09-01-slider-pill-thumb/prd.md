# slider 拖钮改为 Radio 指示条式胶囊，按下回弹收敛

父任务：`09-01-tuffex-gallery-visual-polish`

## Goal

`TxSlider` 默认态的拖钮不再是白色圆钮 + 悬停才出现的折射板，而是**始终可见的一枚玻璃胶囊**，形态与 `TxRadioGroup type="button"` 的滑动指示条一致（用户口中的"ratio 那种感觉"）。按下 / 拖拽的放大改为一次弱过冲的弹簧过渡，删掉现有的四段关键帧弹跳。

## 现状（实测，nexus 画廊，暗色）

`packages/tuffex/packages/components/src/slider/src/TxSlider.vue`

| 状态 | 原生圆钮 | 折射板（宽 × 高 / 圆角 / 不透明度） |
|---|---|---|
| rest | 18px 白盘可见 | 38 × 17 / 13px / **0**（不可见） |
| hover | 溶解为 0 | 68.4 × 30.6 / 13px / 1 |
| drag | scale 1.16 | 89.7 × 40.1 / 13px / 1 |

- 静止态只看得到白圆钮，和用户要的"胶囊玻璃"是两个物件。
- 折射板圆角 13px 固定，在 17px 高时接近胶囊，在 40px 高时是圆角矩形，三态形状不一致。
- 按下弹跳：圆钮关键帧 `1 → 0.90 → 1.32 → 1.08 → 1.16`，摆幅 43%，速度反向 4 次；折射板 `0.61 → 1.27 → 1.0`，摆幅 67%，拖拽态盒子在 55px 到 115px 之间抖；每段各套一条 `cubic-bezier(0.22, 1.2, 0.36, 1)`，每个关键帧边界都反向一次——这就是"不丝滑"的根因。三态过渡曲线 `cubic-bezier(0.34, 1.5, 0.5, 1)` 过冲 8%，hover 进出也弹。
- Radio 指示条（参照物）实测：胶囊 `border-radius: 999px`、35 × 28、暗色下是近页面色的深灰胶囊 + 1px 发丝描边 + 极淡内高光，拖拽时 scale 1.08，弹簧由 JS rAF 驱动（drag 刚度 112 / 阻尼 9）。

## 需求

1. **默认态即胶囊。** `thumbSurface: true`（默认）时，原生 `<input type=range>` 的 thumb 只保留命中区域，视觉完全透明；`.tx-slider__surface` 在 rest / hover / drag 三态**都可见**，`border-radius: 999px`，宽高比约 2 : 1。
2. **玻璃配方对齐 Radio 指示条。** 中性玻璃（不是蓝色贴片）：半透明 `--tx-bg-color-overlay` 底、`backdrop-filter: blur() saturate()`、1px 发丝描边取 `--tx-border-color-light` 系、顶部 1px 内高光。在蓝色填充条上方时，模糊自然把填充色透上来，这是要保留的效果。亮色 / 暗色各自成立，不允许亮色下一块白贴片、暗色下一个黑洞。
3. **三态尺寸差异微弱。** rest 与 hover 同尺寸（hover 只提亮描边 / 增彩，轨道仍按现状加粗）；drag 放大不超过 10%。仍走上一任务定下的"真实宽高"通道，不回到 `transform: scale()`。
4. **按下回弹 = 一次弱过冲的弹簧过渡，不再有独立关键帧。** 删除 `@keyframes tx-slider-thumb-press` 与 `tx-slider-surface-press`。状态过渡曲线改为弹簧编译出的 CSS `linear()`（`packages/tuffex/packages/components/src/liquid/src/spring.ts` 已有编译器），要求：过冲 2%–5%、**只反向一次**、整段 ≤ 420ms；不支持 `linear()` 的环境回退到无过冲的 ease-out。hover 进出不得过冲。
5. **填充条测量契约不动。** `refreshMetrics()` 只读 `--tx-slider-thumb-size`，该值在三态间恒定；原生 thumb 的命中宽度与胶囊宽度一致，使填充条终点始终落在胶囊中心、胶囊在 0 / 100 两端不出轨道。
6. **键盘焦点环挪到胶囊上。** `.is-focused` 时在 `.tx-slider__surface` 上画 `--tx-focus-ring-color` 环；原生 thumb 已不可见，环留在它身上等于没有。
7. **`thumbSurface: false` 的扁平路径保留**：原生圆钮可见、无胶囊，命中宽度回到 18px，既有 accent ring 逻辑不变。
8. **hover 时圆钮溶解那组逻辑删除**（`--tx-slider-thumb-blur` / `--tx-slider-thumb-opacity` / `--tx-slider-dissolve-duration`），它服务的白圆钮已不存在。
9. `prefers-reduced-motion: reduce` 下所有过渡归零，既有降级结构保持。

## 约束

- 只改 `TxSlider.vue`（style + 少量 template/script）与其测试、文档；tooltip 的弹性动画、`useTooltipMotion` 不在范围内。tooltip 的 y 偏移（±28px）要实机核对不与更高的胶囊重叠。
- 三态数值继续由 CSS 自定义属性驱动，不下沉到 JS。
- 弹簧曲线以**静态字符串**写进 SCSS（`@supports (transition-timing-function: linear(0, 1))` 分支），不在运行时算；用单测把该字符串与 `spring.ts` 的编译输出锁在一起，防止两边漂移。
- 本任务**取代** `08-31-slider-surface-size` 里"按下回弹保留在 transform 通道"的那部分决定；该任务的测试 `lands the press bounce back on the base transform` 锁的是被删除的关键帧，必须一并重写，不能为绿而留。

## 验收标准

- [ ] 画廊 slider 格子静止态截图：可见一枚胶囊，无白色圆钮；胶囊 `border-radius` 计算值为 `999px`
- [ ] rest / hover 宽高相同；drag 宽高 ≤ rest × 1.10
- [ ] `TxSlider.vue` 中不再存在 `tx-slider-thumb-press` / `tx-slider-surface-press` 关键帧与 `--tx-slider-thumb-blur` / `--tx-slider-thumb-opacity`
- [ ] `--tx-slider-ease` 在 `@supports` 分支下是 `linear(...)`，其采样序列与 `resolveTransition({ stiffness, damping })` 的输出一致（单测锁定）；回退分支为无过冲 bezier
- [ ] 用 `spring.ts` 的模拟器验证所选刚度 / 阻尼：过冲 2%–5%、速度反向 1 次、settle ≤ 420ms（数值记入 design.md）
- [ ] 原生 thumb 命中宽度 = 胶囊宽度；`thumbSurface: false` 时回到 18px（`refreshMetrics()` 读到的值随 class 切换）
- [ ] `.is-focused` 时胶囊上有焦点环（实机 Tab 到滑块截图）
- [ ] 亮色 + 暗色实机截图，与 Radio 格子并排：胶囊质感一致（发丝描边、内高光、模糊透色）
- [ ] `prefers-reduced-motion: reduce` 下三态切换无过渡
- [ ] 单测：新增用例在改动前跑红；重写而非删除 08-31 的回弹用例
- [ ] nexus `slider.{zh,en}.mdc` 同步：`thumbSurface` 描述、交互契约里的胶囊 / 焦点环、审阅说明的实测覆盖；5 个 slider demo 实机过一遍
