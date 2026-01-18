# OfflineState 离线

用于离线或网络不可用时的提示。

## 基础用法

<DemoBlock title="OfflineState">
<template #preview>
<div style="max-width: 420px;">
  <TxOfflineState
    description="Network connection lost."
    :primary-action="{ label: 'Retry', type: 'primary' }"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxOfflineState
    description="Network connection lost."
    :primary-action="{ label: 'Retry', type: 'primary' }"
  />
</template>
```
</template>
</DemoBlock>

## API

Props / Slots / Events 同 `TxEmptyState`。
