# FlatSelect 扁平选择

`TxFlatSelect` 是紧凑选择器，使用原地展开的浮层动效，适合工具栏、筛选栏和空间受限的表单。

<script setup lang="ts">
import { ref } from 'vue'

const format = ref('json')
const region = ref('')
const disabledValue = ref('locked')
</script>

## 基础用法

<DemoBlock title="FlatSelect">
<template #preview>
<div style="display: grid; gap: 12px; width: min(280px, 100%);">
  <TxFlatSelect v-model="format" placeholder="请选择格式">
    <TxFlatSelectItem value="json" label="JSON" />
    <TxFlatSelectItem value="csv" label="CSV" />
    <TxFlatSelectItem value="yaml" label="YAML" />
  </TxFlatSelect>
  <div style="font-size: 13px; color: var(--vp-c-text-2);">当前：{{ format }}</div>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const format = ref('json')
</script>

<template>
  <TxFlatSelect v-model="format" placeholder="请选择格式">
    <TxFlatSelectItem value="json" label="JSON" />
    <TxFlatSelectItem value="csv" label="CSV" />
    <TxFlatSelectItem value="yaml" label="YAML" />
  </TxFlatSelect>
</template>
```

</template>
</DemoBlock>

## 占位与禁用选项

<DemoBlock title="Placeholder and disabled option">
<template #preview>
<div style="display: grid; gap: 12px; width: min(280px, 100%);">
  <TxFlatSelect v-model="region" placeholder="选择区域">
    <TxFlatSelectItem value="cn" label="中国大陆" />
    <TxFlatSelectItem value="sg" label="新加坡" />
    <TxFlatSelectItem value="us" label="美国" disabled />
  </TxFlatSelect>
  <TxFlatSelect v-model="disabledValue" disabled>
    <TxFlatSelectItem value="locked" label="已锁定" />
  </TxFlatSelect>
</div>
</template>

<template #code>

```vue
<template>
  <TxFlatSelect v-model="region" placeholder="选择区域">
    <TxFlatSelectItem value="cn" label="中国大陆" />
    <TxFlatSelectItem value="sg" label="新加坡" />
    <TxFlatSelectItem value="us" label="美国" disabled />
  </TxFlatSelect>
</template>
```

</template>
</DemoBlock>

## 交互契约

- 触发器使用 `combobox` 语义，下拉区域使用 `listbox`，选项使用 `option`。
- 点击触发器打开或关闭下拉面板；点击外部或按 Escape 关闭。
- 打开时按 ArrowUp / ArrowDown 会在可用选项间移动，并跳过禁用项。
- 选中项会作为触发器显示文本；没有选中项时显示 `placeholder`。

## API

### TxFlatSelect Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `modelValue` | `string \| number` | `''` | 当前选中值 |
| `placeholder` | `string` | `''` | 未选择时的占位文本 |
| `disabled` | `boolean` | `false` | 是否禁用 |

### TxFlatSelectItem Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `value` | `string \| number` | - | 选项值 |
| `label` | `string` | - | 选项文本；缺省时显示 `value` |
| `disabled` | `boolean` | `false` | 是否禁用该选项 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `string \| number` | 选中值变化 |
| `change` | `string \| number` | 选中值变化 |

### Slots

| 插槽名 | 说明 |
|------|------|
| `default` | `TxFlatSelectItem` 列表 |
| `TxFlatSelectItem#default` | 自定义选项内容 |
