# Design — slider 拖杆改为直接改尺寸

## 两条通道分工

关键判断：折射板有两类尺寸变化，频率差两个数量级，必须走不同通道。

| 变化 | 频率 | 通道 | 理由 |
|---|---|---|---|
| rest / hover / drag 三态 | 一次交互至多几次 | **真实 `width` / `height`**，CSS transition | 圆角与内描边不再被等比缩放，这正是需求 |
| 按下回弹 `tx-slider-surface-press` | 460ms 内逐帧 | **保留 `transform: scale()`** | 逐帧动画宽高 = 逐帧布局，正是用户担心的"很卡" |
| 跟手位置 `left` | 每帧 | 维持现状不动 | 已在用，不在本任务范围 |

## 为什么状态尺寸走 CSS 变量而不是 JS 计算

- `--tx-slider-surface-size` 在源码注释里被写明是**公开覆盖点**（"it is a public override point, so it keeps its meaning"）。数值下沉到 JS 就等于废掉这个覆盖点。
- CSS transition 完全不经过主线程 JS，比 rAF 驱动更省。
- 用户提到的"缓存的函数"对应的是组件里的 `refreshMetrics()`——它把 `getComputedStyle` 的读取缓存到 `mainWidth` / `thumbSizePx`，避免每帧回流。这条**恰恰是不能碰的**：注释写明它只读几何 thumb 尺寸，且该值必须在 hover/drag 间恒定，否则填充条与原生 thumb 会错位。所以折射板尺寸绝不能进这条测量路径；纯 CSS 方案天然满足这一点。

## 回流控制

`.tx-slider__surface` 是 `position: absolute` + `pointer-events: none` 的**无子节点叶子**，脱离常规流，改尺寸不影响兄弟节点布局。再加上：

```scss
contain: layout size;
```

把布局作用域锁死在这个元素内部。`contain: size` 要求显式尺寸——本元素本来就有显式 `width` / `height`，条件满足。

代价上限因此是：每次状态切换，260ms transition 内对**一个**受限叶子节点的布局，约十几帧。相比之下每帧写 `left` 的既有成本更高，且那条不动。

## 变量布局

三态各自持有宽/高，圆角独立成一档（不再被 scale 隐式带走）：

```
--tx-slider-surface-width   /* 基准宽 */
--tx-slider-surface-size    /* 基准高，公开覆盖点，语义不变 */
--tx-slider-surface-radius
```

三态通过覆盖上述变量表达，`--tx-slider-surface-scale` 从 transform 里退出。是否保留该变量名（改为只服务按下回弹）在实现时定，但**若删除必须确认没有外部覆盖点依赖它**。

## 不做的事

- 不动 `refreshMetrics()` 的测量契约。
- 不动 thumb 的溶解逻辑（`--tx-slider-thumb-scale` / `blur` / `opacity` 那一组）。
- 不动 slider tooltip 的弹性动画。
- 不动 `prefers-reduced-motion` 既有降级的结构，只确认它仍然成立。

## 回滚形状

纯样式改动，回滚 = 还原 `<style>` 块。无 API、无 DOM 结构变化。
