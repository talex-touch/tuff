# 研究：指示器家族（TabBar / FlatRadio / SidebarNav）接入 Radio 果冻引擎前的现状

- **Query**：要把 Radio 按钮组的弹簧 + 果冻指示器（`radio-group-indicator.ts`，形变来自 `utils/animation/jelly.ts`）抽成共享引擎，再让 `TxTabBar`、`TxFlatRadio`、`TxSidebarNav` 用它驱动滑动指示器。本文逐个记录：测量与定位、绘制、过渡、首帧不滑入、减弱动效、悬停、拖拽、键盘；公开 API 与 CSS 变量；哪些测试断言锁住了指示器，以及改成 rAF 每帧写 transform / 尺寸（外加形变用的 `scale()`）之后哪些会失败；各处调用方；Nexus 文档中需要跟着改的段落；Radio 指示器本身的结构与测试；减弱动效 helper 与全局约束。最后列出共享引擎 API 的设计约束。
- **Scope**：内部代码（另外在 `/private/tmp/indicator-probe` 用 tuffex 自带的 vitest 跑了只读的 jsdom 探针，没有改动仓库文件）
- **Date**：2026-09-25
- 路径缩写：`TX` = `packages/tuffex/packages`，`C` = `packages/tuffex/packages/components/src`，`DEMOS` = `apps/nexus/app/components/content/demos`，`DOCS` = `apps/nexus/content/docs/dev/components`
- 基线：`node node_modules/vitest/vitest.mjs run`（在 `packages/tuffex` 下）跑 tab-bar / flat-radio / sidebar-nav / radio / slider / segmented-slider / fine-tune-card / context-cards-motion / jelly / shadow-light-source，12 个文件共 149 个用例，全部通过（2026-09-25 23:42）。

---

## 0. 速览

1. **目前是三套 CSS 过渡加一套 rAF 弹簧。** TabBar、FlatRadio、SidebarNav 的路径都是「测量 → 响应式 `:style` → CSS `transition`」。只有 Radio（`type="button"`）走 rAF 弹簧、`jellyScale` 形变和拖拽。
2. **测量方式不统一。** TabBar 和 SidebarNav 用 `TX/utils/use-indicator-box.ts`。**FlatRadio 没有用它**，而是自带 `readGeometry()`：数学相同，但只算 x / width，而且只观察容器。Radio 自己 `querySelector('.is-checked')`，不做缩放归一化，靠 `window.resize` 重测，不用 ResizeObserver。注意 `use-indicator-box.ts:40-41` 和 `C/sidebar-nav/index.ts:32-33` 的注释都说 FlatRadio 共用它，和代码对不上。
3. **写进样式的几何属性也各不相同。** Radio 写 `translate3d(x,y,0)`、`width`、`height`，再加 `scale()`。TabBar 写 `translate()` 或 `translateX()` 加 `width`（有时带 `height`）。FlatRadio 写 `translateX()` 加 `width`，top / height 交给 CSS。SidebarNav 写的是 **`top` 和 `height`**，不是 transform；left / right 由 CSS 固定为 0。
4. **`jellyScale` 的拉伸方向是写死的**：x 变窄、y 变高，和行进方向无关；只有落地挤压带 `impactAxis`。探针实测：28px 胶囊在一次切换的前 170ms 峰值为 `scale(0.904, 1.557)`（见 §5.6）。
5. **改成 rAF 之后必然要改的测试**：
   - `flat-radio.test.ts` 的三条：「transform 与 width 共用同一条过渡」「源码里有 `getBoundingClientRect()`」「源码里有 reduced-motion 的 media 块」；
   - `sidebar-nav.test.ts` 断言的 `top: 84px` 和 `top: 28px`；
   - `radio-group-indicator.test.ts` 断言的 `translate3d(55px, 3px, 0)`；
   - `slider.test.ts` 从 `TxRadioGroup.vue?raw` 读取的 `.tx-radio-group__indicator-plain {` 配方。

   `tab-bar.test.ts` 基本不锁指示器样式。
6. **消费方里唯一覆盖指示器内部样式的是 `C/fine-tune-card/src/TxFineTuneCard.vue:341-357`（覆写在 341-350，减弱动效在 352-357）。** 它重写了 `transition: transform 0.3s / width 0.3s`，特异度 0,3,0。一旦改成 rAF 每帧写 transform，这条过渡会把每一帧的写入再过渡一遍。
7. **单测环境默认不开减弱动效。** `packages/tuffex/vitest.setup.ts:10` 的 matchMedia 桩对所有查询都返回 `matches: false`（第 2 行注释说默认命中 reduced-motion，与代码相反），所以单测里弹簧默认会跑起来。

---

## 1. 现有的共享件

### 1.1 `TX/utils/use-indicator-box.ts`（136 行）

| 项 | 内容 |
|---|---|
| 签名 | `useIndicatorBox({ container: Ref<HTMLElement\|null\|undefined>, target: () => HTMLElement\|null\|undefined })`，返回 `{ box: Readonly<Ref<IndicatorBox\|null>>, revealed: Readonly<Ref<boolean>>, measure }`（6-33） |
| `measure()`（67-90） | 容器或目标缺失时置 `box = null`、`revealed = false`（70-74）。否则取两个 rect 的差，用 `containerRect.width / container.offsetWidth` 归一化祖先 transform 或缩放（81-82），再减去 `clientLeft` / `clientTop`，换算成 padding-box 原点（85-86）；宽高同样除以缩放比（87-88） |
| 观察（92-108） | 同一个 ResizeObserver 观察容器和当前目标，目标切换时 unobserve 旧目标。RO 回调只调用 `measure()`，不会去置 `revealed` |
| 触发（110-123） | `watch([container, () => target()], …, { flush: 'post', immediate: true })`：先 measure、再 observe，拿到 box 后才置 `revealed = true`（115-118）。`target` 读的是非响应式 Map，只有 getter 里读到的响应式源变化时才会重跑 |
| 时序（探针） | immediate 那次在 setup 期间执行，此时容器为 null，box 为 null。挂载后那次在 `mount()` 返回后的**下一个微任务**里执行，所以 `mount()` 刚返回时 TabBar 的指示器还不存在，一个微任务后才出现 |
| 导出 | `TX/utils/index.ts:9`，对应 `@talex-touch/tuffex/utils` 和根入口；`C/sidebar-nav/index.ts:34-35`，对应 `@talex-touch/tuffex/sidebar-nav` 和根入口 |
| 仓库内调用方 | `C/tab-bar/src/TxTabBar.vue:90`、`C/sidebar-nav/src/TxSidebarNav.vue:95`、`DEMOS/TemplateDocsDemo.vue:22,1201-1210`（把 top / height 写成 `translateY()` / `height`，1117 行手动调用 `measureIndicator()`，自带 `.docs-outline__marker.is-revealed` 过渡在 2555-2559，减弱动效在 2764-2772），以及文档 `DOCS/template-docs.{en,zh}.mdc:20,45-46` |

### 1.2 `TX/utils/animation/jelly.ts`（108 行）

- `JELLY` 常量表（42-70）。弹簧：`stiffness 110`、`damping 12`。按住：`heldScale 1.08`、`heldStretchBoost 1.8`。相位：`emergeScale 1.08`、`emergeMs 110`、`sinkScale 0.97`、`sinkMs 32`。衰减：`velocityDecay 6`、`impactDecayHeld 7.4`、`impactDecayFree 4`。反向落地：`reversalSpeed 30`、`reversalImpactScale 300`。撞边：`edgeSpeed 520`、`edgeImpact 0.92`。松手：`releaseKick 0.14`。静止判定：`settleDistance 0.25`、`settleSpeed 8`。
- `jellyScale(input)`（79-108）是一个纯函数：
  - **拉伸**：`elastic && moving && speed > 3` 时，`stretch = min(speed/100, 0.6) × dragBoost`，结果为 `sx = 1 − 0.35·stretch`、`sy = 1 + 0.6·stretch`（83-88）。**没有「行进轴」这个输入。**
  - **落地挤压**：`impact > 0.01` 时按 `impactAxis` 沿该轴展宽、另一轴变窄（90-101）。
  - **整体缩放**：`baseScale × phaseScale`，关掉 elastic 时相位缩放也一并去掉；结果夹在 [0, 2]（103-107）。
- 导出位置：`TX/utils/index.ts:4`，即根入口与 `/utils`，属于公开 API。
- 调用方：`C/radio/src/radio-group-indicator.ts:4`、`C/slider/src/use-thumb-jelly.ts:2`、`C/slider/__tests__/slider.test.ts:4`。
- 锁定测试：`TX/utils/__tests__/jelly.test.ts:10-69` 按 2026-09 的数值逐条钉住上述算术。改任何一个常量，这里都会失败（`slider.test.ts:538-539` 也断言按住时缩放 ≈ `JELLY.heldScale`）。

---

## 2. TxTabBar（`C/tab-bar/src/TxTabBar.vue`，330 行）

