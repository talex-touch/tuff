# AutoSizer 自适应尺寸

用于让容器在内容变化时自动跟随宽/高，并带过渡动画。

典型场景：

- Tabs 切换内容时外层高度平滑过渡
- Button 在 `loading` 状态切换时宽度平滑过渡

> 实现基于 `ResizeObserver`。当内容中包含图片/异步渲染导致尺寸再次变化时，会自动触发重新测量。

<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)
const active = ref<'a' | 'b'>('a')
const wide = ref(false)
const ddOpen = ref(false)
const ddMode = ref<'short' | 'long'>('short')
const dialogMode = ref<'short' | 'long'>('short')
</script>

## 基础用法

### 仅高度（推荐用于 Tabs/Accordion）

<DemoBlock title="AutoSizer height">
<template #preview>
<div style="width: 420px;">
  <div style="display: flex; gap: 8px; margin-bottom: 12px;">
    <TxButton :variant="active === 'a' ? 'primary' : 'secondary'" @click="active = 'a'">Tab A</TxButton>
    <TxButton :variant="active === 'b' ? 'primary' : 'secondary'" @click="active = 'b'">Tab B</TxButton>
  </div>

  <TxAutoSizer :width="false" :height="true" :duration-ms="250" outer-class="overflow-hidden" style="border: 1px solid var(--tx-border-color); border-radius: 12px; padding: 12px;">
    <div v-if="active === 'a'">
      <div style="font-weight: 600; margin-bottom: 8px;">Tab A</div>
      <div style="color: var(--tx-text-color-secondary);">Short content.</div>
    </div>
    <div v-else>
      <div style="font-weight: 600; margin-bottom: 8px;">Tab B</div>
      <div style="color: var(--tx-text-color-secondary); line-height: 1.6;">
        Long content. Long content. Long content. Long content. Long content. Long content.
      </div>
      <div style="height: 24px;"></div>
      <div style="color: var(--tx-text-color-secondary); line-height: 1.6;">
        More lines. More lines. More lines.
      </div>
    </div>
  </TxAutoSizer>
</div>
</template>

<template #code>
```vue
&lt;script setup lang="ts"&gt;
import { ref } from 'vue'

const active = ref<'a' | 'b'>('a')
&lt;/script&gt;

&lt;template&gt;
  <TxAutoSizer :width="false" :height="true" :duration-ms="250" outer-class="overflow-hidden">
    <div v-if="active === 'a'">...</div>
    <div v-else>...</div>
  </TxAutoSizer>
&lt;/template&gt;
```
</template>
</DemoBlock>

### 宽度跟随（在 flex 容器内）

> 当 AutoSizer 处于 flex item 且父容器把它 `flex: 1` 或者 `width: 100%` 撑满时，看起来就像“没跟随内容”。

<DemoBlock title="AutoSizer width in flex">
<template #preview>
<div style="width: 520px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--tx-border-color); border-radius: 12px; padding: 12px;">
  <TxButton @click="wide = !wide">Toggle</TxButton>

  <TxAutoSizer :width="true" :height="false" outer-class="overflow-hidden">
    <TxButton variant="secondary">{{ wide ? 'Very very long label' : 'Short' }}</TxButton>
  </TxAutoSizer>

  <div style="flex: 1; text-align: right; color: var(--tx-text-color-secondary);">
    Right Area
  </div>
</div>
</template>

<template #code>
```vue
&lt;script setup lang="ts"&gt;
import { ref } from 'vue'

const wide = ref(false)
&lt;/script&gt;

&lt;template&gt;
  <div style="display: flex; align-items: center; gap: 12px;">
    <TxButton @click="wide = !wide">Toggle</TxButton>

    <TxAutoSizer :width="true" :height="false">
      <TxButton variant="secondary">{{ wide ? 'Very very long label' : 'Short' }}</TxButton>
    </TxAutoSizer>
  </div>
&lt;/template&gt;
```
</template>
</DemoBlock>

### 下拉内容高度跟随（用于筛选/搜索）

<DemoBlock title="AutoSizer height for dropdown">
<template #preview>
<div style="display: flex; gap: 8px; align-items: center;">
  <TxButton @click="ddOpen = !ddOpen">Toggle dropdown</TxButton>
  <TxButton @click="ddMode = ddMode === 'short' ? 'long' : 'short'">Toggle items</TxButton>
</div>

<div style="height: 10px;"></div>

<div style="width: 320px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
  <div style="padding: 10px 12px; font-weight: 600;">Dropdown Panel (mock)</div>
  <TxAutoSizer :width="false" :height="true" outer-class="overflow-hidden" style="padding: 8px 12px;">
    <div v-if="ddOpen" style="display: flex; flex-direction: column; gap: 8px;">
      <TxButton variant="secondary" style="justify-content: flex-start;">Item A</TxButton>
      <TxButton variant="secondary" style="justify-content: flex-start;">Item B</TxButton>
      <TxButton v-if="ddMode === 'long'" variant="secondary" style="justify-content: flex-start;">Item C</TxButton>
      <TxButton v-if="ddMode === 'long'" variant="secondary" style="justify-content: flex-start;">Item D</TxButton>
      <TxButton v-if="ddMode === 'long'" variant="secondary" style="justify-content: flex-start;">Item E</TxButton>
    </div>
  </TxAutoSizer>
