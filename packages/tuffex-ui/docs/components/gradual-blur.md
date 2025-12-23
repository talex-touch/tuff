# GradualBlur 渐变模糊

用于在容器边缘叠加多层 `backdrop-filter: blur(...)`，实现从清晰到模糊的渐变过渡。

<script setup lang="ts">
import { ref } from 'vue'

const scrollAnimatedDone = ref(false)

function handleScrollAnimatedDone() {
  scrollAnimatedDone.value = true
  setTimeout(() => {
    scrollAnimatedDone.value = false
  }, 1200)
}
</script>

## 基础用法

<DemoBlock title="GradualBlur">
<template #preview>
<section style="position: relative; height: 320px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
  <div style="height: 100%; overflow-y: auto; padding: 2rem 1rem; background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0));">
    <div style="font-weight: 600; margin-bottom: 8px;">Scrollable Content</div>
    <div style="color: var(--tx-text-color-secondary); line-height: 1.7;">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      <div style="height: 16px;"></div>
      Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      <div style="height: 16px;"></div>
      Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
      <div style="height: 16px;"></div>
      Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      <div style="height: 16px;"></div>
      More lines. More lines. More lines. More lines. More lines.
      <div style="height: 120px;"></div>
      Bottom.
    </div>
  </div>

  <TxGradualBlur
    target="parent"
    position="bottom"
    height="6rem"
    :strength="2"
    :div-count="5"
    curve="bezier"
    :exponential="true"
    :opacity="1"
  />
</section>
</template>

<template #code>
```vue
<template>
  <section style="position: relative; height: 500px; overflow: hidden;">
    <div style="height: 100%; overflow-y: auto; padding: 6rem 2rem;">
      <!-- Content Here - such as an image or text -->
    </div>

    <TxGradualBlur
      target="parent"
      position="bottom"
      height="6rem"
      :strength="2"
      :div-count="5"
      curve="bezier"
      :exponential="true"
      :opacity="1"
    />
  </section>
</template>
```
</template>
</DemoBlock>

## 方向（Top / Bottom / Left / Right）

<DemoBlock title="Positions">
<template #preview>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 620px;">
  <section style="position: relative; height: 220px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(180deg, rgba(125,211,252,.24), rgba(255,255,255,0));">
    <div style="height: 100%; overflow-y: auto; padding: 1.4rem 1.2rem; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
        <span>Top fade</span>
        <span style="font-size: 20px;">↑</span>
      </div>
      <p style="color: var(--tx-text-color-secondary); line-height: 1.6; margin: 0;">
        Headline content stays sharp，向上滚动时才看到模糊层。
      </p>
      <div style="height: 160px;"></div>
      <p style="color: var(--tx-text-color-secondary); margin: 0;">End.</p>
    </div>
    <TxGradualBlur position="top" height="4.5rem" :strength="2.2" :div-count="6" curve="ease-out" />
  </section>

  <section style="position: relative; height: 220px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(180deg, rgba(168,85,247,.08), rgba(255,255,255,0));">
    <div style="height: 100%; overflow-y: auto; padding: 1.4rem 1.2rem; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
        <span>Bottom fade</span>
        <span style="font-size: 20px;">↓</span>
      </div>
      <p style="color: var(--tx-text-color-secondary); line-height: 1.6; margin: 0;">
        适合卡片底部补强，底部 CTA 始终可读。
      </p>
      <div style="height: 200px;"></div>
      <p style="color: var(--tx-text-color-secondary); margin: 0;">End.</p>
    </div>
    <TxGradualBlur position="bottom" height="5rem" :strength="2.2" :div-count="6" curve="ease-out" />
  </section>

  <section style="position: relative; height: 200px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(90deg, rgba(14,165,233,.06), rgba(255,255,255,0));">
    <div style="height: 100%; overflow-y: auto; padding: 1.2rem; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
        <span>Left pane</span>
        <span style="font-size: 20px;">←</span>
      </div>
      <p style="color: var(--tx-text-color-secondary); line-height: 1.5; margin: 0;">
        侧边栏文字 + 图标列表，模糊处理外侧图片。
      </p>
      <div style="flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
        <div style="height: 48px; border-radius: 8px; background: rgba(125,211,252,.35);"></div>
        <div style="height: 48px; border-radius: 8px; background: rgba(59,130,246,.25);"></div>
        <div style="height: 48px; border-radius: 8px; background: rgba(37,99,235,.25);"></div>
      </div>
    </div>
    <TxGradualBlur position="left" width="5rem" :strength="2.5" :div-count="7" curve="bezier" />
  </section>

  <section style="position: relative; height: 200px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(90deg, rgba(236,72,153,.08), rgba(255,255,255,0));">
    <div style="height: 100%; overflow-y: auto; padding: 1.2rem; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
        <span>Right pane</span>
        <span style="font-size: 20px;">→</span>
      </div>
      <p style="color: var(--tx-text-color-secondary); line-height: 1.5; margin: 0;">
        可保护右侧媒体或聊天面板，避免抢占焦点。
      </p>
      <div style="flex: 1; display: flex; gap: 6px;">
        <div style="flex: 1; border-radius: 10px; background: rgba(248,113,113,.15);"></div>
        <div style="flex: 1; border-radius: 10px; background: rgba(251,146,60,.15);"></div>
      </div>
    </div>
    <TxGradualBlur position="right" width="5rem" :strength="2.5" :div-count="7" curve="bezier" />
  </section>
