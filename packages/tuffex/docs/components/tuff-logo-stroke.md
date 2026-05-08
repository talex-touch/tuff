# TuffLogoStroke Logo 描边动画

基于当前 Tuff Logo SVG 的描边动画组件，适合开场动效、品牌 loading、hover 反馈。

<script setup lang="ts">
import TuffLogoStrokeModesDemo from '../.vitepress/theme/components/demos/TuffLogoStrokeModesDemo.vue'
import TuffLogoStrokeModesDemoSource from '../.vitepress/theme/components/demos/TuffLogoStrokeModesDemo.vue?raw'

import TuffLogoStrokePaletteDemo from '../.vitepress/theme/components/demos/TuffLogoStrokePaletteDemo.vue'
import TuffLogoStrokePaletteDemoSource from '../.vitepress/theme/components/demos/TuffLogoStrokePaletteDemo.vue?raw'
</script>

## 动画模式

<DemoBlock title="TuffLogoStroke modes" :code="TuffLogoStrokeModesDemoSource">
  <template #preview>
    <TuffLogoStrokeModesDemo />
  </template>
</DemoBlock>

## 颜色与时长定制

<DemoBlock title="TuffLogoStroke palette" :code="TuffLogoStrokePaletteDemoSource">
  <template #preview>
    <TuffLogoStrokePaletteDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `size` | `string \| number` | `120` | 图标宽高 |
| `mode` | `'once' \| 'breathe' \| 'hover' \| 'loop'` | `'once'` | 动画模式（`loop` 为 `breathe` 别名） |
| `durationMs` | `number` | `2200` | 动画时长(ms) |
| `strokeColor` | `string` | `#4C4CFF` | 外框描边颜色 |
| `fillStartColor` | `string` | `#199FFE` | 中心图形渐变起始色 |
| `fillEndColor` | `string` | `#810DC6` | 中心图形渐变结束色 |
| `outerStartColor` | `string` | `#D73E4D` | 外圈渐变起始色 |
| `outerEndColor` | `string` | `#7F007F` | 外圈渐变结束色 |

## 交互契约

- 组件渲染一个 `role="img"` 的 SVG，默认可访问名称为 `Tuff logo stroke animation`。
- `size` 为 number 时会同时转换为宽高 px；string 会原样作为宽高。
- `mode="loop"` 会映射为 `breathe` class；`once`、`breathe`、`hover` 分别输出对应状态 class。
- 渐变和滤镜 id 使用组件实例级前缀，多个 logo 同屏渲染时不会互相冲突。