### 2.1 测量与定位
- 容器是 `innerRef`（`.tx-tab-bar__inner`，150），CSS 为 `position: relative` 的 grid，`grid-auto-columns: 1fr`，因此各项等宽（205-212）。
- 目标从非响应式 `Map<value, HTMLElement>` 里取（`itemMap`，79-88，由函数 ref `setItemRef` 填充，161）。`useIndicatorBox({ container: innerRef, target: () => itemMap.get(props.modelValue) })`（90-93）。
- 各变体的样式计算（`indicatorStyle`，99-133）：
  - box 为 null 时：`{ opacity: '0' }`（101-102）；
  - `line`：`transform: translateX(left)` + `width`（108-113）。竖直位置由 CSS `top: 0` 固定，高 2px；
  - `dot`：`translate(left + (width−6)/2, top + height − 6 − 6)`，宽高固定 6px（`DOT_SIZE`，97、115-121）；
  - `pill` / `block`：`translate(left+insetX, top+insetY)`，宽高各减两倍内缩（128-132）。内缩是按尺寸档查表得到的算术，不是 CSS margin：sm 为 6/4，md 为 8/6，lg 为 10/7（54-61）。
- 所有变体共用同一个 x，所以切换变体只改外观、不改位置（104-105 的注释）。

### 2.2 绘制
- 节点：`<span v-if="showIndicator" class="tx-tab-bar__indicator" :class="[`is-${indicator}`, { 'no-transition': !revealed }]" aria-hidden>`（151-157）。`showIndicator = indicator !== 'none' && box != null`（95）。
- 公共 CSS（217-232）：`position: absolute; top: 0; left: 0; pointer-events: none; z-index: 0; will-change: transform, width`（223）；各项 `z-index: 1`（271）。
- 变体外观：
  - `is-pill`：圆角 `var(--tx-tab-bar-pill-radius, 14px)`，底色 `var(--tx-surface-raised, #fff)`，阴影 `var(--tx-elevation-1, …)`（236-241）；
  - `is-block`：同一个方框，改用 12% 的 primary 色块（245-249）；
  - `is-line`：高 2px，primary 色，全圆角（251-255）；
  - `is-dot`：primary 色圆点（257-260）。
- 根节点上的行内 CSS 变量（`rootStyle`，63-73）：`--tx-tab-bar-z-index`、`--tx-tab-bar-height`、`--tx-tab-bar-icon-size`、`--tx-tab-bar-label-size`、`--tx-tab-bar-item-gap`、`--tx-tab-bar-pill-radius`。

### 2.3 过渡、首帧与减弱动效
- 过渡（225-228）：`transform` 和 `width` 共用 `var(--tx-tab-bar-indicator-duration, 0.26s) var(--tx-tab-bar-indicator-ease, cubic-bezier(0.32, 1.28, 0.5, 1))`，另有 `opacity 0.15s ease`。**`height` 不在过渡列表里**，所以换尺寸档时高度会直接跳变。
- `.no-transition { transition: none !important }`（230-232）绑定在 `!revealed` 上。但 `revealed` 是在首次拿到 box 的同一个回调里置 true 的（`use-indicator-box.ts:115-118`），而元素又以 `box != null` 为 `v-if` 条件，所以**实际渲染出来的指示器从来不带 `no-transition`**。探针依次试了：目标缺失 → 出现 → 再缺失 → 再出现，全程都没有这个类。首帧之所以不会滑入，靠的是元素直接在终点被插入。
- 减弱动效（263-267）：`transition: opacity 0.15s ease`，去掉位移，保留淡入。
- 重测的时机：ResizeObserver 或目标变化时重算 box。只要已 revealed，这类重测同样会走 CSS 过渡。

### 2.4 悬停、拖拽、键盘
- 没有悬停指示器，`.tx-tab-bar__item` 也没有任何 `:hover` 规则（269-291）。**没有拖拽。**
- 键盘只靠原生 `<button>` 的 Tab / Enter / Space，没有方向键。根节点是 `nav` 地标，不是 tablist；当前项带 `aria-current="page"`（166）。

### 2.5 公开 API（需要保持兼容）
- Props 用**运行时对象**声明（17-26，9-16 的注释说明了原因：type-only 声明在 dev server 里会过期）：`modelValue`、`items`、`fixed=true`、`safeAreaBottom=true`、`disabled=false`、`zIndex=2000`、`indicator='pill'`（取值 `'none'|'pill'|'line'|'block'|'dot'`）、`size='md'`（取值 `'sm'|'md'|'lg'`）。
- Emits：`update:modelValue` 和 `change`（`types.ts:40-43`；30-36）。没有 slot，也没有 expose。
- 导出：`C/tab-bar/index.ts` 导出 `TabBar`、`TxTabBar`，以及 `TabBarEmits`、`TabBarItem`、`TabBarProps`、`TabBarValue`、`TxTabBarInstance`。`TabBarIndicator` 和 `TabBarSize` 只在 `types.ts:19,27` 里导出，**没有经 index 再导出**。
- 可被调用方覆盖的 CSS 变量：`--tx-tab-bar-indicator-duration`、`--tx-tab-bar-indicator-ease`、`--tx-tab-bar-pill-radius`、`--tx-tab-bar-height` 等。仓库里没有任何调用方覆盖过前两个，文档里也没有记载（见 §7.1 的 grep 结果）。

### 2.6 测试（`C/tab-bar/__tests__/tab-bar.test.ts`，140 行）
| 用例 | 断言 | rAF + scale 化后 |
|---|---|---|
| 12-40 语义 | nav 无 role、`aria-current`、徽标、根上的 `--tx-tab-bar-z-index` | 不受影响 |
| 101-119 尺寸 | 根 style 里有 `--tx-tab-bar-height` 和 `--tx-tab-bar-icon-size`，未知尺寸回退到 md | 不受影响 |
| 121-131 变体类 | `if (el.exists())` 成立时才断言有 `is-${indicator}`，否则只断言根存在 | 现在是同步断言，指示器还没渲染（探针已确认），实际只走 else 分支。**只有当元素在同步阶段就渲染出来时（比如去掉 v-if），类名断言才会真正生效** |
| 133-139 `none` | `.tx-tab-bar__indicator` 不存在 | 如果引擎在 `none` 时也渲染节点，这条会失败 |

其余用例都不涉及指示器的 transform、width 或过渡。

---

## 3. TxFlatRadio（`C/flat-radio/src/TxFlatRadio.vue`，415 行；`TxFlatRadioItem.vue`，182 行）

### 3.1 测量与定位
- 子项注册：`TxFlatRadioItem` 在 `onMounted` 里通过 inject 调用 `registerItem(value, el)`（Item 43-47），卸载时 unregister（49-51）。父组件用 `itemMap` 加 `orderedValues` 维护顺序（22-52）。注册和注销都会触发 `updateIndicatorNoTransition()`（45、51）。
- `readGeometry(el, root)`（120-138）：带小数的 rect；`ratio = root 宽 / offsetWidth`，用于归一化缩放；减去 `clientLeft`。**只返回 `{ left, width }`**，与 `useIndicatorBox` 同样的数学，但它是独立实现。
- `updateIndicator(animate)`（140-161）：
  - `multiple` 模式或找不到当前项时只把 opacity 设成 0（141-151）；
  - 否则先设 `indicatorTransition = animate`（155），再写 `{ opacity: '1', transform: 'translateX(Lpx)', width: 'Wpx' }`（156-160）。
- 竖直方向完全交给 CSS：`top: var(--tx-flat-radio-padding)`，`height: calc(100% − 2 × padding)`（380-382）。
- 触发时机：
  - 挂载时 `nextTick` 后 `updateIndicator(false)`（170-172）；
  - 容器 ResizeObserver 触发时 `updateIndicator(false)`，**只观察容器，不观察子项**（174-179）；
  - `watch(modelValue, deep, flush 'post')` 后等一个 nextTick，再 `updateIndicator(true)`（187-194）。
- 探针（jsdom）：刚挂载时 style 为 `opacity: 0; transform: translateX(0); width: 0px`，没有类。两个 tick 后变成 `opacity: 1; transform: translateX(0px); width: 0px`，并带 `no-transition`。改值之后 `no-transition` 被去掉。

### 3.2 绘制
- 节点：`<span v-if="!multiple" class="tx-flat-radio__indicator" :class="{ 'no-transition': !indicatorTransition }" :style="indicatorStyle" aria-hidden>`（323-329）。
- CSS（378-406）：
  - 圆角 `var(--tx-flat-radio-item-radius, 6px)`；
  - 底色 `var(--tx-flat-radio-indicator-bg, var(--tx-surface-raised, #fff))`（384）；
  - 阴影 `var(--tx-flat-radio-indicator-shadow, var(--tx-elevation-2, 1px 2px 8px rgba(0,0,0,.05)))`（388）；
  - `z-index: 0`，`will-change: transform, width`（391）。
  - 子项为 `position: relative; z-index: 1`（Item 85-86）。
- 轨道底色：`var(--tx-flat-radio-track-bg, var(--tx-fill-color, #f0f2f5))`（344）。
- 尺寸档以行内 CSS 变量下发（`cssVars`，290-299）：`--tx-flat-radio-height`、`-padding`、`-font-size`、`-gap`、`-radius`、`-item-radius`、`-item-padding`、`-item-gap`，共四档 `sm | md | lg | xl`（280-288）。

### 3.3 过渡、首帧与减弱动效
- 过渡（398-401）：`transform` 和 `width` 共用 `var(--tx-flat-radio-duration, 0.26s) var(--tx-flat-radio-ease, cubic-bezier(0.32, 1.28, 0.5, 1))`，外加 `opacity 0.15s ease`。393-397 的注释说明：宽度也要回弹，这是有意为之。
- `.no-transition { transition: none !important }`（403-405）会同时关掉 opacity 淡入，所以首帧显示没有淡入。挂载、容器尺寸变化、子项注册或注销时都会直接跳到位；只有 modelValue 变化时才走过渡。
- 减弱动效（410-414）：`transition: opacity 0.15s ease`。子项另有一个减弱动效块，去掉按压缩放（Item 167-181）。

