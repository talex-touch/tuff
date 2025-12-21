# Toast 提示

轻量通知提示（类似 shadcn/sonner）。

> 需要在应用根部挂载一次 `<TxToastHost />`，然后在任意位置调用 `toast()`。

<script setup lang="ts">
import { toast } from '@talex-touch/tuff-ui/utils'
</script>

## 基础用法

<DemoBlock title="Toast">
<template #preview>
<TxToastHost />

<TxButton @click="toast({ title: 'Saved', description: 'Your changes have been saved.' })">
  Show toast
</TxButton>

<TxButton
  style="margin-left: 8px;"
  @click="toast({ title: 'Success', description: 'Done', variant: 'success' })"
>
  Success
</TxButton>
</template>

<template #code>
```vue
<template>
  <TxToastHost />
  <TxButton @click="toast({ title: 'Saved', description: 'Your changes have been saved.' })">
    Show toast
  </TxButton>
</template>

<script setup lang="ts">
import { TxButton, TxToastHost } from '@talex-touch/tuff-ui'
import { toast } from '@talex-touch/tuff-ui/utils'
</script>
```
</template>
</DemoBlock>

## API

### `toast(options)`

```ts
toast({
  title?: string
  description?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
  duration?: number // ms, 0 = 不自动关闭
})
```

### `dismissToast(id)` / `clearToasts()`

从 `@talex-touch/tuff-ui/utils` 导入。
