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
<script setup lang="ts">
import { ref } from 'vue'

const active = ref<'a' | 'b'>('a')
</script>

<template>
  <TxAutoSizer :width="false" :height="true" :duration-ms="250" outer-class="overflow-hidden">
    <div v-if="active === 'a'">...</div>
    <div v-else>...</div>
  </TxAutoSizer>
</template>
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
<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)
</script>

<template>
  <TxAutoSizer :width="true" :height="false" outer-class="overflow-hidden">
    <TxButton :loading="loading" variant="primary">Submit</TxButton>
  </TxAutoSizer>
</template>
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
