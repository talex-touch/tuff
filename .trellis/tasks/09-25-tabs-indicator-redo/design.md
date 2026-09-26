# Design — TxTabs 指示器重做

## 结构（保留的 DOM 与类名）

```
.tx-tabs.tx-tabs--{placement}.tx-tabs--indicator-{variant}.tx-tabs--motion-{motion} …（根上状态类全部保留）
  .tx-tabs__nav > .tx-tabs__nav-bar > .tx-tabs__nav-inner[role=tablist]
      TxTabItem × n
      .tx-tabs__pointer            ← 引擎写 transform / width / height / opacity（命令式）
        .tx-tabs__pointer-inner    ← 画面层（各变体的底色 / ring / 光晕都画在这里）
```

`tx-tabs__pointer--motion-*` / `tx-tabs__pointer--glow` 两组关键帧类与 `@keyframes tx-tabs-pointer-*` 删除（research §1.4 确认没有外部依赖）。

## 引擎接入

- `useJellyIndicator({ axis, elastic, stiffness, damping, deform, maxGrowth, onFrame })`，`axis = isVertical ? 'y' : 'x'`。
- `applyPointerFor(el, { animate })` 只负责**测量**：算出该变体的目标矩形（nav-inner 坐标，含 `scrollLeft/scrollTop`），调 `engine.moveTo(rect, { animate })`。原来直接写 style、播放关键帧、`lastPointerPosition` 方向判断的代码删除。测量补上缩放归一化（`navInner` 的 rect 宽 / `offsetWidth`，与 `useIndicatorBox` 同法）：research §0.1-7 在祖先带 transform 时量到过 2 倍坐标。
- `onFrame(frame)` 写 `.tx-tabs__pointer` 的 `opacity`（`frame.visible && indicatorRevealed`）、`width`、`height`、`transform: translate3d(x, y, 0) scale(sx, sy)`，并在 `frame.moving` 变化时切换 `.tx-tabs__pointer-inner.is-moving`（光晕在行进中隐去、落定后淡入）。
- 渲染函数不读取引擎的任何 ref，指示器动画期间 TxTabs 不重渲染（`renderTabs()` 会重新求值插槽，不能每帧跑）。
- 调用点语义：点击 / 键盘 / `v-model` 变更 → `animate: animationIndicator.enabled`；`ResizeObserver`、首次测量、`showIndicator` 切换 → `animate: false`。**键盘路径现在根本不调用 `applyPointerFor`**（`handleTablistKeydown` 只 `setActive`，指示器是被 ResizeObserver 带过去的，research §0.1-5），要在 `setActive` 后显式调用。
- 揭示语义保持（测试 `:124–125`、`:163–164`、`:441–474` 锁定）：点击即揭示；prop 驱动在量到非零尺寸前不揭示；未揭示时 `.tx-tabs__pointer` 行内 `opacity: 0`，揭示后 `1`。首次落位由引擎直接放到目标（现在实测会从 nav-inner 左上角滑入、`v-model` 实例还会播一次关键帧，research §0.1-2/3），只保留 `opacity` 淡入。
- 根上的 `--tx-tabs-indicator-duration/-easing/-strength` 继续输出（测试与文档自定义表都引用；`durationMs` 还是 `animation.content.durationRatio` 的基数）。

## 各变体目标矩形

记 `L/T/W/H` 为激活项相对 nav-inner 的盒子，`pl/pr/pt/pb` 为项的 padding（`getComputedStyle` 读取），`off = props.offset`。

| 变体 | 水平（top / bottom） | 竖直（left / right） | transform-origin |
| --- | --- | --- | --- |
| `line`（2px） | x = L + pl + off，w = W − pl − pr；y = bottom ? 0 : navH − 2 | x = right ? navW − 2 : 0；y = T + pt + off，h = H − pt − pb | 贴分隔线的那条边（top 放置为 `center bottom` …） |
| `dot`（6px） | x = L + W/2 − 3 + off；y = bottom ? 4 : navH − 10 | x = right ? navW − 10 : 4；y = T + H/2 − 3 + off | center |
| `pill` / `block` / `outline` | 项盒子 L/T/W/H | 项盒子 | center |

