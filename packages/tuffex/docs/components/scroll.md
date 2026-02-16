# Scroll 滚动

基于 `@better-scroll/scroll-bar` 的滚动容器，提供更一致的滚动条体验，并兼容 `TouchScroll` 组件名。

<script setup lang="ts">
import scrollBasicSource from '../.vitepress/theme/components/demos/ScrollBasicDemo.vue?raw'
import scrollHorizontalSource from '../.vitepress/theme/components/demos/ScrollHorizontalDemo.vue?raw'
import scrollBounceScrollbarSource from '../.vitepress/theme/components/demos/ScrollBounceScrollbarDemo.vue?raw'
import scrollChainingSource from '../.vitepress/theme/components/demos/ScrollChainingDemo.vue?raw'
import scrollNativeSource from '../.vitepress/theme/components/demos/ScrollNativeDemo.vue?raw'
import scrollPullDownUpSource from '../.vitepress/theme/components/demos/ScrollPullDownUpDemo.vue?raw'
</script>

## 行为说明

- **BetterScroll 模式**
  - 支持 `bounce`、更一致的滚动条外观
  - 内容/容器变化会自动 `refresh()`（可通过 `refreshOnContentChange` 控制）
- **Native 模式**
  - 使用浏览器原生滚动
  - `direction` 会映射为 `overflow-x/y` 以保持结构一致
  - macOS Safari 直接启用原生滚动
  - 默认在 macOS + Chromium `145+` 自动回退到原生滚动（Chromium 原生已支持）
  - 如需跨环境统一由 BetterScroll 接管，可设置 `unified=true`

## 运行时策略（优先级）

1. `native=true`：始终使用原生滚动（最高优先级）。
2. `unified=true`：始终由 BetterScroll 接管（跨环境统一行为）。
3. 运行在 macOS Safari：直接使用原生滚动。
4. `nativeAutoFallback=true` 且满足 `macOS + Chromium >= 145`：自动使用原生滚动。
5. 其他情况：使用 BetterScroll。

## 基础用法

<DemoBlock title="Scroll" :code="scrollBasicSource" code-lang="vue">
<template #preview>
<ScrollBasicDemo />
</template>
</DemoBlock>

## 方向与滚动条

<DemoBlock title="Scroll (horizontal)" :code="scrollHorizontalSource" code-lang="vue">
<template #preview>
<ScrollHorizontalDemo />
</template>
</DemoBlock>

<DemoBlock title="Scroll (bounce + always show scrollbar)" :code="scrollBounceScrollbarSource" code-lang="vue">
<template #preview>
<ScrollBounceScrollbarDemo />
</template>
</DemoBlock>

## 滚动链（高级 / Scroll Chaining）

默认会阻止内层滚动把外层一起带着滚动（到边界时也不会继续传递）。如果你希望滚到顶/底后继续滚动外层，需要显式开启 `scrollChaining`。

> ⚠️ 不建议默认开启 `scrollChaining`。在复杂嵌套滚动场景中，它容易让用户误判“当前正在滚动哪一层”，仅建议在明确需要父子联动滚动时按需启用。

<DemoBlock title="Scroll (scroll chaining, advanced)" :code="scrollChainingSource" code-lang="vue">
<template #preview>
<ScrollChainingDemo />
</template>
</DemoBlock>

## 使用原生滚动

当你不需要 BetterScroll 行为时，可以切换为原生滚动（仍保持统一容器结构）。

<DemoBlock title="Scroll (native)" :code="scrollNativeSource" code-lang="vue">
<template #preview>
<ScrollNativeDemo />
</template>
</DemoBlock>

## 下拉刷新与上拉加载

- 下拉刷新：设置 `pullDownRefresh`，监听 `@pulling-down`，完成后调用 `finishPullDown()`。
- 上拉加载：设置 `pullUpLoad`，监听 `@pulling-up`，完成后调用 `finishPullUp()`。
- 在 `native=true` 或自动原生回退时，事件为降级触发；`pullDownStop` 仅 BetterScroll 模式生效。

<DemoBlock title="Scroll (pull down + pull up)" :code="scrollPullDownUpSource" code-lang="vue">
<template #preview>
<ScrollPullDownUpDemo />
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `native` | `boolean` | `false` | 使用原生滚动 |
| `unified` | `boolean` | `false` | 强制由 BetterScroll 接管滚动（跨环境统一行为，会覆盖 Safari/Chromium 自动原生；`native=true` 仍优先生效） |
| `nativeAutoFallback` | `boolean` | `true` | 控制 macOS + Chromium `145+` 自动回退原生滚动；不影响 macOS Safari 的原生优先策略 |
| `noPadding` | `boolean` | `false` | 禁用内边距 |
| `scrollChaining` | `boolean` | `false` | 是否允许滚动链（到边界后继续带动父级滚动）；不建议默认开启，仅在明确需要父子联动时启用 |
| `direction` | `'vertical' \| 'horizontal' \| 'both'` | `'vertical'` | 滚动方向 |
| `scrollbar` | `boolean` | `true` | 是否启用 BetterScroll 滚动条 |
| `scrollbarFade` | `boolean` | `true` | 滚动条自动淡出 |
| `scrollbarInteractive` | `boolean` | `true` | 滚动条是否可拖拽 |
| `scrollbarAlwaysVisible` | `boolean` | `false` | 强制滚动条常显（用于 bounce/无边界场景） |
| `scrollbarMinSize` | `number` | `18` | 指示器最小尺寸（px） |
| `probeType` | `0 \| 1 \| 2 \| 3` | `3` | BetterScroll `probeType` |
| `bounce` | `boolean` | `true` | 是否开启边界回弹 |
| `click` | `boolean` | `true` | 是否派发 click（BetterScroll 选项） |
| `wheel` | `boolean` | `true` | 是否拦截滚轮并驱动 BetterScroll |
| `refreshOnContentChange` | `boolean` | `true` | 内容变更时自动 refresh |
| `pullDownRefresh` | `boolean \| Record<string, unknown>` | `false` | 下拉刷新（BetterScroll 模式为原生能力；native 模式为降级触发） |
| `pullDownThreshold` | `number` | `70` | 下拉触发阈值（px） |
| `pullDownStop` | `number` | `56` | 下拉停留距离（px，仅 BetterScroll） |
| `pullUpLoad` | `boolean \| Record<string, unknown>` | `false` | 上拉加载更多（BetterScroll 模式为原生能力；native 模式为降级触发） |
| `pullUpThreshold` | `number` | `0` | 距离底部阈值（px） |
| `options` | `Record<string, unknown>` | `{}` | BetterScroll 初始化参数（兜底，会覆盖部分默认值） |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `scroll` | `{ scrollTop: number; scrollLeft: number }` | 滚动事件 |
| `pulling-down` | - | 触发下拉刷新 |
| `pulling-up` | - | 触发上拉加载更多 |
