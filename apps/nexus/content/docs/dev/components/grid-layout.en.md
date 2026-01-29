---
title: "GridLayout 网格布局"
description: "用于快速构建响应式网格，并可选启用 hover 光斑交互效果。"
---
# GridLayout 网格布局

用于快速构建响应式网格，并可选启用 hover 光斑交互效果。

## 基础用法

<DemoBlock title="GridLayout">
<template #preview>
<TxGridLayout>
  <div v-for="i in 6" :key="i" class="tx-grid-layout__item" style="padding: 16px;">
    Item {{ i }}
  </div>
</TxGridLayout>
</template>

<template #code>
```vue
<template>
  <TxGridLayout>
    <div v-for="i in 6" :key="i" class="tx-grid-layout__item" style="padding: 16px;">
      Item {{ i }}
    </div>
  </TxGridLayout>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `minItemWidth` | `string` | `'300px'` | 子项最小宽度 |
| `gap` | `string` | `'1.5rem'` | 间距 |
| `maxColumns` | `number` | `4` | >= 1400px 时最大列数 |
| `interactive` | `boolean` | `true` | 是否启用 hover 光斑交互 |

## Notes

- 子项请添加 class：`tx-grid-layout__item`，用于启用 hover 效果样式。