**线要贴在分隔线上**：水平放置时 nav-inner 在 `.tx-tabs__nav-bar` 里垂直居中（`TxTabs.vue:946–950`），bar 被 `nav-right` 内容或消费方 `min-height`（PluginFeatureDetailCard 64px）撑高时，nav-inner 底边离分隔线还有一段。改为 top / bottom 下 `.tx-tabs__nav-inner { align-self: stretch }`（项仍在 nav-inner 内垂直居中，`nav-extra` 不受影响），nav-inner 的底边即 nav 的 1px 分隔线上沿，`line` 就压在分隔线上。项的 padding 用 `getComputedStyle` 读（LingPan、TemplateResearch、TemplateSettings、TemplateShellConsole 都覆写过项的 margin / padding，research §1.4）。

## 画面（亮 / 暗都只用 token）

| 变体 | `.tx-tabs__pointer-inner` |
| --- | --- |
| `line` / `dot` | `background: var(--tx-color-primary)`，圆角 999px；落定后 `::before` 主色柔光（沿用现有光晕，改由 `.is-moving` 控制显隐） |
| `pill` | `background: var(--tx-surface-raised, var(--tx-bg-color-overlay))` + `box-shadow: var(--tx-elevation-1), inset 0 0 0 1px var(--tx-border-color-lighter)`，圆角 = 项圆角（10px） |
| `block` | `background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent)`，无阴影 |
| `outline` | 透明底 + `box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--tx-color-primary) 60%, transparent)` |

激活项：`showIndicator` 为真时所有变体都把 `--fake-color` 清成透明（hover 也不再给激活项上底色）；文字 `--tx-text-color-primary`，非激活文字 `--tx-text-color-regular`（设计规范：13px 文字静止色用 regular）；只改颜色不改字重——加粗的标签更宽，切换时会挤动邻居。墨色通过项上的变量切换，宿主对 `.tx-tab-item__name` 的单类覆盖仍然生效。图标：激活时 `line / dot / block / outline` 着主色，`pill` 用主文字色。

## `indicatorMotion` → 引擎参数

基准弹簧 `jellySpring(animation.indicator.durationMs)`（默认 350ms = Radio 的 110 / 12）。

| motion | 刚度 | 阻尼 | deform | 手感 |
| --- | --- | --- | --- | --- |
| `stretch`（默认） | ×1 | ×1 | 1 | 与 Radio 同一种果冻 |
| `spring` | ×1 | ×0.72 | 1 | 更 Q、回弹多一次 |
| `warp` | ×1 | ×1 | 1.35 | 形变更夸张 |
| `glide` | ×1 | ×1.45 | 0.55 | 几乎不越过，轻形变 |
| `snap` | ×2.25 | ×1.9 | 0.6 | 快、利落 |

`indicatorMotionStrength` 乘到 deform 上（0 = 只移动不形变）。系数是初值，按浏览器录帧微调后写回本表。`maxGrowth`：水平 16px；竖直的整行高亮（pill / block / outline）6px，避免横向鼓起冲进内容区。

## reduced-motion

引擎负责（直接落位、恒等形变）；CSS 里指示器只剩 `opacity` 过渡，`@media (prefers-reduced-motion: reduce)` 下也去掉。

## TxTabItem 图标

`.tx-tab-item__icon` 改为 `display: inline-flex; align-items: center; justify-content: center`，图标成为 flex 项后宽高生效（与 TabBar 的做法一致），不依赖宿主图标 CSS 带不带 `display`。

## 画廊 Tabs 格子

