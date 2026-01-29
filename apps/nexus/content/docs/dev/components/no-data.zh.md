---
title: "NoData 无数据"
description: "用于列表、表格或图表数据为空的状态提示。"
---
# NoData 无数据

用于列表、表格或图表数据为空的状态提示。

## 基础用法

<DemoBlock title="NoData">
<template #preview>
<div style="max-width: 420px;">
  <TxNoData
    description="No records yet."
    :primary-action="{ label: 'Create', type: 'primary' }"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxNoData
    description="No records yet."
    :primary-action="{ label: 'Create', type: 'primary' }"
  />
</template>
```
</template>
</DemoBlock>

## API

Props / Slots / Events 同 `TxEmptyState`。