</div>
</template>

<template #code>
```vue
&lt;script setup lang="ts"&gt;
import { ref } from 'vue'

const ddOpen = ref(false)
const ddMode = ref<'short' | 'long'>('short')
&lt;/script&gt;

&lt;template&gt;
  <TxAutoSizer :width="false" :height="true" outer-class="overflow-hidden">
    <div v-if="ddOpen">
      <div>Item A</div>
      <div>Item B</div>
      <div v-if="ddMode === 'long'">Item C</div>
    </div>
  </TxAutoSizer>
&lt;/template&gt;
```
</template>
</DemoBlock>

### 弹框内容高度跟随（模拟）

<DemoBlock title="AutoSizer height for dialog">
<template #preview>
<div style="display: flex; gap: 8px; align-items: center;">
  <TxButton @click="dialogMode = dialogMode === 'short' ? 'long' : 'short'">Toggle content</TxButton>
</div>

<div style="height: 10px;"></div>

<div style="width: 420px; border: 1px solid var(--tx-border-color); border-radius: 16px; overflow: hidden;">
  <div style="padding: 12px 14px; font-weight: 600;">Dialog (mock)</div>
  <TxAutoSizer :width="false" :height="true" outer-class="overflow-hidden" style="padding: 12px 14px;">
    <div v-if="dialogMode === 'short'" style="color: var(--tx-text-color-secondary); line-height: 1.6;">
      Short content.
    </div>
    <div v-else style="color: var(--tx-text-color-secondary); line-height: 1.6;">
      Long content. Long content. Long content. Long content. Long content.
      <div style="height: 12px;"></div>
      More lines. More lines. More lines.
    </div>
  </TxAutoSizer>
  <div style="padding: 12px 14px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--tx-border-color);">
    <TxButton variant="secondary">Cancel</TxButton>
    <TxButton variant="primary">Confirm</TxButton>
  </div>
</div>
</template>

<template #code>
```vue
&lt;script setup lang="ts"&gt;
import { ref } from 'vue'

const dialogMode = ref<'short' | 'long'>('short')
&lt;/script&gt;

&lt;template&gt;
  <div class="dialog">
    <TxAutoSizer :width="false" :height="true" outer-class="overflow-hidden">
      <div v-if="dialogMode === 'short'">Short content.</div>
      <div v-else>Long content...</div>
    </TxAutoSizer>
  </div>
&lt;/template&gt;
```
</template>
</DemoBlock>

### 仅宽度（推荐用于 Button 内容变化）

<DemoBlock title="AutoSizer width">
<template #preview>
<div style="display: flex; flex-direction: column; gap: 10px;">
  <TxButton @click="loading = !loading">Toggle loading</TxButton>

  <TxAutoSizer :width="true" :height="false" outer-class="overflow-hidden">
    <TxButton :loading="loading" variant="primary">Submit</TxButton>
  </TxAutoSizer>
</div>
</template>

<template #code>
```vue
&lt;script setup lang="ts"&gt;
import { ref } from 'vue'

const loading = ref(false)
&lt;/script&gt;

&lt;template&gt;
  <TxAutoSizer :width="true" :height="false" outer-class="overflow-hidden">
    <TxButton :loading="loading" variant="primary">Submit</TxButton>
  </TxAutoSizer>
&lt;/template&gt;
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `as` | `string` | `div` | outer 渲染标签 |
| `innerAs` | `string` | `div` | inner 渲染标签 |
| `width` | `boolean` | `true` | 是否同步宽度 |
| `height` | `boolean` | `true` | 是否同步高度 |
| `inline` | `boolean` | - | 是否使用 shrink-to-content（默认仅在 `width=true && height=false` 时启用） |
| `durationMs` | `number` | `200` | 过渡时长(ms) |
| `easing` | `string` | `ease` | 过渡曲线 |
| `outerClass` | `string` | `overflow-hidden` | outer class |
| `innerClass` | `string` | - | inner class |
| `rounding` | `'none' \| 'round' \| 'floor' \| 'ceil'` | `ceil` | 测量值取整策略 |
| `immediate` | `boolean` | `true` | mount 后是否立即测量 |
| `rafBatch` | `boolean` | `true` | 是否使用 rAF 合并测量 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `refresh()` | `() => Promise<void>` | 手动触发重新测量 |
| `flip(action)` | `(action: () => void \| Promise<void>) => Promise<void>` | 以 action 触发一次尺寸过渡（适合 Tabs 切换/明确动作） |
| `size` | `Ref<{ width: number; height: number } \| null>` | 最新测量结果 |