### 3.4 悬停、拖拽、键盘
- 没有悬停板；悬停只改文字颜色（Item 110-112）。按下时缩放的是 label 和 icon，而不是被测量的子项盒子（Item 118-126）。**没有拖拽。**
- 键盘由容器处理：容器 `tabindex="0"`，子项 `tabindex="-1"`（318；Item 69）。keydown 处理（204-262）：
  - 单选：方向键循环切换、Home / End 跳到首尾，并跳过禁用项；
  - 多选：方向键移动虚拟焦点（`focusedValue`，84），Enter / Space 切换选中；容器用 `aria-activedescendant` 指向当前项（302-304）。

### 3.5 公开 API
- Props 用 type-only 的 `withDefaults(defineProps<TxFlatRadioProps>())` 声明，类型在 `types.ts:7-13`：`modelValue`（必填）、`multiple=false`、`disabled=false`、`size='md'`、`bordered=false`。
- Emits：`update:modelValue` 和 `change`。Slot：`default`。
- 导出（`C/flat-radio/index.ts`）：组件，加上 `TxFlatRadioContext`（**inject 上下文的类型是公开的**）、`TxFlatRadioItemProps`、`TxFlatRadioProps`、`TxFlatRadioSize`、`TxFlatRadioValue`、`FLAT_RADIO_KEY`。
- CSS 变量：
  - 有测试、有文档：`--tx-flat-radio-track-bg`、`--tx-flat-radio-indicator-bg`、`--tx-flat-radio-indicator-shadow`；
  - 无文档：`--tx-flat-radio-duration`、`--tx-flat-radio-ease`；
  - 尺寸档：上面 8 个几何变量。

### 3.6 测试（`C/flat-radio/__tests__/flat-radio.test.ts`，259 行）

`indicatorRuleBody()`（119-122）的取法是：从源码里第一次出现的 `.tx-flat-radio__indicator {` 开始，截到**其后第一个 `}`**，也就是 `&.no-transition {…}` 的右括号。

| 用例 | 断言 | rAF + scale 化后 |
|---|---|---|
| 148-159 对比度 | 截取段里有 `var(--tx-surface-raised`，没有 `var(--tx-bg-color-overlay`，也没有 `color-mix(in srgb, var(--tx-text-color-primary` | 如果底色移出这条规则，或者在 `background:` 之前插入了嵌套块（导致截取段被截断），会**失败** |
| 161-167 覆盖点 | 源码里有三个 `--tx-flat-radio-{track-bg,indicator-bg,indicator-shadow}` | 变量移出 SFC 时会失败 |
| 171-187 同一条曲线 | 截取段里有 `transition:`，并且 `transform …` 段与 `width …` 段的时序部分字面相同 | **必然失败**：rAF 写 transform 时，这两段过渡必须删掉，而 `expect(transform).toBeTruthy()` 要求它们存在 |
| 189-201 字重 | Item 的基础规则里 `font-weight: 500`，选中态规则里没有字重 | 不受影响 |
| 203-208 小数 rect | `TxFlatRadio.vue` 源码包含 `getBoundingClientRect()`，并且不匹配 `/\.offsetLeft/` | 如果改用 `useIndicatorBox` 或共享引擎，而 SFC 里不再出现这个字面量，会**失败** |
| 210-216 按压目标 | Item 的 `&:active` 规则里有 `__label` 和 `__icon` | 不受影响 |
| 218-221 减弱动效 | 两个 SFC 源码都包含 `@media (prefers-reduced-motion: reduce)` | 如果 `TxFlatRadio.vue` 删掉这个 media 块（比如改成只在 JS 里判断），会**失败** |
| 37-116、224-259 | 语义、键盘、多选、尺寸档 | 不受影响 |

另外，`C/fine-tune-card/__tests__/fine-tune-card.test.ts:97-106` 断言 `.tx-flat-radio` 根上的行内变量（由外部 `:style` 合并进来）；`fine-tune-card-motion.test.ts:37-72` 断言 TxFineTuneCard 编译后的 CSS 里 `animation:` 与 `animation: none` 数量对等，而且减弱动效块里不隐藏任何内容。

---

## 4. TxSidebarNav（`C/sidebar-nav/src/TxSidebarNav.vue`，705 行）

### 4.1 测量与定位
- 容器是 `navRef`，即 `.tx-bui-sidebar-nav__body`（263；CSS 为 `position: relative; flex-direction: column; gap: 8px`，508-513）。目标是 `<li class="…__item">`，存在非响应式 Map `itemEls` 里（30、40-45、285）。
- **悬停优先于选中**：`indicatorKey = hovered ?? modelValue`，并且只在该项仍然可见（没被过滤掉）时生效（85-93）。`hovered` 的来源：
  - li 的 `@mouseenter` / `@focusin` 置为该项，`@focusout` 置为 null（288-290）；
  - body 的 `@mouseleave` 置为 null（265）。
- `useIndicatorBox({ container: navRef, target: () => itemEls.get(indicatorKey) })`（95-101）。
- `indicatorStyle`（103-108）：`top: ${box.top}px`、`height: ${box.height}px`、`opacity: box ? 1 : 0`（数字），另有 `--tx-bui-sidebar-nav-indicator-duration: ${indicatorDuration}ms`。**只写 top 和 height，不用 transform，也不写 left / width**；横向由 CSS 的 `left: 0; right: 0` 撑满（518-523）。

### 4.2 绘制
- 节点始终存在，没有 `v-if`：`<span class="tx-bui-sidebar-nav__indicator" :class="{ 'is-revealed': revealed }" :style="indicatorStyle" aria-hidden>`（267-272）。
- CSS：底色 `var(--tx-bui-hover, #f4f5f6)`，圆角 7px（517-524）。行的 `z-index: 1`（548-553）。选中态由文字承担，而不是背景（668-683：图标墨色、label `font-weight: 500`、徽标反色）。
- 样式块是**非 scoped** 的 `<style lang="scss">`（332），内含 `@include bui-scope`（338），所以 `:deep()` 在这里被禁止（见 §9.3）。

### 4.3 过渡、首帧与减弱动效
- 只有 `.is-revealed` 时才有过渡（525-530）：`top` 和 `height` 用 `var(--tx-bui-sidebar-nav-indicator-duration, 220ms)`，缓动 `var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))`，不回弹；另有 `opacity 150ms ease`。
- 首帧：测量之前是 `opacity 0` 且没有 `is-revealed`，拿到 box 后直接落位。目标消失（box 变成 null）时 `revealed` 同时回到 false，板子立刻消失，没有淡出。
- 减弱动效（693-703）：`&__indicator.is-revealed { transition: none }`，**连 opacity 淡入也一起去掉**，这点和 TabBar、FlatRadio 不同。
- 重测：ResizeObserver 触发的重测，同样按过渡动起来。

### 4.4 悬停、拖拽、键盘
- 悬停就是它的主要用途：只有一块板，先跟着指针走，再回到选中行。文档把它称为「指针」（`DOCS/sidebar-nav.en.mdc:99`）。**没有第二块专门的选中高亮。**
- **没有拖拽。** 键盘方面，行本身是原生 `<button>`，没有方向键漫游；焦点进出（focusin / focusout）会带着板子移动。另有 `searchHint` 的单字符全局快捷键（149-160），和指示器无关。

### 4.5 公开 API
- Props 用 type-only 声明（`types.ts:37-66`），其中 `indicatorDuration?: number`，默认 220（`types.ts:64-65`；SFC 13）。仓库里没有任何调用方传过这个 prop。
- Emits：`update:modelValue`、`update:query`、`select`、`action`、`itemAction`、`workspaceClick`（`types.ts:68-79`）。Slots：`workspace`、`item-icon`、`footer`（18-25）。
- Expose：`focusSearch()`，以及 `refreshIndicator` = `measure`（176-180）。仓库里没有任何调用方用到 `refreshIndicator`。
- 导出（`C/sidebar-nav/index.ts`）：组件、各类型，再加 `useIndicatorBox` 及其类型（34-35）。
- CSS 变量：`--tx-bui-sidebar-nav-indicator-duration`（由 prop 写入行内，调用方写的样式表覆盖不了它）、`--tx-bui-sidebar-nav-width`（有 3 个模板覆盖，见 §7）。

### 4.6 测试（`C/sidebar-nav/__tests__/sidebar-nav.test.ts`，271 行）
| 用例 | 断言 | rAF + scale 化后 |
|---|---|---|
| 218-232 首帧 | 测量前 style 含 `opacity: 0`、没有 `is-revealed`；一个 nextTick 后 style 含 `opacity: 1`、类里有 `is-revealed`、style 含 `--tx-bui-sidebar-nav-indicator-duration: 220ms` | 如果 opacity 移出行内 style、去掉 `is-revealed` 类，或者不再写 duration 变量，会失败 |
| 234-270 跟随悬停 | 给 rect 打桩后 hover 第 4 行，一个 nextTick 后 style 含 `top: 84px` 和 `height: 28px`；mouseleave 加一个 nextTick 后含 `top: 28px` | **必然失败**：改用 transform 时字面量对不上；即便仍写 `top`，一个 tick 后也还是起点值，除非引擎在测试或瞬移场景下直接落到目标 |

