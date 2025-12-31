# ProgressBar 进度条

多功能进度条组件，支持加载、错误和成功状态。

<script setup lang="ts">
import ProgressBarMaskVariantsDemo from '../.vitepress/theme/components/demos/ProgressBarMaskVariantsDemo.vue'
import ProgressBarMaskVariantsDemoSource from '../.vitepress/theme/components/demos/ProgressBarMaskVariantsDemo.vue?raw'

import ProgressBarMaskBackgroundDemo from '../.vitepress/theme/components/demos/ProgressBarMaskBackgroundDemo.vue'
import ProgressBarMaskBackgroundDemoSource from '../.vitepress/theme/components/demos/ProgressBarMaskBackgroundDemo.vue?raw'

import ProgressBarIndeterminateVariantsDemo from '../.vitepress/theme/components/demos/ProgressBarIndeterminateVariantsDemo.vue'
import ProgressBarIndeterminateVariantsDemoSource from '../.vitepress/theme/components/demos/ProgressBarIndeterminateVariantsDemo.vue?raw'

import ProgressBarFlowEffectsDemo from '../.vitepress/theme/components/demos/ProgressBarFlowEffectsDemo.vue'
import ProgressBarFlowEffectsDemoSource from '../.vitepress/theme/components/demos/ProgressBarFlowEffectsDemo.vue?raw'

import ProgressBarIndicatorSparkleDemo from '../.vitepress/theme/components/demos/ProgressBarIndicatorSparkleDemo.vue'
import ProgressBarIndicatorSparkleDemoSource from '../.vitepress/theme/components/demos/ProgressBarIndicatorSparkleDemo.vue?raw'

import ProgressBarSegmentsDemo from '../.vitepress/theme/components/demos/ProgressBarSegmentsDemo.vue'
import ProgressBarSegmentsDemoSource from '../.vitepress/theme/components/demos/ProgressBarSegmentsDemo.vue?raw'

import ProgressBarHeightsDemo from '../.vitepress/theme/components/demos/ProgressBarHeightsDemo.vue'
import ProgressBarHeightsDemoSource from '../.vitepress/theme/components/demos/ProgressBarHeightsDemo.vue?raw'

import ProgressBarDebuggerDemo from '../.vitepress/theme/components/demos/ProgressBarDebuggerDemo.vue'
import ProgressBarDebuggerDemoSource from '../.vitepress/theme/components/demos/ProgressBarDebuggerDemo.vue?raw'
</script>

## 基础用法

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%;">
    <TxProgressBar :percentage="50" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar :percentage="50" />
</template>
```
:::

## Mask 形态

进度条底部的 track（mask）支持三种形态：`solid` / `dashed` / `plain`。

<DemoBlock title="Mask variants" :code="ProgressBarMaskVariantsDemoSource">
<template #preview>
<ProgressBarMaskVariantsDemo />
</template>
</DemoBlock>

## Mask 背景效果

`maskBackground` 控制 mask 的背景展示方式：`mask` / `blur` / `glass`。

<DemoBlock title="Mask background" :code="ProgressBarMaskBackgroundDemoSource">
<template #preview>
<ProgressBarMaskBackgroundDemo />
</template>
</DemoBlock>

## 加载状态

显示不确定进度的加载动画。

<DemoBlock title="Indeterminate variants" :code="ProgressBarIndeterminateVariantsDemoSource">
<template #preview>
<ProgressBarIndeterminateVariantsDemo />
</template>
</DemoBlock>

## 调试器

用于快速对比不同 `mask* / indeterminateVariant / flowEffect / indicatorEffect / hoverEffect` 组合。

<DemoBlock title="ProgressBar debugger" :code="ProgressBarDebuggerDemoSource">
<template #preview>
<ProgressBarDebuggerDemo />
</template>
</DemoBlock>

## 百分比进度

显示确定进度和百分比。

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%; gap: 16px;">
    <TxProgressBar :percentage="25" show-text />
    <TxProgressBar :percentage="50" show-text />
    <TxProgressBar :percentage="75" show-text />
    <TxProgressBar :percentage="100" show-text />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar :percentage="progress" show-text />
</template>
```
:::

## 状态

### 成功状态

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%;">
    <TxProgressBar success message="上传完成！" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar success message="上传完成！" />
</template>
```
:::

### 错误状态

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%;">
    <TxProgressBar error message="上传失败" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar error message="上传失败" />
</template>
```
:::

