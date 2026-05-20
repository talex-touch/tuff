# FlatRadio 扁平单选

`TxFlatRadio` 提供分段式单选，也可以通过 `multiple` 切换为紧凑多选。它适合用于模式切换、过滤条件和工具栏状态选择。

<script setup lang="ts">
import { ref } from 'vue'

const currentView = ref('overview')
const currentSize = ref('md')
const channels = ref(['email'])
</script>

## 基础用法

<DemoBlock title="FlatRadio">
<template #preview>
<div style="display: grid; gap: 16px; justify-items: start;">
  <TxFlatRadio v-model="currentView" bordered>
    <TxFlatRadioItem value="overview" label="总览" />
    <TxFlatRadioItem value="tasks" label="任务" />
    <TxFlatRadioItem value="logs" label="日志" />
  </TxFlatRadio>
  <div style="font-size: 13px; color: var(--vp-c-text-2);">当前：{{ currentView }}</div>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const currentView = ref('overview')
</script>

<template>
  <TxFlatRadio v-model="currentView" bordered>
    <TxFlatRadioItem value="overview" label="总览" />
    <TxFlatRadioItem value="tasks" label="任务" />
    <TxFlatRadioItem value="logs" label="日志" />
  </TxFlatRadio>
</template>
```

</template>
</DemoBlock>

## 尺寸

<DemoBlock title="Sizes">
<template #preview>
<div style="display: grid; gap: 12px; justify-items: start;">
  <TxFlatRadio v-model="currentSize" size="sm">
    <TxFlatRadioItem value="sm" label="Small" />
    <TxFlatRadioItem value="md" label="Medium" />
    <TxFlatRadioItem value="lg" label="Large" />
  </TxFlatRadio>
  <TxFlatRadio v-model="currentSize" size="md">
    <TxFlatRadioItem value="sm" label="Small" />
    <TxFlatRadioItem value="md" label="Medium" />
    <TxFlatRadioItem value="lg" label="Large" />
  </TxFlatRadio>
  <TxFlatRadio v-model="currentSize" size="lg">
    <TxFlatRadioItem value="sm" label="Small" />
    <TxFlatRadioItem value="md" label="Medium" />
    <TxFlatRadioItem value="lg" label="Large" />
  </TxFlatRadio>
</div>
</template>

<template #code>

```vue
<template>
  <TxFlatRadio v-model="size" size="sm">
    <TxFlatRadioItem value="sm" label="Small" />
    <TxFlatRadioItem value="md" label="Medium" />
  </TxFlatRadio>
</template>
```

</template>
</DemoBlock>

## 多选模式

<DemoBlock title="Multiple">
<template #preview>
<div style="display: grid; gap: 12px; justify-items: start;">
  <TxFlatRadio v-model="channels" multiple bordered>
    <TxFlatRadioItem value="email" icon="i-ri-mail-line" label="邮件" />
    <TxFlatRadioItem value="sms" icon="i-ri-chat-1-line" label="短信" />
    <TxFlatRadioItem value="push" icon="i-ri-notification-3-line" label="推送" />
    <TxFlatRadioItem value="webhook" label="Webhook" disabled />
  </TxFlatRadio>
  <div style="font-size: 13px; color: var(--vp-c-text-2);">已选：{{ channels.join(', ') }}</div>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const channels = ref(['email'])
</script>

<template>
  <TxFlatRadio v-model="channels" multiple bordered>
    <TxFlatRadioItem value="email" icon="i-ri-mail-line" label="邮件" />
    <TxFlatRadioItem value="sms" icon="i-ri-chat-1-line" label="短信" />
    <TxFlatRadioItem value="push" icon="i-ri-notification-3-line" label="推送" />
  </TxFlatRadio>
</template>
```

</template>
</DemoBlock>

## 交互契约

- 单选模式使用 `radiogroup` / `radio` 语义，并显示滑动指示器。
- 多选模式使用 `group` / `checkbox` 语义，按 Enter 或 Space 可切换当前聚焦项。
- 键盘支持 Arrow、Home、End，并跳过禁用项。
- `disabled` 会禁用整组交互；单个 `TxFlatRadioItem` 的 `disabled` 只影响该项。

## API

### TxFlatRadio Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `modelValue` | `string \| number \| Array<string \| number>` | - | 当前选中值 |
| `multiple` | `boolean` | `false` | 是否启用多选模式 |
| `disabled` | `boolean` | `false` | 是否禁用整组 |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 尺寸 |
| `bordered` | `boolean` | `false` | 是否显示外边框 |

### TxFlatRadioItem Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `value` | `string \| number` | - | 选项值 |
| `label` | `string` | - | 选项文本 |
| `icon` | `string` | - | 图标 class |
| `disabled` | `boolean` | `false` | 是否禁用该选项 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `string \| number \| Array<string \| number>` | 选中值变化 |
| `change` | `string \| number \| Array<string \| number>` | 选中值变化 |

### Slots

| 插槽名 | 说明 |
|------|------|
| `default` | `TxFlatRadioItem` 列表 |
| `TxFlatRadioItem#default` | 自定义选项文本 |
| `TxFlatRadioItem#icon` | 自定义选项图标 |