另外，`C/context-cards/__tests__/context-cards-motion.test.ts:17-22,63-87` 会把 TxSidebarNav.vue 的样式经 sass 编译后检查：必须含 `prefers-reduced-motion: reduce`；`animation: tx-bui-*` 的数量要大于 0，并且存在 `animation: none`（来自徽标的 pop-in mixin）；减弱动效块里**不能**出现 `display: none`、`visibility: hidden` 或 `opacity: 0`。

---

## 5. TxRadioGroup 指示器（引擎来源）

文件：`C/radio/src/radio-group-indicator.ts`（743 行）、`TxRadioGroup.vue`（355 行）、`radio-group-model.ts`（84 行）、`TxRadio.vue`（265 行）。

### 5.1 结构：组件里的 5 个图层（TxRadioGroup.vue 144-193；只在 `type === 'button'` 时渲染）
| 图层 | 类名 | 可见条件 | 写入的样式 | 说明 |
|---|---|---|---|---|
| outline | `__indicator-outline`（144；CSS 243-256） | 静止时显示；运动中 opacity 0（130-142） | `translate3d(x,y,0)` + w / h，**不带 scale** | 渐变加描边，`transition: opacity 40ms` |
| glass | `TxGlassSurface.__indicator-glass-wrap`（146-168；CSS 258-283） | 仅 glass 变体，只要 indicatorVisible 就挂载；opacity：静止 0 / emerge 0.95 / sink 0.28 / 运动中 1（144-155） | translate3d + `scale(jelly)`，**始终 elastic**（166-181）；`filter: drop-shadow(0 10px 20px …)` 外加运动中的 brightness（157-164） | 内层 `__indicator-glass-inner` 有自己的反向缩放（183-221），CSS 为 `transition: transform 120ms`；`TxGlassSurface` 的宽高以 px 数字传入（151-152），**每帧跟着 currentRect 变** |
| blur | `__indicator-blur`（170-176；CSS 285-302） | 仅 blur 变体，只在运动中显示（opacity 1）；`backdrop-filter: blur(blurAmount px)` 同样只在运动中开启 | translate3d + `scale(jelly)`，按 `props.elastic`（243-262） | |
| plain | `__indicator-plain`（178-184；CSS 304-324） | 所有 button 变体都有，始终 opacity 1 | translate3d + w / h + `scale(sx.toFixed(3), sy.toFixed(3))`（264-278） | 配方：88% 浮层底色、50% 描边、`1px 2px 8px rgba(15,23,42,.08)` 阴影加 `inset 0 1px 0 rgba(255,255,255,.17)` 高光。outline 变体时改为透明底加 primary 描边（320-324） |
| hit | `__indicator-hit`（186-193；CSS 332-347） | opacity 0，`cursor: grab`；拖拽中 `pointer-events: none` | translate3d + `scale(1.08)` | `z-index: 2`，压在各按钮（`z-index: 1`，349-354）之上，**选中按钮上的点击会先落到它身上**；它负责 `@pointerdown` 开始拖拽 |

根节点：`.tx-radio-group`，类 `tx-radio-group--{type}`、`--dir-{row|column}`、`--indicator-{variant}`，运动中另加 `is-motion`（136-141）；**所有 type 都设置了 `touch-action: none`**（204）；键盘事件挂在根上（142）。

### 5.2 状态与积分器（radio-group-indicator.ts）
- **状态**：`targetRect`、`currentRect`、`velocity {x,y,w,h}`、`impact`、`impactAxis`、`isDragging`、`isAnimating`、`motionPhase: 'idle'|'emerge'|'sink'`、`dragLockY`、`isDarkMode`（43-62）。`motionActive = isDragging || isAnimating`（64）。
- **缩放**：
  - `activeScale`（98-112）：拖拽中 1.08；emerge 相位 1.06；运动中 1.03；静止 1；
  - `glassPhaseScale`（85-96）：emerge 1.08；sink 0.97；
  - 两者都交给 `getElasticScale` 调用 `jellyScale`（116-128）；`dragBoost` 在拖拽中取 1.8。
- **帧步进 `stepMotion`**（339-452）：
  - 每帧**只积分一步**，`dt = min(帧间隔, 0.024 s)`（342）；
  - 拖拽中（354-363）：只更新速度和 impact，不写 currentRect，位置由 `onPointerMove` 直接写入。其中 x / y 速度按 `exp(−6·dt)` 衰减；w / h 速度按拖拽弹簧参数累加，刚度 `112 × 1.12`、阻尼 `9`（32-34），这部分累加值松手后才进入弹簧；impact 按 `exp(−7.4·dt)` 衰减；
  - `elastic = false`（365-398）：不用弹簧，改为指数跟随（每秒 34），impact 恒为 0；各分量误差都小于 0.35px 时收敛，再经 `settleMotion(18)` 结束；
  - `elastic = true`（400-451）：半隐式欧拉。位置刚度为 `props.stiffness`（emerge 相位乘 0.62），宽高刚度再乘 1.12，阻尼为 `props.damping`（403-410）。越过目标（反向）且速度大于 30 时记一次落地：`impact = max(impact, speed/300)`，`impactAxis` 取当前速度较大的那一轴（420-426）。impact 按 `exp(−4·dt)` 衰减。收敛阈值取 `JELLY.settleDistance / settleSpeed`，收敛后经 `settleMotion(JELLY.sinkMs)` 结束（433-449）。
- **相位与收敛**：
  - `startMotion`：非拖拽时进入 `emerge` 相位，持续 170ms（320-328）；
  - `settleMotion(ms)`：先调用 `commitPendingModelValue()`，再切到 `sink` 相位，`ms` 之后 `isAnimating = false`（330-337）。

### 5.3 测量（`updateIndicator`，454-489）与触发
- 在组根下 `querySelector('.tx-radio.tx-radio--button.is-checked')`，rect 相减后再减去 `root.clientLeft` / `clientTop`（469-475）。**不做缩放归一化**，和 useIndicatorBox 不同。`overscan = 0`（32）。
- 当前没有在运动、并且 currentRect 还是 0×0 时，直接把 current 设为 target，也就是首帧瞬移（485-487）。**不论什么情况，最后都会调用 `startMotion()`**（488）。
- 触发：`queueUpdateIndicator` 先排一个 rAF（491-498）；`onMounted` 时 nextTick 后调用，同时挂上 `window.resize` 监听（688-693）；`watch(modelValue)` 和 `watch(type)` 在 post flush 加一个 nextTick 后调用（708-724）。
- **探针（假计时器，挂载）**：第一个 rAF 帧里 plain 为 `translate3d(4px, 4px, 0) scale(1.145, 1.145)`，此时根上有 `is-motion`、outline opacity 0；下一帧起变成 `scale(0.999, 0.999)`，也就是 sink 相位的 32ms；之后回到 `scale(1.000, 1.000)`，outline 重新显示。也就是说，**挂载时和每次 window resize 时，都会有一帧约 14% 的鼓起**（activeScale 1.06 × emerge 1.08）。

### 5.4 拖拽
- `onPointerDown`（597-630）：只在 button 类型、未禁用、左键、指示器可见时生效。对 hit 层 `setPointerCapture`，锁定 y，进入 `emerge` 相位 110ms，在 window 上挂 pointermove / up / cancel。
- `onPointerMove`（500-548）：用指针速度作为 `velocity.x`，y 方向速度为 0。x 限制在 `[0, clientWidth − width]` 内，**target 和 current 都直接跟随指针**，拖拽中位置不走弹簧。在两端并且 |v| 大于 520 时记 `impact = 0.92`，轴为 x。
- `endDrag`（554-595）：按中心 x 找最近的可用按钮，如果它还没选中就 `.click()` 它；再把 `velocity.x += 指针速度 × 0.14`（releaseKick）；最后重新测量并 `startMotion`。

### 5.5 键盘、模型、暗色
- 键盘 `onKeydown`（659-686）：可用按钮之间用方向键循环、Home / End 跳首尾，调用 `focus()` 加 `click()`。漫游 tabindex 由 `TxRadioGroup.vue` 的 `radioRegistry` 和 `tabStopValue` 负责（92-117）。
- `updateOnSettled`（`TxRadioGroup.vue:54-58`）：没显式传值时，glass 和 blur 变体默认开启，而且只在 button 类型下有效。`radio-group-model.ts` 的做法是：setter 只写本地值和 pending 值（62-78），所以按钮的 `is-checked` 和指示器目标会立即切换；`update:modelValue` 和 `change` 则留到 `settleMotion → commitPendingModelValue` 时才发出（26-40）。卸载时 pending 值不会被提交。
- 暗色检测（72-83）：**只看** `matchMedia('(prefers-color-scheme: dark)')` 并监听它的变化，不看 `.dark` 类。它影响 `glassFilter` 和 `glassLook`（157-164、225-241）。相比之下，TxSlider 的 `readDarkTheme` 会先看 `.dark` 类和 `data-theme`（`TxSlider.vue:203-210`）。
- **减弱动效：完全没有处理**，CSS 和 JS 里都没有（在 radio 目录下 grep `reduce` 一无所获）。