</div>
</template>

<template #code>
```vue
<template>
  <section style="position: relative; overflow: hidden;">
    <TxGradualBlur position="top" height="4.5rem" />
  </section>
  <section style="position: relative; overflow: hidden;">
    <TxGradualBlur position="left" width="5rem" />
  </section>
</template>
```
</template>
</DemoBlock>

## Preset 预设

<DemoBlock title="Presets">
<template #preview>
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 640px;">
  <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1rem;">
      <div style="font-weight: 600;">subtle</div>
      <div style="height: 120px;"></div>
    </div>
    <TxGradualBlur preset="subtle" />
  </section>

  <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1rem;">
      <div style="font-weight: 600;">intense</div>
      <div style="height: 120px;"></div>
    </div>
    <TxGradualBlur preset="intense" />
  </section>

  <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1rem;">
      <div style="font-weight: 600;">smooth</div>
      <div style="height: 120px;"></div>
    </div>
    <TxGradualBlur preset="smooth" />
  </section>

  <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1rem;">
      <div style="font-weight: 600;">sharp</div>
      <div style="height: 120px;"></div>
    </div>
    <TxGradualBlur preset="sharp" />
  </section>

  <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1rem;">
      <div style="font-weight: 600;">header</div>
      <div style="height: 120px;"></div>
    </div>
    <TxGradualBlur preset="header" />
  </section>

  <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1rem;">
      <div style="font-weight: 600;">footer</div>
      <div style="height: 120px;"></div>
    </div>
    <TxGradualBlur preset="footer" />
  </section>
</div>
</template>

<template #code>
```vue
<template>
  <section style="position: relative; overflow: hidden;">
    <div style="height: 100%; overflow-y: auto;">...</div>
    <TxGradualBlur preset="subtle" />
  </section>

  <section style="position: relative; overflow: hidden;">
    <div style="height: 100%; overflow-y: auto;">...</div>
    <TxGradualBlur preset="intense" />
  </section>
</template>
```
</template>
</DemoBlock>

## Hover 强度增强（hoverIntensity）

<DemoBlock title="HoverIntensity">
<template #preview>
<section style="position: relative; height: 220px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
  <div style="height: 100%; overflow-y: auto; padding: 1.25rem 1rem;">
    <div style="font-weight: 600; margin-bottom: 8px;">Hover the blurred area</div>
    <div style="color: var(--tx-text-color-secondary); line-height: 1.7;">
      When hoverIntensity is provided, the blur overlay will accept pointer events.
      <div style="height: 220px;"></div>
      End.
    </div>
  </div>

  <TxGradualBlur
    position="bottom"
    height="6rem"
    :strength="2"
    :div-count="6"
    curve="bezier"
    :hover-intensity="1.8"
    :exponential="true"
  />
</section>
</template>

<template #code>
```vue
<template>
  <section style="position: relative; height: 220px; overflow: hidden;">
    <div style="height: 100%; overflow-y: auto;">...</div>
    <TxGradualBlur position="bottom" height="6rem" :hover-intensity="1.8" />
  </section>
</template>
```
</template>
</DemoBlock>

## 进入视口触发（animated="scroll"）

<DemoBlock title="Animated scroll">
<template #preview>
<GradualBlurAnimatedDemo />
</template>

<template #code>
```vue
<template>
  <GradualBlurAnimatedDemo />
</template>
```
</template>
</DemoBlock>

