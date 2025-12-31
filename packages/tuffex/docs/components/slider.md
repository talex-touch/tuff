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
import SliderElasticTooltipCompareDemo from '../.vitepress/theme/components/demos/SliderElasticTooltipCompareDemo.vue'
import ElasticTooltipCompareDemoCode from '../.vitepress/theme/components/demos/SliderElasticTooltipCompareDemo.vue?raw'
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

<DemoBlock title="Slider (elastic tooltip)" :code="ElasticTooltipCompareDemoCode">
  <template #preview>
    <SliderElasticTooltipCompareDemo />
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
| `tooltipTiltMaxDeg` | `number` | `18` | tooltip 最大倾斜角度 |
| `tooltipOffsetMaxPx` | `number` | `28` | tooltip 最大水平偏移 |
| `tooltipAccelBoost` | `number` | `0.65` | 加速度对动效强度的加成 |
| `tooltipSpringStiffness` | `number` | `320` | 弹簧刚度 |
| `tooltipSpringDamping` | `number` | `24` | 弹簧阻尼 |
| `tooltipMotion` | `'blur' \| 'fade' \| 'none'` | `'blur'` | tooltip 显示/隐藏动效 |
| `tooltipMotionDuration` | `number` | `160` | tooltip 显示/隐藏动效时长（ms） |
| `tooltipMotionBlurPx` | `number` | `10` | tooltip 显示/隐藏动效模糊强度（px） |
| `tooltipDistortSkewDeg` | `number` | `8` | tooltip 扭曲挤压（skew）最大角度 |
| `tooltipJelly` | `boolean` | `true` | tooltip 果冻 Q 弹扭曲回弹 |
| `tooltipJellyFrequency` | `number` | `8.5` | 果冻 wobble 频率（Hz） |
| `tooltipJellyDecay` | `number` | `10` | 果冻 wobble 衰减（越大越快停） |
| `tooltipJellyRotateDeg` | `number` | `10` | wobble 旋转最大角度 |
| `tooltipJellySkewDeg` | `number` | `12` | wobble 扭曲最大角度 |
| `tooltipJellySquash` | `number` | `0.16` | wobble 挤压强度 |
| `tooltipJellyTriggerAccel` | `number` | `2800` | 触发 wobble 的加速度阈值 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `number` | v-model 更新 |
| `change` | `number` | change 事件 |