### 5.6 探针：一次切换的形变量级（solid，50px 胶囊移到 80px 胶囊）
- 第 1 帧：`scale(1.145, 1.145)`。前 170ms（emerge 相位、速度饱和）：`scale(0.904, 1.557)`，即 28px 高的胶囊峰值约 43.6px。之后 `scale(0.814, 1.401)`；过冲回摆时出现 `scale(1.072, 1.018)`、`scale(1.001, 1.114)` 等。位置和宽度字符串没有取整，形如 `translate3d(6.728354156380161px, 4px, 0)`、`width: 51.63578344481227px`。
- 默认 solid 变体不开 updateOnSettled，点击时立即发出 `update:modelValue`（探针结果为 `[["b"]]`）。

### 5.7 公开 API
- Props（`types.ts:5-25`；默认值见 `TxRadioGroup.vue:10-21`，type-only 声明）：`modelValue`、`disabled`、`type='button'`、`direction`、`indicatorVariant`（`'solid'|'outline'|'glass'|'blur'`）、`glass`、`blur`、`updateOnSettled`、`stiffness=110`、`damping=12`、`blurAmount=1`、`elastic=true`。
- Emits：`update:modelValue` 和 `change`。
- 仓库里传过运动类 prop 的只有 `DEMOS/RadioRadioGroupPlaygroundDemo.vue:170-173`（`elastic`、`stiffness`、`damping`、`blur-amount`）和 `DEMOS/RadioRadioIndicatorDemo.vue:59`（`:elastic="false"`）。

### 5.8 测试锁定点
| 文件 | 断言 | 共享引擎抽取或迁移时 |
|---|---|---|
| `C/radio/__tests__/radio-group-indicator.test.ts:29-61` | 假计时器（setTimeout / rAF / performance），给根和 `.is-checked` 的 rect 打桩，根的 `clientLeft` 和 `clientTop` 都设为 1；nextTick、推进 32ms、再 nextTick 后，plain 的 style 匹配 `/translate3d\(55px, 3px, 0\)/`，并含 `width: 55px` 和 `height: 28px` | 类名、`translate3d(Xpx, Ypx, 0)` 的格式、宽高仍写成 px（不能折进 scale）、首帧瞬移、减去 client 边、在约 2 帧内出结果，这些都被锁住 |
| `C/radio/__tests__/radio.test.ts` | 全部用 `type="standard"`（不渲染指示器）：radiogroup 语义、方向键跳过禁用项、Home / End、禁用、漫游 tabindex、单独使用 | 只有键盘逻辑迁移时才相关 |
| `C/slider/__tests__/slider.test.ts:5-6,313-372` | 用 `?raw` 读取 `TxRadioGroup.vue` 和 `TxRadio.vue`：`.tx-radio-group__indicator-plain {` 规则体非空，含 `color-mix(in srgb, var(--tx-bg-color-overlay…) 88%`、`1px solid color-mix(in srgb, var(--tx-border-color-light…) 50%`、`inset 0 1px 0 rgba(255, 255, 255, 0.17)`、`1px 2px 8px rgba(15, 23, 42, 0.08)`；`TxRadio.vue` 的 `&--button` 高 28px | plain 层的绘制样式如果移出 `TxRadioGroup.vue`（比如挪进共享样式表）或者改了选择器，就会失败 |
| `slider.test.ts:481-605` | 滑块的果冻：按下后内联 style 含 `scale(` 并保留 `translate(-50%, -50%)`；静止后内联 transform 被移除；按住 1500ms 后缩放 ≈ 1.08；reduced-motion 打桩后不形变；卸载时调用 cancelAnimationFrame；glass 只在按住和收场期间挂载 | 依赖 `JELLY` 和 `use-thumb-jelly.ts` |
| `TX/utils/__tests__/jelly.test.ts:10-69` | `jellyScale` 的算术与常量 | 同上 |

---

## 6. 对照：TxSegmentedSlider 与 TxSlider 的 `use-thumb-jelly.ts`

### 6.1 TxSegmentedSlider（`C/segmented-slider/src/TxSegmentedSlider.vue`，344 行）
- **没有需要测量的浮动指示器。**
  - 进度条用百分比宽高：`progressStyle`，`width` 或 `height` 取 `x%`（27-36），过渡为 `0.32s var(--tx-ease-out-strong)`（192-194）；
  - 各档位点用百分比 `left` 或 `bottom` 定位（42-49）；
  - 选中点尺寸 16px→20px 走 width / height 过渡，悬停时点 `scale(1.12)`（222-246、259-277）。
- 键盘（73-96）：radiogroup，方向键在两端夹住、不循环，Home / End 跳首尾，竖排时方向反过来，漫游 tabindex（146）。**没有拖拽**，档位只是按钮。
- 减弱动效（291-297）：去掉进度条、点、label 的过渡。
- 测试（`__tests__/segmented-slider.test.ts`）锁的是 `width: 66.666`、`left: 33.333`、`bottom: 100%` 等百分比字符串，以及 `&__dot {` 规则里有 `display: block`。

### 6.2 TxSlider 的果冻（`C/slider/src/use-thumb-jelly.ts`，202 行）
- **位置不走弹簧**：`left` 每帧跟随指针（`TxSlider.vue:177-187`、566-577）。走弹簧的**只有整体缩放 `base`**：按住时趋向 `heldScale`，松手后回到 1，用的是 JELLY 的刚度和阻尼（`use-thumb-jelly.ts:101-103`）。
- 各输入的来源：
  - 拉伸：来自指针速度，速度按 `exp(−6·dt)` 衰减（96-99）；
  - 落地：来自三种情况——反向且速度大于 30 时 impact 为 `speed/300`；在两端且速度大于 520 时为 0.92；松手时为 `min(1, |v|/520) × 0.92`（170-191）；
  - 相位：按下时 emerge 110ms，收敛后 sink 32ms（156-164、131-137）；
  - `impactAxis` 恒为 `'x'`；`HELD_STRETCH_BOOST = 1`，而不是 JELLY 的 1.8，因为头顶有 tooltip（15-20）；`dt` 上限 24ms（12）。
- 宿主开关：`isEnabled()` 为 `thumbSurface && !reducedMotion`（`TxSlider.vue:173-175`）。`reducedMotion` 只在 setup 时读一次 matchMedia，不做响应式（169-171）。
- 输出：只在 `active` 时写内联 `transform: translate(-50%, -50%) scale(x.toFixed(4), y.toFixed(4))`；静止后**删掉该属性**，由样式表里的 `translate(-50%, -50%)` 接管（182-187；CSS 814-834，其中特意不对 transform 做过渡，813 行注释）。
- 减弱动效在 CSS 里只把 hover 时钟归零（1003-1008）；形变由 JS 关掉。
- tooltip 另用一个独立的半隐式弹簧（`use-tooltip-motion.ts:30-42`，`dt` 上限约 32ms，106-107）。

---

## 7. 调用方清单（排除 node_modules 和 dist）

### 7.1 外部 CSS 是否触及指示器内部
- 在 `apps`、`plugins`、`packages` 里 grep `.tx-flat-radio__indicator|.tx-tab-bar__indicator|.tx-bui-sidebar-nav__indicator|.tx-radio-group__indicator|--tx-flat-radio-duration|--tx-flat-radio-ease|--tx-tab-bar-indicator|--tx-bui-sidebar-nav-indicator|indicatorDuration`，组件自身之外只命中：
  - `C/fine-tune-card/src/TxFineTuneCard.vue:341-350` 与 `352-357`；
  - `slider.test.ts` 的源码读取；
  - 文档。

  **没有任何应用、插件或 nexus demo 覆盖这些时长或缓动变量，也没有人传 `indicatorDuration`。**
- 覆盖了根或子项样式、但没碰指示器的：
  - `apps/core-app/src/renderer/src/components/store/StoreHeader.vue:252-258`（`.store-filter-radio { min-height: 28px }`，`:deep(.tx-flat-radio-item) { min-width: 40px }`）；
  - `DEMOS/TemplateAgentChatDemo.vue:2393-2400`（根 `width: 100%`，子项 `flex: 1 1 0`）；
  - `DEMOS/TemplateAutomationDemo.vue:1707-1715`；
  - `DEMOS/TemplateCmsBoardDemo.css:785-788`；
  - `DEMOS/TemplateCmsDemo.vue:2187-2197`；
  - `DEMOS/TemplateInboxNotificationsDemo.vue:2442-2444`；
  - `C/icon-picker/src/TxIconPickerPanel.vue:276-290,487-495`。它在样式表里设置了 `--tx-flat-radio-height`、`-radius`、`-item-radius`、`-font-size`、`-item-padding`，而 TxFlatRadio 自己也把这 8 个变量写在行内（`TxFlatRadio.vue:290-299`），行内声明优先。

    SidebarNav 相关：`--tx-bui-sidebar-nav-width` 被 `DEMOS/TemplateInboxDemo.vue:2570-2571`、`TemplateShellDemo.vue:1068,1719`、`TemplateStoreDemo.css:101` 覆盖。
- TxFineTuneCard 的覆盖细节：特异度 0,3,0（重复写包裹类，317-321），把指示器的底色改成 `--tx-bui-surface`、阴影改成 `--tx-bui-shadow-btn`，并设置 `transition: transform 0.3s var(--tx-ease-out-strong…), width 0.3s …, opacity 0.15s`；减弱动效时 `transition: none`。它的行内样式 `SEGMENTED_STYLE`（49-56）写入了 5 个几何变量和一个 background。

### 7.2 TxTabBar

