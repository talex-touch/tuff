# GradualBlur 渐变模糊

用于在容器边缘叠加多层 `backdrop-filter: blur(...)`，实现从清晰到模糊的渐变过渡。

<script setup lang="ts">
import GradualBlurBasicDemo from '../.vitepress/theme/components/demos/GradualBlurBasicDemo.vue'
import GradualBlurBasicDemoSource from '../.vitepress/theme/components/demos/GradualBlurBasicDemo.vue?raw'

import GradualBlurPositionsDemo from '../.vitepress/theme/components/demos/GradualBlurPositionsDemo.vue'
import GradualBlurPositionsDemoSource from '../.vitepress/theme/components/demos/GradualBlurPositionsDemo.vue?raw'

import GradualBlurPresetsDemo from '../.vitepress/theme/components/demos/GradualBlurPresetsDemo.vue'
import GradualBlurPresetsDemoSource from '../.vitepress/theme/components/demos/GradualBlurPresetsDemo.vue?raw'

import GradualBlurHoverIntensityDemo from '../.vitepress/theme/components/demos/GradualBlurHoverIntensityDemo.vue'
import GradualBlurHoverIntensityDemoSource from '../.vitepress/theme/components/demos/GradualBlurHoverIntensityDemo.vue?raw'

import GradualBlurAnimatedScrollDemo from '../.vitepress/theme/components/demos/GradualBlurAnimatedScrollDemo.vue'
import GradualBlurAnimatedScrollDemoSource from '../.vitepress/theme/components/demos/GradualBlurAnimatedScrollDemo.vue?raw'

import GradualBlurTargetPageDemo from '../.vitepress/theme/components/demos/GradualBlurTargetPageDemo.vue'
import GradualBlurTargetPageDemoSource from '../.vitepress/theme/components/demos/GradualBlurTargetPageDemo.vue?raw'

import GradualBlurResponsiveDemo from '../.vitepress/theme/components/demos/GradualBlurResponsiveDemo.vue'
import GradualBlurResponsiveDemoSource from '../.vitepress/theme/components/demos/GradualBlurResponsiveDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="GradualBlur" :code="GradualBlurBasicDemoSource">
  <template #preview>
    <GradualBlurBasicDemo />
  </template>
</DemoBlock>

## 方向（Top / Bottom / Left / Right）

<DemoBlock title="Positions" :code="GradualBlurPositionsDemoSource">
  <template #preview>
    <GradualBlurPositionsDemo />
  </template>
</DemoBlock>

## Preset 预设

<DemoBlock title="Presets" :code="GradualBlurPresetsDemoSource">
  <template #preview>
    <GradualBlurPresetsDemo />
  </template>
</DemoBlock>

## Hover 强度增强（hoverIntensity）

<DemoBlock title="HoverIntensity" :code="GradualBlurHoverIntensityDemoSource">
  <template #preview>
    <GradualBlurHoverIntensityDemo />
  </template>
</DemoBlock>

## 进入视口触发（animated="scroll"）

<DemoBlock title="Animated scroll" :code="GradualBlurAnimatedScrollDemoSource">
  <template #preview>
    <GradualBlurAnimatedScrollDemo />
  </template>
</DemoBlock>

## Page 目标（target="page"）

<DemoBlock title="Target page" :code="GradualBlurTargetPageDemoSource">
  <template #preview>
    <GradualBlurTargetPageDemo />
  </template>
</DemoBlock>

## 响应式尺寸（responsive）

<DemoBlock title="Responsive sizes" :code="GradualBlurResponsiveDemoSource">
  <template #preview>
    <GradualBlurResponsiveDemo />
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