画廊里没有"格内切换 specimen 变体"的先例（research §6：现有的是并排小标题、纵向堆叠、自驱动循环、格内按钮），这是新写法：格内上方一行 `TxFlatRadio size="sm"`（Line / Pill / Block / Outline / Dot）切换变体——它本身也是果冻家族成员，一格里同时看到两种指示器；下方 `TxTabs placement="top"` 三个带图标的标签页，内容一句话说明当前变体。状态放在画廊 ref（reset 只重挂载插槽，见 docs-sync 规范）；`:activation="true"` 注释保留。格子高度按 `.docs-gallery__tabs` 调整到不溢出 stage。

## 兼容性

- `pill` 从"粗线"改为"凸起面"。使用者：线上商店详情页 `pages/store.vue:595`（top；它用 `defineAsyncComponent` 包了 `TxTabItem`，名字不在白名单里，tab 条可能本来就是空的——抽查前先确认，不在本任务修）、`ComponentsNavigationShellDemo`（left，嵌在 tabs / drawer / dropdown-menu / popover / tuffex-composition 五个页面）、`TemplateStoreDemo`（top），以及上述页面里 `placement="left"` 的代码片段（不含行为描述）。竖向 pill 变成整项的凸起面，读起来就是侧栏选中态。文档注明语义变化；运行时仍接受该值。
- `animation.indicator.easing` 对弹簧行进无效，文档注明；`durationMs` 通过时长缩放继续生效。
- 外部没有样式或脚本命中 `.tx-tabs__pointer*`、motion / glow 类、`tx-tabs--indicator-*` / `--motion-*`（research §1.4），这些内部类与关键帧可以删除，根类照常输出（测试断言）。
- 激活项去底色后：TemplateShellConsole 手写的 `--fake-color: transparent` 变冗余但无害；LingPan 自己画了 `border-bottom` 下划线，默认 `line` 指示器又画一条——这是现状就有的重复，不在本任务修，记录在任务说明里；PluginInfo（`showIndicator=false`）保留激活底色。
- 文档波及：`filter-chips.{en,zh}.mdc:150`（"TxTabs 的指示器是 900 行组件里的内联实现"）在迁到共享引擎后失真，一并改写；`tab-bar.{en,zh}.mdc:82` 的"同名同族"说法在 `pill` 统一后成立，核对措辞。

## 修订：滑行材质（2026-09-26）

- 上文「引擎接入」与「`indicatorMotion` → 引擎参数」两节写的是果冻方案，已被替换：评审认为果冻"不够丝滑、简单"（相位突变加饱和拉伸，pill 途中变成高胶囊）。
- TxTabs 改为 `useJellyIndicator({ material: 'glide', integrate: springSteps, glide: () => motionGlide, bounds })`，不再传 `elastic` / `stiffness` / `damping` / `deform` / `maxGrowth`。
- `indicatorMotion` → `MOTION_GLIDE`（领先端刚度 / 阻尼 / lag）：stretch 420/38/0.45，spring 420/24/0.3，warp 420/38/0.7，glide 380/38/0，snap 720/50/0.25；按 `animation.indicator.durationMs`（基准 350）做 `timeScaleSpring`；`indicatorMotionStrength` 乘到 lag 上（引擎夹到 0.85）。
- 墙：tablist 沿行进方向的完整可滚动范围 `[0, scrollWidth | scrollHeight]`，不再内收 `maxGrowth / 2`。
- 实测（jsdom 打桩，60px `line` 走 100px）：stretch 最长约 74px、约 0.45s 停稳；warp 约 84px；spring 越过落点一次、约 9px；snap 最先停稳（约 0.32s）；glide 始终 60px。主会话浏览器实测（:3200）：pill x 16→207 连续，宽度 89→100→62，缩放恒为 1，约 0.45s 停稳。
- 测试与文档随之改写：`tabs.test.ts` 中行进、各 motion、时长、强度、墙的用例改为滑行断言（仍为 48 例）；`tabs.{zh,en}.mdc` 的 motion 表、强度说明、概述与技术实现（含同日变更记录与被否的果冻方案）已更新。