core-app、plugins、其他 packages 里都**没有**调用。

| 位置 | 传入 | 备注 |
|---|---|---|
| `DEMOS/TabBarTabBarDemo.vue:35` | `v-model`、`items`、`:fixed="false"` | 外框 `overflow: hidden`（40-47） |
| `DEMOS/TabBarIndicatorDemo.vue:38-44` | `v-model`、`items`、`fixed=false`、`:indicator`（5 种）、`:size`（sm / md / lg） | 用两个 `TxFlatRadio size="sm"` 切换变体和尺寸（23-35）；外框 `overflow: hidden`（54-59） |
| `apps/nexus/app/components/docs/DocsComponentsGallery.vue:2195,2197` | `v-model="navTab"`、`items`、`fixed=false`；第二个加 `indicator="line"` | 和 SidebarNav 单元格（2179）共用 `navTab`（443-448），点一下三处同时移动；外框 `.docs-gallery__framed { overflow: hidden }`（`DocsComponentsGallery.css:190-194`） |
| `DOCS/tab-bar.{en,zh}.mdc:31,102` | 代码片段 | |

### 7.3 TxFlatRadio

core-app：
- `StoreHeader.vue:156-165`：两个 `size="sm"`，只有图标；
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockFlatRadio.vue:60-69`：传 `v-model`、`:size="radioSize"`（默认 sm）、`:disabled`、`:multiple`，禁用时加类 `pointer-events-none opacity-70`。它被 `views/base/settings/SettingLanguage.vue:27-40` 和 `SettingSpeechRecognition.vue:170-184` 使用。

tuffex 内部：
- `TxFineTuneCard.vue:120-138`：size sm，行内样式加 CSS 覆盖；
- `TxIconPickerPanel.vue:153-168,208-226`：size md。

nexus：
- 画廊 `DocsComponentsGallery.vue:1603`（xl）、`1610`（md 带图标）、`1617`（sm multiple）；
- `DEMOS` 下的 demo：`AgentScreenAgentScreenDemo.vue:58`、`AgentTraceVariantsDemo.vue:100`、`AiSuiteChatShowcaseDemo.vue:99`、`FlatRadio{Basic:9, Bordered:9, Disabled:9,15, Icon:9, Keyboard:14,28, Multiple:11, Sizes:16,27,38,49}Demo.vue`、`PromptBarPromptBarDemo.vue:99`、`TabBarIndicatorDemo.vue:23,31`、`TemplateAgentChatDemo.vue:1816`、`TemplateAutomationDemo.vue:1109`（按布局 `v-if` 挂载）、`TemplateCmsBoardDemo.vue:1969`、`TemplateCmsDemo.vue:1626`、`TemplateDashboardDemo.vue:879`、`TemplateDocsDemo.vue:1698`、`TemplateFilesDemo.vue:2449`、`TemplateGalleryDemo.vue:1188`、`TemplateInboxNotificationsDemo.vue:1487`（`:disabled`）、`TemplateOnboardingDemo.vue:1388,1482,1491`、`TemplateReleaseDemo.vue:1194,1223`、`TemplateSettingsDemo.vue:627`、`TemplateStoreDemo.vue:2482`、`ToastToastDemo.vue:64`；
- 文档 mdc 片段：flat-radio、agent-trace、template-{cms,dashboard,docs,gallery,settings}。

这些地方传的都只是 `v-model` 或 `model-value`、`size`、`disabled`、`multiple`、`bordered`、`class` / `style`、`aria-label`，**没有任何运动相关的参数**，因为本来就没有这类 prop。

### 7.4 TxSidebarNav

core-app 和 plugins 里没有调用。

| 位置 | 传入 |
|---|---|
| `DEMOS/SidebarNavSidebarNavDemo.vue:89-117` | `v-model`、`v-model:query`、`items`、`groups`、`workspace`、`search-placeholder`、`search-hint="/"`、`action-label`、事件、`#item-icon` slot |
| `DEMOS/TemplateInboxDemo.vue:1361-1371` | `model-value`、`items`、`groups`、`workspace`、`workspace-label`、`action-label`、`aria-label`、`#footer` |
| `DEMOS/TemplateShellDemo.vue:680-699` | 同上，另有 `class="shell__sidebar"`、`@item-action` |
| `DEMOS/TemplateStoreDemo.vue:2368-2376` | `v-if="mode === 'wide'"`、`model-value`、`items`、`groups`、`aria-label` |
| `DocsComponentsGallery.vue:2179` | `v-model="navTab"`、`items`，这里的 items 用的是 `iconClass` 字段而不是 `icon`，所以不显示图标 |
| 文档片段 | `DOCS/sidebar-nav`、`ai-suite:255`、`template-inbox:38/37`、`template-shell:45` |

### 7.5 TxRadioGroup（供迁移 Radio 时参考）
- core-app：`StoreHeader.vue:82-88`（`glass`，因此默认 updateOnSettled）、`views/base/styles/ThemeStyle.vue:688`（`glass`）。
- nexus：`pages/dashboard/notifications.vue:527`（`indicator-variant="glass" glass`）；`DocsComponentsGallery.vue:1235`（button）和 `1243`（standard）；以及 demo `Radio*`、`SliderSliderElasticTooltipDemo.vue`（14 处，`:indicator-variant`）、`AvatarVariantsAvatarVariantsGalleryDemo.vue:15,472`（glass）、`BaseSurfaceAdvancedDemo.vue`、`CardCardBackgroundsScrollDemo.vue`、`TemplateOnboardingDemo.vue`（card）、`TemplateSettingsDemo.vue:824`。
- plugins：无。

### 7.6 构建与消费路径（真实环境验证时要注意）
- nexus 开发时默认消费 `packages/tuffex/dist`：`apps/nexus/build/tuffex-dev-mode.ts` 在 dev 下默认走 `'dist'`，设置 `NUXT_TUFFEX_SOURCE=true` 才走源码。因此改完 tuffex 要先 `pnpm -C packages/tuffex run build`，否则画廊和 demo 看不到变化。
- core-app 开发时 JS 走源码别名，但组件样式取 `dist/es/$1/style.css`（`apps/core-app/electron.vite.config.ts:32-69`）。

---

## 8. Nexus 文档里需要跟着改的段落（zh 与 en 行号基本一致）

| 页面 | 位置 | 现有说法 |
|---|---|---|
| `DOCS/tab-bar.en.mdc` / `.zh.mdc` | 52（`indicator` prop 行） | 「Sliding indicator」 |
| | 80-84，`## Indicator` / `## 指示器` | `pill` 抬起一块表面，并以 FlatRadio 的滑块作类比 |
| | en 110-113 / zh 110-112，`## Overview` / `## 概述` | 「measures through the shared `useIndicatorBox`」「Travel and resize share one duration and one curve…`prefers-reduced-motion: reduce` drops the travel and keeps the fade」「pill inset is arithmetic」「Every variant travels on the same x」。**zh 缺了 en 113 这一条，也缺 en 112 里 block / dot 的半句** |
| | en 124 / zh 122，Technologies 的「Indicator note」 | 与 SidebarNav 共用 `useIndicatorBox` |
| | en 126 / zh 124，Verified coverage | 列出了变体类和 `none` 不渲染节点 |
| `DOCS/flat-radio.*.mdc` | 3（description） | 「sliding indicator animation」 |
| | 72、74，Best Practices | 字重会影响重排、`value` 要稳定，因为要按 value 注册 DOM |
| | 85（`multiple` 行） | 多选时隐藏指示器 |
| | 282-286，Overview | 「travels and resizes on one duration and one curve」（282）、小数 rect（283）、字重（284）、按压不缩放盒子（285）、减弱动效时去掉位移、保留淡入（286） |
| | 299-300，Technologies | Motion note，以及 coverage 里的「the shared transition curve…the reduced-motion path」 |
| `DOCS/sidebar-nav.*.mdc` | 15（demo 描述） | 「the highlight travels with the pointer」 |
| | 61 | `indicatorDuration` 默认 220：「Travel time for the highlight, in ms」 |
| | 95 | `refreshIndicator()` |
| | 97-107，`## How the Highlight Travels` / `## 高亮块的移动与测量` | 讲 `useIndicatorBox`、四条边、ResizeObserver 和 `revealed` |
| | 128 | Composable 路径写成 `…/sidebar-nav/src/use-indicator-box.ts`，**实际在 `packages/tuffex/packages/utils/use-indicator-box.ts`** |
| | 130，coverage | 「the highlight staying untransitioned until measured…moving…and back」。整页没有一句提到减弱动效 |
| `DOCS/radio.*.mdc` | 47，Best Practices | glass / blur 保持 `updateOnSettled` 默认值 |
| | 61-68，Props 表 | `indicatorVariant`、`glass`、`blur`、`updateOnSettled`、`stiffness`、`damping`、`blurAmount`、`elastic` |
| | 184-207，`## Indicator Motion` / `## 指示器动效` | `elastic` 控制拉伸和撞击，`stiffness` / `damping` 调弹簧 |
| | 260-261，Overview | 动画指示器与 updateOnSettled；指示器可拖拽、松手吸附到最近项 |
| | 266-269，Technologies | 源码位置；coverage 只提到 `radio.test.ts`，**没有提 `radio-group-indicator.test.ts`**。整页没有提到减弱动效 |
| 受波及的其他页（按 `tuffex-docs-sync.md` 的 blast radius 规则） | `DOCS/fine-tune-card.en.mdc:84` / `zh:106` | 「The thumb's motion comes from `TxFlatRadio` itself: travel and resize share one curve…— none of which this card overrides」，**和 `TxFineTuneCard.vue:341-350` 实际覆写了过渡的事实不符** |
| | `fine-tune-card.en.mdc:108` / `zh:100` | 「thumb's fill, shadow and easing…hard-coded」 |
| | `DOCS/slider.*.mdc:56-57、209、214` | 胶囊和果冻都借自 Radio 指示器，含 JELLY 数值与 coverage；如果 JELLY 或 Radio 的配方变了，这些都要同步 |
| | `DOCS/ai-suite.*.mdc:251` | demo 描述「hover indicator / 悬浮指示器」 |
| | `DOCS/template-docs.*.mdc:20,45-46,111/110` | `useIndicatorBox` 的用法 |

