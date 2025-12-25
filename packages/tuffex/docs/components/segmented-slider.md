# SegmentedSlider 分段滑块

用于在预定义的离散选项中进行选择的分段滑块组件。

<script setup>
import SegmentedSliderBasicDemo from '../.vitepress/theme/components/demos/SegmentedSliderBasicDemo.vue'
import SegmentedSliderBasicDemoSource from '../.vitepress/theme/components/demos/SegmentedSliderBasicDemo.vue?raw'
import SegmentedSliderCustomDemo from '../.vitepress/theme/components/demos/SegmentedSliderCustomDemo.vue'
import SegmentedSliderCustomDemoSource from '../.vitepress/theme/components/demos/SegmentedSliderCustomDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="SegmentedSlider" :code="SegmentedSliderBasicDemoSource">
  <template #preview>
    <SegmentedSliderBasicDemo />
  </template>
</DemoBlock>

## 自定义选项

<DemoBlock title="SegmentedSlider (custom)" :code="SegmentedSliderCustomDemoSource">
  <template #preview>
    <SegmentedSliderCustomDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `number \| string` | `0` | 当前选中值 |
| `segments` | `SegmentedSliderSegment[]` | `[]` | 分段选项数组 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `showLabels` | `boolean` | `true` | 是否显示标签 |
| `vertical` | `boolean` | `false` | 是否垂直排列 |

### SegmentedSliderSegment

| 属性名 | 类型 | 说明 |
|------|------|------|
| `value` | `number \| string` | 选项值 |
| `label` | `string` | 选项标签（可选） |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(value: number \| string)` | 值变化时触发 |
| `change` | `(value: number \| string)` | 值变化时触发 |
