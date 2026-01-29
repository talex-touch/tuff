---
title: "BlankSlate 空白页"
description: "用于首次进入、引导用户开始操作的空白页布局。"
---
# BlankSlate 空白页

用于首次进入、引导用户开始操作的空白页布局。

## 基础用法

<DemoBlock title="BlankSlate">
<template #preview>
<div style="max-width: 520px;">
  <TxBlankSlate
    title="Create your first project"
    description="Start by creating a project to organize your work."
    :primary-action="{ label: 'Create', type: 'primary' }"
    :secondary-action="{ label: 'Learn more' }"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxBlankSlate
    title="Create your first project"
    description="Start by creating a project to organize your work."
    :primary-action="{ label: 'Create', type: 'primary' }"
    :secondary-action="{ label: 'Learn more' }"
  />
</template>
```
</template>
</DemoBlock>

## API

Props / Slots / Events 同 `TxEmptyState`。