没有任何页面记载 `--tx-tab-bar-indicator-duration/-ease`、`--tx-flat-radio-duration/-ease`、`--tx-bui-sidebar-nav-indicator-duration`（在 docs 下 grep 为空）。

---

## 9. 减弱动效 helper、全局约束测试与 spec

### 9.1 现有的 helper（都没有公开导出）
- `C/liquid/src/use-reduced-motion.ts`：`useReducedMotion(): Ref<boolean>`，初值 false，`onMounted` 时读 matchMedia 并监听 change，卸载时移除监听，对 SSR 安全。只在 `C/liquid/src/LiquidMirroredItem.vue:8,42` 用到；`liquid/index.ts` 没有导出它。
- `C/text-morph/src/engine/reduced-motion.ts`：`createReducedMotionListener()` 返回 `{ prefersReducedMotion, destroy }`，不依赖 Vue，由 `engine/morph.ts:30,90` 使用。
- 其余各组件直接调用 `window.matchMedia('(prefers-reduced-motion: reduce)').matches`，例如 `TxSlider.vue:169-171`（只在 setup 读一次）、`TxBaseAnchor.vue:727`、`TxFloating.vue:243`、`button.vue:202`、`TxBorderBeam.vue:238`、`TxContextChunk.vue:33`、`TxModeChip.vue:48`、`TxSelectionActions.vue:106`、`TxApprovalCard.vue:106`、`TxChatComposer.vue:243`、`TxStreamMarkdown.vue:231`、`charts/src/core/animate.ts:115`、`icon-morph/src/engine/dom/index.ts:258`。
- 测试环境：`packages/tuffex/vitest.setup.ts:1-20` 在没有 matchMedia 时装一个桩，**对所有查询都返回 `matches: false`**（第 10 行，与第 2-6 行的注释矛盾）。需要测减弱动效的用例得自己打桩，例如 `slider.test.ts:546-570`、`context-cards-motion.test.ts:45-56`。如果组件只在 setup 时读一次，桩必须在 mount 之前装好。rAF 在这个 jsdom 环境里是存在的（探针已确认）。

### 9.2 全局或跨组件的运动约束
- `C/__tests__/` 下**没有**以 `prefers-reduced-motion` 为对象的全局测试（grep 为空）。运动约束都写在各组件自己的测试里：
  - `flat-radio.test.ts:218-221`：两个 SFC 源码都含 media 块；
  - `context-cards-motion.test.ts:63-87`：覆盖 TxSidebarNav（编译后必须含 reduced-motion、有动画就要有 `animation: none`、减弱动效块里不能隐藏内容）；
  - `fine-tune-card-motion.test.ts:37-72`：覆盖 TxFineTuneCard；
  - `slider.test.ts:471-474,546-570`；
  - 另外 allocation-bar、approval-card、card-press、charts、chat、empty-state、filter-chips、mode-chip、progress-bar、skeleton、stat-card、steps、text-morph、text-transformer 也各有自己的一份。
- Spec `.trellis/spec/frontend/tuffex-design-rules.md:168-176`：「Every transition has a reduced-motion escape」，任何声明了的 transition 或 animation 都不能例外；keyframes 动画还要求去掉动效后仍保留最终状态可见。
- Spec `.trellis/spec/frontend/tuffex-design-rules.md:139-166`：hover 引起的颜色变化必须立即生效；颜色过渡只能挂在「状态正在变化」的类上。

### 9.3 其他会约束新样式或新代码的全局测试与门禁
- `C/__tests__/shadow-light-source.test.ts:76-128`：扫描所有 `.vue` 样式块里的 `box-shadow` 以及名字里带 `shadow` 的自定义属性。只要某一层阴影 x 为 0 且 |y| ≥ 2，就算「直下阴影」，判失败；inset 层不在检查范围内。它**不扫描 .ts 文件**，所以 `radio-group-indicator.ts:158` 那条 `drop-shadow(0 10px 20px …)` 不在检查范围内。
- `C/__tests__/unscoped-deep-selectors.test.ts:39-57`：非 scoped 的样式块里不准出现 `:deep()`。SidebarNav 的样式块正是非 scoped 的。
- `C/__tests__/global-install.test.ts` 与 `suite-barrels.test.ts`：只有带 `install` 的导出才会被 `app.use`；base / pro / ai 三个 barrel 必须恰好覆盖 `components.ts`，不能多也不能少。
- barrel 用 `export *` 汇总，同名导出会被**静默丢弃**（`C/liquid/index.ts:14-15` 的注释）。nexus 会自动注册 `Tx*` 和 `Tuff*` 形式的导出，两个 barrel 导出同名会在配置期报错；composable 不会被注册（`.trellis/spec/frontend/bui-component-family.md:37`）。
- CSS 体积门禁（`packages/tuffex/scripts/audit-package-size.mjs`）：
  - `fullCssBytes` 上限 612 KiB（160），实测 610.1 KiB（158），余量约 1.9 KiB；
  - `onDemandCssBytes` 上限 620 KiB（205），实测 618.9 KiB（203），余量约 1.1 KiB；
  - 单组件 CSS 上限 56 KiB，单组件 JS 上限 48 KiB（210-211）。
- Spec `.trellis/spec/frontend/component-guidelines.md:131-151`，One writer per CSS custom property：同一个属性不能既由 `:style` 绑定、又由命令式代码写入；由测量得出的值归命令式那一侧，模板不再绑定它。
- Spec `.trellis/spec/frontend/component-guidelines.md:153-163`，State motion：按压或拖拽的回弹用 `liquid/src/spring.ts` 的 `resolveTransition` 编译成 CSS `linear()`，不要写多段 keyframes；hover 用单独的、不回弹的时钟。
- Spec `.trellis/spec/frontend/tuffex-text-motion.md:31-40`：「不要再引入第二个弹簧编译器」。第 37 行说 TxSlider 也用 liquid 的曲线，但 `0f8f3599f`（2026-09-06）之后 TxSlider 已改用 `jelly.ts` 的 rAF，不再 import `liquid/src/spring.ts`（grep 已确认），这一句已经过时。
- Spec `.trellis/spec/frontend/component-guidelines.md:55-63`：「Preserve public class names and event names」。
- Spec `.trellis/spec/frontend/tuffex-docs-sync.md`：组件变更必须同步它自己的 zh / en 文档页和所有包装组件的文档页；`check:doc-parity` 只比较章节数量。

---

## 10. Implications：共享引擎 API 需要满足的约束

1. **输入是一个位于容器 padding-box 坐标系里的矩形，但三个组件的来源不同。**
   - TabBar 和 SidebarNav 已经有 `useIndicatorBox` 的 `box`，可以直接接入。
   - FlatRadio 要么改用 `useIndicatorBox`（它的 `itemMap` 是非响应式 Map，target getter 需要读到 `props.modelValue`），要么继续把自己的 `{left, width}` 喂进去。改前者就得更新 `flat-radio.test.ts:203-208` 对源码字面量的断言。
   - Radio 的目标是 `.is-checked` 按钮，现在不做缩放归一化。在 jsdom 里 `offsetWidth` 为 0，`useIndicatorBox` 的 scale 恒为 1，所以 `radio-group-indicator.test.ts` 的 55 / 3 仍然成立。
2. **每个组件需要一张轴掩码。**
   - FlatRadio 和 TabBar 的 line：只有 x 与 w；
   - TabBar 的 pill / block 和 Radio：x、y、w、h 全要；
   - TabBar 的 dot：x、y，尺寸固定 6px；
   - SidebarNav：只有 y 与 h，宽度由 CSS 的 left / right 决定。

   引擎不能强行写入组件本来交给 CSS 的属性：FlatRadio 的 top / height，SidebarNav 的 left / right。
3. **输出格式由各组件决定，有的格式被测试钉死了。**
   - Radio 的 plain 层：`translate3d(Xpx, Ypx, 0)` 加 px 宽高（`radio-group-indicator.test.ts:56-58`），外加 `scale(… .toFixed(3))`；
   - SidebarNav：`top: Npx` / `height: Npx`（`sidebar-nav.test.ts:263-269`）；
   - TabBar 和 FlatRadio：字符串没有被测试钉住。

   因此返回原始数值，再由各组件自己拼样式（或者提供按组件定制的 style builder），最容易保住现有断言。
