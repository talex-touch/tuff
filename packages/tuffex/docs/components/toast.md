# Toast 提示

轻量通知提示（类似 shadcn/sonner）。

> 需要在应用根部挂载一次 `<TxToastHost />`，然后在任意位置调用 `toast()`。

<script setup lang="ts">
import { toast } from '@tuffex/packages/utils'

import ToastVariantsDemo from '../.vitepress/theme/components/demos/ToastVariantsDemo.vue'
import ToastVariantsDemoSource from '../.vitepress/theme/components/demos/ToastVariantsDemo.vue?raw'
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
```
</template>
</DemoBlock>

## Variants / duration / dismissToast / replace

展示 `success` / `warning` / `danger` 变体、`duration: 0` 持久提示、`dismissToast(id)` 显式关闭，以及相同 `id` 的替换逻辑。
`duration > 0` 会自动关闭；每条 toast 的关闭按钮名称是 `Dismiss notification`。

<DemoBlock title="Toast variants and persistent notifications" :code="ToastVariantsDemoSource">
<template #preview>
<ToastVariantsDemo />
</template>
</DemoBlock>

## API

### `toast(options)`

```ts
toast({
  id?: string
  title?: string
  description?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
  duration?: number // ms, 0 = 不自动关闭
})
```

### `dismissToast(id)` / `clearToasts()`

从 `@tuffex/packages/utils` 导入。

## 交互契约

- `<TxToastHost />` 渲染为 `role="region"`、`aria-label="Notifications"` 的通知区域。
- 每条 toast 都带可键盘聚焦的关闭按钮，按钮名称为 `Dismiss notification`。
- `duration > 0` 自动关闭，`duration: 0` 保持显示直到显式 dismiss 或 clear。
- 传入相同 `id` 会替换现有 toast，避免同一业务提示重复堆叠。
