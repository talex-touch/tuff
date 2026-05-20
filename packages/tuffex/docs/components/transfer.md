# Transfer 穿梭框

`TxTransfer` 用于在两个集合之间移动条目，适合权限、成员、字段和标签等中等规模列表配置。

<script setup lang="ts">
import { ref } from 'vue'

const transferData = [
  { key: 'docs', label: '文档中心' },
  { key: 'release', label: '发布管理' },
  { key: 'plugin', label: '插件市场' },
  { key: 'billing', label: '账单中心' },
  { key: 'admin', label: '管理员后台', disabled: true },
]

const selectedModules = ref(['docs'])
const filteredModules = ref(['release'])
</script>

## 基础用法

<DemoBlock title="Transfer">
<template #preview>
<div style="width: min(720px, 100%);">
  <TxTransfer
    v-model="selectedModules"
    :data="transferData"
    :titles="['可选模块', '已启用']"
    empty-text="暂无条目"
  />
  <div style="margin-top: 10px; font-size: 13px; color: var(--vp-c-text-2);">已启用：{{ selectedModules.join(', ') }}</div>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const data = [
  { key: 'docs', label: '文档中心' },
  { key: 'release', label: '发布管理' },
  { key: 'admin', label: '管理员后台', disabled: true },
]

const selected = ref(['docs'])
</script>

<template>
  <TxTransfer
    v-model="selected"
    :data="data"
    :titles="['可选模块', '已启用']"
  />
</template>
```

</template>
</DemoBlock>

## 可筛选

<DemoBlock title="Filterable">
<template #preview>
<div style="width: min(720px, 100%);">
  <TxTransfer
    v-model="filteredModules"
    :data="transferData"
    :titles="['待分配', '已分配']"
    filterable
    filter-placeholder="搜索模块"
    target-order="push"
    empty-text="无匹配模块"
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxTransfer
    v-model="selected"
    :data="data"
    :titles="['待分配', '已分配']"
    filterable
    filter-placeholder="搜索模块"
    target-order="push"
  />
</template>
```

</template>
</DemoBlock>

## 交互契约

- 左侧为未选列表，右侧为已选列表；勾选条目后通过中间按钮移动。
- `disabled` 条目不可勾选，也不会被移动。
- `targetOrder="original"` 按 `data` 原始顺序展示目标列表；`push` 按添加顺序展示。
- 窄屏下自动改为上下排列，避免双栏内容被压缩到不可读。

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `modelValue` | `Array<string \| number>` | `[]` | 目标列表 key 集合 |
| `data` | `TransferItem[]` | `[]` | 数据源 |
| `titles` | `[string, string]` | `['Source', 'Target']` | 左右面板标题 |
| `filterable` | `boolean` | `false` | 是否显示筛选输入 |
| `filterPlaceholder` | `string` | `''` | 筛选输入占位 |
| `emptyText` | `string` | `'No data'` | 空列表文本 |
| `addAriaLabel` | `string` | `'Move selected items to target'` | 添加按钮无障碍标签 |
| `removeAriaLabel` | `string` | `'Move selected items to source'` | 移除按钮无障碍标签 |
| `targetOrder` | `'original' \| 'push'` | `'original'` | 目标列表排序方式 |

### TransferItem

| 属性名 | 类型 | 说明 |
|------|------|------|
| `key` | `string \| number` | 条目唯一值 |
| `label` | `string` | 条目文本 |
| `disabled` | `boolean` | 是否禁用 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `Array<string \| number>` | 目标列表变化 |
| `change` | `Array<string \| number>` | 目标列表变化 |