4. **形变轴向。** `jellyScale` 的拉伸固定为 x 变窄、y 变高，只有落地有 `impactAxis`。对竖向移动的 SidebarNav 来说，这等于沿行进方向拉长；对横向移动的各组件来说，则是沿行进方向变窄、垂直方向变高（参见 §5.6 的实测）。`jelly.test.ts` 钉住了现有算术，所以「行进轴」要么作为新参数加进来，要么在适配层里交换 x 和 y。
5. **形变的量级与尺寸有关。** 现有参数是按 28px 胶囊调的：按住 1.08，emerge 约 1.145，拉伸最多到 y × 1.36 × 整体缩放。同样的系数用在 2px 的 line、6px 的 dot、44px 的 xl 滑块、宽 240px 的 SidebarNav 板、以及 56px 栏里内缩后的 pill 上，溢出的绝对值差别很大。画廊的 TabBar 单元格和两个 TabBar demo 的外框都是 `overflow: hidden`，会把溢出部分裁掉。Radio 目前已有 `elastic` 开关，其他组件还没有对应的 prop。
6. **Radio 需要引擎提供的钩子。**
   - 状态：`motionActive`、`isDragging`、`motionPhase`，分别驱动根上的 `is-motion`、outline 层的显隐、glass / blur 的 opacity 与 filter、glass 上的 `is-active` / `is-sink` / `is-emerge`；
   - 回调：`onSettled`，Radio 在这里调用 `commitPendingModelValue`，是 updateOnSettled 的前提；
   - 数据：`currentRect`，传给 `TxGlassSurface` 的宽高 prop；
   - 拖拽接口：指针直接带动目标，外加速度、撞边落地和松手时的 releaseKick；
   - 首次测量时的瞬移。
7. **瞬移与 resize 策略需要单独的接口。** 首帧不滑入，三个 CSS 组件各有一套做法：TabBar 靠 v-if 插入；SidebarNav 靠 `is-revealed` 控制过渡；FlatRadio 在挂载、子项注册、resize 时加 `no-transition`。Radio 虽然会瞬移，但仍会渲染一帧 emerge 鼓起（§5.3），而且 window resize 时也一样。遇到 resize，FlatRadio 直接跳到位，TabBar 和 SidebarNav 走 CSS 过渡，Radio 则带着 emerge 走弹簧。所以引擎需要一个区别于「弹簧改目标」的瞬移或 snap 路径，同时要为每个组件选定 resize 时的行为。
8. **减弱动效。** 现状各不相同：TabBar 和 FlatRadio 保留 0.15s 淡入、去掉位移；SidebarNav 全部去掉；Radio 完全不处理；Slider 在 setup 时读一次，然后关闭果冻。可复用的有 `liquid/src/use-reduced-motion.ts`（响应式，但挂载前一直是 false）和 `text-morph/src/engine/reduced-motion.ts`，两者都没有公开导出。Spec 要求每一个 transition 都有减弱动效的出口。另外，测试环境默认 `matches: false`（§9.1），也就是默认会跑动画。
9. **CSS 过渡冲突。** 如果每帧写 transform、width、top、height，这些属性上的 CSS transition 必须撤掉，否则每一帧写入都会被再过渡一次。涉及位置：
   - `TxTabBar.vue:225-228`；
   - `TxFlatRadio.vue:398-401`，被 `flat-radio.test.ts:171-187` 钉住；
   - `TxSidebarNav.vue:525-530`；
   - 消费方 `TxFineTuneCard.vue:341-350`（减弱动效在 352-357），特异度 0,3,0，所以只改 FlatRadio 自己的规则压不住它。

   撤掉后还要对应修改 `DOCS/fine-tune-card` 的那句描述。
10. **渲染路径。** Radio 现在每帧写响应式 ref，`TxRadioGroup` 因此每帧重渲染一次，`TxGlassSurface` 的宽高 prop 也每帧变化。如果改由引擎命令式地写 `element.style`，就要遵守 spec 的 One writer 规则：模板不再绑定该元素上的 transform、width、height、top；反过来，如果仍由 Vue 绑定，每一帧都是一次组件重渲染。
11. **要保持兼容的公开面。**
    - Props：TabBar 的 `indicator` 和 `size`；SidebarNav 的 `indicatorDuration`；Radio 的 `stiffness`、`damping`、`elastic`、`blurAmount`、`indicatorVariant`、`glass`、`blur`、`updateOnSettled`。
    - 类名：`.tx-tab-bar__indicator.is-{variant}`、`.tx-flat-radio__indicator`、`.no-transition`、`.tx-bui-sidebar-nav__indicator.is-revealed`、`.tx-radio-group__indicator-{outline,glass-wrap,glass-inner,blur,plain,hit}`、`is-motion`。
    - Expose：`refreshIndicator()`。
    - 导出：`useIndicatorBox` 及其类型（根入口、`/utils`、`/sidebar-nav` 三处，并被 `TemplateDocsDemo.vue` 使用）；`JELLY`、`jellyScale` 及其类型（根入口、`/utils`）；`TxFlatRadioContext`。
    - CSS 变量：`--tx-*-duration` / `-ease` 系列，文档没写、仓库里也没人覆盖，但从源码看它们是公开的。

    引擎如果放进 `utils/index.ts`，新名字就会进入根入口的 `export *` 汇总，重名会被静默丢弃。
12. **Props 的声明方式。** FlatRadio、SidebarNav、RadioGroup 都是从同级 `types.ts` 做 type-only `defineProps<…>()`。在这些 types 里新增运动相关 prop，会踩到 dev server 过期的坑（参见 `TxTabBar.vue:9-16` 的注释和 `chat-composer-tray.test.ts:202-208`）。TabBar 是运行时对象声明，不受影响。
13. **读源码的测试会跟着引擎一起动。** `slider.test.ts` 从 `TxRadioGroup.vue?raw` 读 plain 层的配方；`flat-radio.test.ts` 的 `indicatorRuleBody()` 截取到第一个 `}` 为止。把样式移进共享样式表，或者在 `background:` 之前插入嵌套块，都会让它们失败。
14. **新样式要过的门禁。** 阴影方向测试；SidebarNav 块里不能用 `:deep`；SidebarNav 的减弱动效块里不能写 `opacity: 0`；CSS 体积余量只剩约 1-2 KiB（§9.3）。
15. **积分器的选择。** 仓库里已经有多种写法：
    - Radio：每帧只积一步，dt ≤ 24ms；宽高刚度乘 1.12；emerge 相位刚度乘 0.62；
    - `use-thumb-jelly.ts`：只对缩放积分；
    - `use-tooltip-motion.ts`：dt ≤ 32ms；
    - `liquid/src/observer.ts:398`：私有的分步积分器；
    - `liquid/src/spring.ts` 的 `springSteps`：**目前是未提交的改动**，属于并行进行中的 fusion-surface 工作，按 1/240s 分步，带质量；
    - 以及 `resolveTransition` 的 CSS `linear()` 编译器，spec 规定整个库只能有这一个编译器。

    `jelly.test.ts` 只钉住 `jellyScale`，不管积分器。`jelly.ts:7-9` 说 Radio 的手感是基准。换积分器会改变 Radio 现在的手感。
16. **目标变化的频率不同。** SidebarNav 的目标跟随悬停，指针划过的每一行都会改一次目标，所以「运动途中换目标」是它的常态。FlatRadio 和 Radio 支持方向键连按，TabBar 只有点击。只有 Radio 有拖拽。多选模式下的 FlatRadio 和 `indicator="none"` 的 TabBar 都没有指示器节点，引擎需要能处于空转状态。
17. **暗色判断。** 如果把 glass 的外观也搬进引擎，就要在两种判断之间选一种：Radio 只看 OS 偏好（`radio-group-indicator.ts:72-83`），Slider 先看 `.dark` 类和 `data-theme`（`TxSlider.vue:203-210`）。

---

## Caveats / Not Found

- **本任务没有在真实浏览器里观测。** 探针全部跑在 jsdom 里（`getBoundingClientRect` 恒为 0，只有打桩的数值有意义），画面效果需要用 ego 在 nexus 画廊实测。探针配置和用例放在 `/private/tmp/indicator-probe/`（`vitest.config.mjs`、`probe.test.ts`、`radio.test.ts`、`tabbar2.test.ts`），运行方式是在 `packages/tuffex` 下执行 `node node_modules/vitest/vitest.mjs run --config /private/tmp/indicator-probe/vitest.config.mjs`，只读，没有碰仓库。
- `liquid/src/spring.ts` 在工作区里有未提交的修改（新增 `springSteps`，另有未跟踪的 `C/fusion-surface/`、`C/liquid/__tests__/spring.test.ts`），属于并行会话；HEAD 里没有 `springSteps`。
- 代码注释与事实不符：`use-indicator-box.ts:40-41` 和 `C/sidebar-nav/index.ts:32-33` 说 FlatRadio 共用它，实际没有；`vitest.setup.ts:2-6` 说 reduced-motion 默认命中，实际是 `false`；`tab-bar.test.ts:125-126` 说「jsdom 什么都测不到，所以 box 保持 null」，实际原因是时序：一个微任务之后 box 就会变成 `{0,0,0,0}`。
- 没有找到任何 plugin，也没有找到 `packages/*` 里除 tuffex 之外的包使用这四个组件或 `useIndicatorBox` / `jellyScale`。
- TxTabs（`C/tabs/src/TxTabs.vue`）有另一套基于 keyframes 的指示器，外加 `indicatorRevealed`（88、417-436），属于兄弟任务 `09-25-tabs-indicator-redo` 的范围，这里没有展开。