## Page 目标（target="page"）

<DemoBlock title="Target page">
<template #preview>
<div style="position: relative; height: 220px; border-radius: 12px; border: 1px solid var(--tx-border-color); overflow: hidden;">
  <div style="padding: 1rem; color: var(--tx-text-color-secondary);">
    This box only exists to show a fixed blur overlay.
  </div>

  <TxGradualBlur
    target="page"
    preset="page-footer"
    :div-count="8"
    :exponential="true"
    :opacity="1"
    :strength="2.5"
    :z-index="9999"
    :style="{ left: 0, right: 0 }"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxGradualBlur target="page" preset="page-footer" :z-index="9999" />
</template>
```
</template>
</DemoBlock>

## 响应式尺寸（responsive）

<DemoBlock title="Responsive sizes">
<template #preview>
<section style="position: relative; height: 220px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
  <div style="height: 100%; overflow-y: auto; padding: 1.25rem 1rem;">
    <div style="font-weight: 600; margin-bottom: 8px;">Resize window to see height changes</div>
    <div style="color: var(--tx-text-color-secondary); line-height: 1.7;">
      desktop/tablet/mobile heights can be configured.
      <div style="height: 220px;"></div>
      End.
    </div>
  </div>

  <TxGradualBlur
    position="bottom"
    :strength="2"
    responsive
    height="6rem"
    mobile-height="4rem"
    tablet-height="5rem"
    desktop-height="7rem"
  />
</section>
</template>

<template #code>
```vue
<template>
  <section style="position: relative; overflow: hidden;">
    <div style="height: 100%; overflow-y: auto;">...</div>
    <TxGradualBlur
      responsive
      height="6rem"
      mobile-height="4rem"
      tablet-height="5rem"
      desktop-height="7rem"
    />
  </section>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `position` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'bottom'` | 模糊方向 |
| `strength` | `number` | `2` | 模糊强度（倍数） |
| `height` | `string` | `'6rem'` | 垂直方向尺寸（top/bottom） |
| `width` | `string` | - | 水平方向尺寸（left/right） |
| `divCount` | `number` | `5` | 分层数量 |
| `exponential` | `boolean` | `false` | 是否指数增强模糊强度 |
| `curve` | `'linear' \| 'bezier' \| 'ease-in' \| 'ease-out' \| 'ease-in-out'` | `'linear'` | 分层强度曲线 |
| `opacity` | `number` | `1` | 整体透明度 |
| `animated` | `boolean \| 'scroll'` | `false` | 是否启用过渡/滚动触发 |
| `duration` | `string` | `'0.3s'` | 动画时长 |
| `easing` | `string` | `'ease-out'` | 动画曲线 |
| `zIndex` | `number` | `1000` | 层级 |
| `target` | `'parent' \| 'page'` | `'parent'` | 定位目标：父容器/页面 |
| `hoverIntensity` | `number` | - | hover 时强度倍率（启用后组件接收 pointer events） |
| `responsive` | `boolean` | `false` | 是否根据窗口宽度切换尺寸 |
| `mobileHeight` | `string` | - | `responsive` 模式下移动端 height |
| `tabletHeight` | `string` | - | `responsive` 模式下平板 height |
| `desktopHeight` | `string` | - | `responsive` 模式下桌面端 height |
| `mobileWidth` | `string` | - | `responsive` 模式下移动端 width |
| `tabletWidth` | `string` | - | `responsive` 模式下平板 width |
| `desktopWidth` | `string` | - | `responsive` 模式下桌面端 width |
| `preset` | `'top' \| 'bottom' \| 'left' \| 'right' \| 'subtle' \| 'intense' \| 'smooth' \| 'sharp' \| 'header' \| 'footer' \| 'sidebar' \| 'page-header' \| 'page-footer'` | - | 预设组合 |
| `gpuOptimized` | `boolean` | `false` | 开启后会加 `translateZ(0)` / `will-change` 以优化渲染 |
| `onAnimationComplete` | `() => void` | - | `animated="scroll"` 进入可见区域且动画完成后回调 |
| `className` | `string` | `''` | 额外 class |
| `style` | `CSSProperties` | `{}` | 额外 style |

## 使用建议

- **[容器定位]** `target="parent"` 时父容器建议 `position: relative`，并配合 `overflow: hidden` 来裁切边缘。
- **[兼容性]** 依赖 `backdrop-filter`，不同浏览器表现会略有差异。
