# Design — progress-bar 重设计

## 层次：三层变两层

现状 DOM：`wrapper > track(overflow hidden, ::after 描边) > [mask, bar, indicator, text]`。默认渲染四个节点外加一个 backdrop-filter 合成层，只为画一条 5px 的线。

改后默认：`wrapper > [head?, track > bar, glow?, outside-text?]`。

- `__mask` 只在 `maskBackground !== 'none'` 时渲染（`v-if`）。它的三种配方（blur / glass / mask）原样保留给 opt-in。
- 轨道底色直接写在 `__track` 上：`background: color-mix(in srgb, var(--tx-text-color-primary) 10%, transparent)`。用文字色系而不是 `--tx-bg-color-overlay`，理由与 `TxSlider` 轨道注释一致：文字色是真正跨主题反转的那组 token，亮色下是浅灰、暗色下是浅一档的深灰，不会变成"页面上的一个洞"。
- `::after` 描边只在 `maskVariant: 'solid' | 'dashed'` 下存在；`plain`（新默认）不生成。

## 填充：渐变 + 轨道外光晕

```scss
.tx-progress-bar {
  background: var(--tx-progress-fill);
}
```

`--tx-progress-fill` 在 script 里算：

- `color` 含 `gradient(` → 原样（nexus storage.vue 的两条渐变）。
- 否则 → `linear-gradient(90deg, color-mix(in srgb, ${c} 58%, transparent), ${c})`。起点淡、前端饱和，就是参考图那条。`c` 可以是 `var(--tx-color-primary, …)`，`color-mix` 接受 var。

`--tx-progress-shadow-color` 与那条被裁掉的 `box-shadow: 0 10px 24px` 一起删除；`hoverEffect: 'glow'` 也在轨道内被裁，本任务只加注释说明，不重做（PRD 7）。

光晕不能画在 bar 上：`__track` 是 `overflow: hidden`，任何超出 5px 的东西都没了。所以：

```html
<span v-if="showGlow" class="tx-progress-bar__glow" :style="{ left: `var(--tx-progress-width)` }" aria-hidden="true" />
```

挂在 wrapper（`overflow: visible`）上，`transform: translate(-50%, -50%)`，`width: 22px; height: 14px`，`background: radial-gradient(closest-side, color-mix(in srgb, <c> 42%, transparent), transparent)`；`transition: left` 与 bar 的 `width` 同时长同曲线，两者同源于 `--tx-progress-width`，不会错位。`showGlow = 0 < pct < 100 && !indeterminate && !hasSegments`。分段模式的前端是最后一段的颜色，光晕取 `fillColor` 会错色，直接不显示。

`left` 是布局属性，但它只在**值变化时**写一次，与 bar 的 `width` 同频，不是逐帧动画；接受。

## 时长与曲线

`--tx-ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)` 已在 `variables.scss`。bar `width` 与 glow `left` 都用 `480ms var(--tx-ease-out-strong)`。上传类每 100ms 上报一次，480ms 会把离散台阶抹成连续推进；`complete` 事件语义不受影响（它看的是 resolvedPercentage，不看动画）。

## 不确定态：全部搬到 transform

每个 `::before` 的宽度固定，位置用 `translateX` 以自身宽度为单位表达：

| 变体 | 现状 | 改后 |
|---|---|---|
| sweep（默认） | `left -100%→100%`，`width 0→50%→100%` | `width: 40%`；`translateX(-100%) → translateX(250%)`（40% × 2.5 = 100%，扫完整条） |
| classic | `left -100%→100%`，宽 52% | `translateX(-100%) → translateX(192.3%)` |
| bounce | `left 0→72%→0`，宽 28% | `translateX(0) → translateX(257%) → translateX(0)` |
| elastic | `left` + `scaleX` | `translateX` + `scaleX`（`transform-origin` 保持 `center`） |
| split | 已是 `scaleX` + opacity，`left:0;width:100%` 静态 | 不变 |

`translateX` 百分比相对元素自身宽度，所以系数 = 目标位移 / 自身宽。sweep 原本还会在途中变宽（0 → 50% → 100%），改后固定 40%；观感差异是扫光不再"拉长"，可接受，PRD 4 明确不重新设计变体。

## 顶部文案行

```html
<span v-if="showTopText" class="tx-progress-bar__head">
  <span class="tx-progress-bar__head-label">{{ displayText }}</span>
  <span v-if="detail" class="tx-progress-bar__head-detail">{{ detail }}</span>
</span>
```

- wrapper 在 `top` 下 `display: flex; flex-direction: column; gap: 6px`。
- label 颜色 = `var(--tx-progress-color)`（与填充同色，参考图的 "Uploading 65%" 是蓝的）；detail 颜色 `--tx-text-color-secondary`，`::before { content: '•'; margin: 0 6px }`。
- `showTopText` 与 `showOutsideText` 同规则：`textPlacement === 'top' && (message || showText)`；indeterminate 下只在有 `message` 时显示。
- 参考图那种 "Uploading 65%" 用既有 `format` 组合：`:format="p => \`Uploading ${p}%\`"`，不新增 prop。`detail` 是唯一新 prop（`string`，可选），只在 `top` 下有意义，其它放置下忽略并在 types 注释里写明。
- a11y：`detail` 是可见文本，不进 `aria-label`；progressbar 的可访问名仍是 `ariaLabel || message || 'Progress'`。

`TxTooltip` 包裹与非包裹两份模板目前是复制粘贴的；新增的 head / glow 两处都要各写一遍。**不在本任务里合并这两份模板**（范围纪律），但在收尾报告里记一笔。

## 实现偏差（2026-09-02，已接受）

1. **光晕挂在 `.tx-progress-bar__body` 上，不直接挂 wrapper。** 百分比 `left` 相对包含块解析；`textPlacement="outside"` 下 wrapper 比轨道宽出 label + gap，挂 wrapper 的光晕会跑到填充前端之前。`__body` 恰好与轨道同宽（`outside` 下 `flex: 1; min-width: 0`），实机测得光晕中心与填充前端 x 相等（160.8 == 160.8）。测试断言的是这层包含关系。
2. **`color` 为渐变字符串时不挂光晕。** `color-mix(in srgb, linear-gradient(…) 42%, transparent)` 不是合法 CSS，没有单一色相可取；nexus `storage.vue` 的两条渐变进度条因此没有光晕，属预期。
3. **光晕常驻挂载、只切换可见性**（0% / 100% 时 `opacity: 0` 而非卸载）：卸载再挂载的节点会在填充仍在过渡时直接出现在目标位置，与前端脱节；常驻节点的 `left` 与填充的 `width` 共享同一条 480ms 时间线。

## TxProgress wrapper

只删一行 `mask-background="mask"`；`mask-variant="plain"` 保留（它已是新默认，留着不影响）。它传 `text-placement="outside"`，与 `top` 无关。

## 回滚形状

样式 + 模板 + 一个新 prop + 两个枚举值。回滚 = 还原 4 个源文件；无数据库、无存储、无跨进程契约。