## 自定义高度

<DemoBlock title="Heights" :code="ProgressBarHeightsDemoSource">
<template #preview>
<ProgressBarHeightsDemo />
</template>
</DemoBlock>

## 自定义颜色

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%; gap: 16px;">
    <TxProgressBar :percentage="60" color="#ff6b6b" />
    <TxProgressBar :percentage="80" color="linear-gradient(to right, #667eea, #764ba2)" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar :percentage="60" color="#ff6b6b" />
  <TxProgressBar :percentage="80" color="linear-gradient(to right, #667eea, #764ba2)" />
</template>
```
:::

## 多段进度

<DemoBlock title="Segments" :code="ProgressBarSegmentsDemoSource">
<template #preview>
<ProgressBarSegmentsDemo />
</template>
</DemoBlock>

## 光波/涌动效果

<DemoBlock title="Flow effects" :code="ProgressBarFlowEffectsDemoSource">
<template #preview>
<ProgressBarFlowEffectsDemo />
</template>
</DemoBlock>

## 指示器特效

<DemoBlock title="Indicator sparkle" :code="ProgressBarIndicatorSparkleDemoSource">
<template #preview>
<ProgressBarIndicatorSparkleDemo />
</template>
</DemoBlock>

## 文件上传示例

文件上传的实际示例。

```vue
<template>
  <div class="upload-container">
    <input type="file" @change="handleFileSelect" />
    
    <TxProgressBar 
      v-if="uploading" 
      :loading="progress === 0"
      :percentage="progress"
      :success="progress === 100"
      :error="uploadError"
      :message="statusMessage"
      show-text
    />
  </div>
</template>
```

## 下载进度示例

```vue
<template>
  <div class="download-item">
    <span>{{ fileName }}</span>
    <TxProgressBar 
      :percentage="downloadProgress" 
      :success="downloadProgress === 100"
      height="4px"
    />
  </div>
</template>
```

## API

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `loading` | `boolean` | `false` | 显示加载动画 |
| `indeterminate` | `boolean` | `false` | 不确定进度动画 |
| `indeterminateVariant` | `'classic' \| 'sweep' \| 'bounce' \| 'elastic' \| 'split'` | `'sweep'` | 不确定进度动画形态 |
| `error` | `boolean` | `false` | 显示错误状态 |
| `success` | `boolean` | `false` | 显示成功状态 |
| `status` | `'success' \| 'error' \| 'warning' \| ''` | `''` | 状态预设（`error/success` 优先） |
| `message` | `string` | `''` | 显示的消息文本 |
| `percentage` | `number` | `0` | 进度百分比 (0-100) |
| `segments` | `ProgressSegment[]` | - | 多段进度（多色） |
| `segmentsTotal` | `number` | `100` | `segments` 的总量基准 |
| `height` | `string` | `'5px'` | 进度条高度 |
| `showText` | `boolean` | `false` | 显示百分比文本 |
| `textPlacement` | `'inside' \| 'outside'` | `'inside'` | 文本位置 |
| `format` | `(percentage: number) => string` | - | 自定义文本格式 |
| `flowEffect` | `'none' \| 'shimmer' \| 'wave' \| 'particles'` | `'none'` | 确定进度的光波/涌动效果 |
| `indicatorEffect` | `'none' \| 'sparkle'` | `'none'` | 进度头部指示器特效 |
| `hoverEffect` | `'none' \| 'glow'` | `'none'` | hover 特效（发光等） |
| `color` | `string` | `''` | 自定义颜色 |
| `maskVariant` | `'solid' \| 'dashed' \| 'plain'` | `'solid'` | 底部 track（mask）形态 |
| `maskBackground` | `'blur' \| 'glass' \| 'mask'` | `'blur'` | mask 背景效果 |
| `tooltip` | `boolean` | `false` | hover 显示 tooltip |
| `tooltipContent` | `string` | - | tooltip 内容（默认用显示文本） |
| `tooltipProps` | `Partial<TooltipProps>` | - | tooltip 扩展参数 |

### 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `complete` | - | 进度达到 100% 时触发 |

### CSS 变量

你可以使用 CSS 变量自定义进度条：

```css
.tx-progress-bar {
  --tx-progress-height: 5px;
  --tx-progress-color: var(--tx-color-primary);
  --tx-progress-width: 100%;
}
```
