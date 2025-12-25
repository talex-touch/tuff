# Slider 滑块

用于在区间内选择数值的滑块组件。

<script setup>
import SliderBasicDemo from '../.vitepress/theme/components/demos/SliderBasicDemo.vue'
import SliderBasicDemoSource from '../.vitepress/theme/components/demos/SliderBasicDemo.vue?raw'
import SliderDisabledDemo from '../.vitepress/theme/components/demos/SliderDisabledDemo.vue'
import SliderDisabledDemoSource from '../.vitepress/theme/components/demos/SliderDisabledDemo.vue?raw'
import SliderFormatValueDemo from '../.vitepress/theme/components/demos/SliderFormatValueDemo.vue'
import SliderFormatValueDemoSource from '../.vitepress/theme/components/demos/SliderFormatValueDemo.vue?raw'
import SliderShowValueDemo from '../.vitepress/theme/components/demos/SliderShowValueDemo.vue'
import SliderShowValueDemoSource from '../.vitepress/theme/components/demos/SliderShowValueDemo.vue?raw'
import SliderElasticTooltipDemo from '../.vitepress/theme/components/demos/SliderElasticTooltipDemo.vue'
import ElasticTooltipDemoCode from '../.vitepress/theme/components/demos/SliderElasticTooltipDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="Slider" :code="SliderBasicDemoSource">
  <template #preview>
    <SliderBasicDemo />
  </template>
</DemoBlock>

## 禁用

<DemoBlock title="Slider (disabled)" :code="SliderDisabledDemoSource">
  <template #preview>
    <SliderDisabledDemo />
  </template>
</DemoBlock>

## 格式化显示

<DemoBlock title="Slider (formatValue)" :code="SliderFormatValueDemoSource">
  <template #preview>
    <SliderFormatValueDemo />
  </template>
</DemoBlock>

## 显示数值

<DemoBlock title="Slider (show value)" :code="SliderShowValueDemoSource">
  <template #preview>
    <SliderShowValueDemo />
  </template>
</DemoBlock>

## 弹性 tooltip（速度 + 加速度）

<DemoBlock title="Slider (elastic tooltip)" :code="ElasticTooltipDemoCode">
  <template #preview>
    <SliderElasticTooltipDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `number` | `0` | 当前值 |
| `min` | `number` | `0` | 最小值 |
| `max` | `number` | `100` | 最大值 |
| `step` | `number` | `1` | 步长 |
| `disabled` | `boolean` | `false` | 禁用 |
| `showValue` | `boolean` | `false` | 右侧显示当前值 |
| `formatValue` | `(value: number) => string` | - | 格式化显示值 |
| `showTooltip` | `boolean` | `true` | 是否显示 tooltip |
| `tooltipTrigger` | `'drag' \| 'hover' \| 'always'` | `'drag'` | tooltip 显示触发方式 |
| `tooltipFormatter` | `(value: number) => string` | - | tooltip 文本格式化 |
| `tooltipPlacement` | `'top' \| 'bottom'` | `'top'` | tooltip 位置 |
| `tooltipTilt` | `boolean` | `false` | tooltip 是否启用倾斜与偏移动效 |
| `tooltipTiltMaxDeg` | `number` | `14` | tooltip 最大倾斜角度 |
| `tooltipOffsetMaxPx` | `number` | `18` | tooltip 最大水平偏移 |
| `tooltipAccelBoost` | `number` | `0.35` | 加速度对动效强度的加成 |
| `tooltipSpringStiffness` | `number` | `240` | 弹簧刚度 |
| `tooltipSpringDamping` | `number` | `26` | 弹簧阻尼 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `number` | v-model 更新 |
| `change` | `number` | change 事件 |
