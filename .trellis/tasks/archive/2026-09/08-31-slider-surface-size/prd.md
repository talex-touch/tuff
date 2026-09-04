# slider 拖杆改为直接改尺寸（去 scale 缩放）

父任务：`08-31-tuffex-interaction-polish`

## Goal

`TxSlider` 的折射板（用户口中的"拖杆 / mask 层"）不再靠 `transform: scale()` 整体缩放来表达 rest / hover / drag 三态，改为直接改变它的真实宽高，并且不能因此引入每帧回流。

## 现状

`packages/tuffex/packages/components/src/slider/src/TxSlider.vue`

- `.tx-slider__surface` 的尺寸是固定的 `--tx-slider-surface-width: 76px` × `--tx-slider-surface-size: 34px`，圆角 `--tx-slider-surface-radius: 13px`。
- 三态只改一个 `--tx-slider-surface-scale`：rest `0.5`、hover `0.9`、drag `1.18`，落在 `transform: translate(-50%, -50%) scale(var(--tx-slider-surface-scale))` 上。
- 因为是等比缩放，**圆角和 1px 内描边（`box-shadow: inset 0 0 0 1px`）跟着一起缩放**，静止态看起来像一张被缩小的贴纸，而不是一块尺寸变小的遮罩。这正是用户说的"整体缩小"。
- `@keyframes tx-slider-surface-press`（按下回弹，460ms）同样走 `transform` 的 scale 通道。

## 需求

1. rest / hover / drag 三态用**真实宽高**表达，`transform` 只保留 `translate(-50%, -50%)` 居中职责。
2. 圆角与内描边不再随状态等比缩放。
3. 不得引入每帧的布局抖动。可接受的代价上限：状态切换时对**这一个绝对定位叶子节点**的受限布局（每次交互至多发生几次，不是每帧）。
   - 每帧写入的只有 `left`（跟手位置），这一条保持现状不动。
4. 按下回弹（`tx-slider-surface-press`）保留在 `transform: scale()` 通道上——它是 460ms 内的瞬时超调，逐帧跑在合成器上，不能改成逐帧动画宽高。
5. `--tx-slider-surface-size`（高度）作为公开覆盖点的语义必须保住，源码注释里已明确写了这一点。

## 约束

- **不能动 `refreshMetrics()` 的测量契约。** 它刻意只读 `--tx-slider-thumb-size`，并且该值在 hover/drag 间必须恒定，否则填充条和原生 thumb 会在交互中错位。折射板的尺寸不得进入这条测量路径。
- 三态数值由 CSS 自定义属性驱动，不下沉到 JS——否则公开覆盖点失效。
- 只改本任务范围。slider 的 tooltip 弹性动画、thumb 溶解逻辑均不在范围内。

## 验收标准

- [ ] `.tx-slider__surface` 的 `transform` 中不再包含 `scale(var(--tx-slider-surface-scale))`
- [ ] rest / hover / drag 三态的宽高差异来自 `width` / `height`
- [ ] 静止态与拖拽态的圆角视觉半径一致（不再等比缩放）
- [ ] 元素上有布局隔离声明（`contain`），使尺寸变化不外溢到兄弟节点
- [ ] 按下回弹动画仍然生效且结束时无跳变（末帧回到基础 transform）
- [ ] `prefers-reduced-motion: reduce` 下的既有降级仍然成立
- [ ] 新增/更新的单测断言的是**改后**的尺寸通道，不是把现状固化下来
- [ ] nexus slider 文档页的展示随之核对（见父任务文档同步约束）
