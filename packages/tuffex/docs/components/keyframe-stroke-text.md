# KeyframeStrokeText 关键帧描边文字

用于把任意文本渲染为“先描边、后填充”的关键帧动画。

<script setup lang="ts">
import KeyframeStrokeTextBasicDemo from '../.vitepress/theme/components/demos/KeyframeStrokeTextBasicDemo.vue'
import KeyframeStrokeTextBasicDemoSource from '../.vitepress/theme/components/demos/KeyframeStrokeTextBasicDemo.vue?raw'

import KeyframeStrokeTextZhDemo from '../.vitepress/theme/components/demos/KeyframeStrokeTextZhDemo.vue'
import KeyframeStrokeTextZhDemoSource from '../.vitepress/theme/components/demos/KeyframeStrokeTextZhDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="KeyframeStrokeText" :code="KeyframeStrokeTextBasicDemoSource">
  <template #preview>
    <KeyframeStrokeTextBasicDemo />
  </template>
</DemoBlock>

## 中文文案示例

<DemoBlock title="KeyframeStrokeText zh" :code="KeyframeStrokeTextZhDemoSource">
  <template #preview>
    <KeyframeStrokeTextZhDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `text` | `string` | `''` | 要渲染的文本内容 |
| `strokeColor` | `string` | `#4C4CFF` | 描边颜色 |
| `fillColor` | `string` | `#111827` | 填充颜色 |
| `durationMs` | `number` | `1800` | 动画时长(ms) |
| `strokeWidth` | `number` | `2` | 描边宽度 |
| `fontSize` | `string \| number` | `64` | 字号 |
| `fontWeight` | `string \| number` | `700` | 字重 |
| `fontFamily` | `string` | `inherit` | 字体族 |
