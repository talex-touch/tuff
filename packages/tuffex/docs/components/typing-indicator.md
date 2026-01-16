# TypingIndicator 打字中

用于展示 AI 正在回复的状态。

<script setup lang="ts">
import TypingIndicatorVariantsDemo from '../.vitepress/theme/components/demos/TypingIndicatorVariantsDemo.vue'
import TypingIndicatorVariantsDemoSource from '../.vitepress/theme/components/demos/TypingIndicatorVariantsDemo.vue?raw'
</script>

<DemoBlock title="TypingIndicator">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxTypingIndicator />
  <TxTypingIndicator text="Thinking…" />
  <TxTypingIndicator :show-text="false" />
</div>
</template>

<template #code>
```vue
<template>
  <TxTypingIndicator />
</template>
```
</template>
</DemoBlock>

## 变体

<DemoBlock title="TypingIndicator variants" :code="TypingIndicatorVariantsDemoSource">
  <template #preview>
    <TypingIndicatorVariantsDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `variant` | `'dots' \| 'ai' \| 'pure' \| 'ring' \| 'circle-dash' \| 'bars'` | `'dots'` | 样式变体 |
| `text` | `string` | `'Typing…'` | 文案 |
| `showText` | `boolean` | `true` | 是否显示文案 |
| `size` | `number` | `6` | dots 模式点尺寸(px) |
| `gap` | `number` | `5` | dots 模式间距(px) |
| `loaderSize` | `number` | `44` | ai 模式尺寸(px) |
| `pureSize` | `number` | `14` | pure 模式尺寸(px) |
| `ringSize` | `number` | `18` | ring 模式尺寸(px) |
| `ringThickness` | `number` | `2` | ring 模式线宽(px) |
| `circleDashSize` | `number` | `18` | circle-dash 模式尺寸(px) |
| `circleDashThickness` | `number` | `2` | circle-dash 模式线宽(px) |
| `circleDashDashDeg` | `number` | `12` | circle-dash 模式 dash 角度(deg) |
| `circleDashGapDeg` | `number` | `12` | circle-dash 模式 gap 角度(deg) |
| `barsSize` | `number` | `12` | bars 模式高度(px) |
