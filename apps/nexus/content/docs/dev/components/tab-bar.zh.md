---
title: "TabBar 底部导航"
description: "移动端底部 TabBar，支持图标与 badge。"
---
# TabBar 底部导航

移动端底部 TabBar，支持图标与 badge。

<script setup lang="ts">
import TabBarBasicDemo from '~/components/content/demos/TabBarBasicDemo.vue'
import TabBarBasicDemoSource from '~/components/content/demos/TabBarBasicDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="TabBar" :code="TabBarBasicDemoSource">
  <template #preview>
    <TabBarBasicDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `string \| number` | `''` | 当前值（v-model） |
| `items` | `TabBarItem[]` | `[]` | 数据源 |
| `fixed` | `boolean` | `true` | 是否 fixed 底部 |
| `safeAreaBottom` | `boolean` | `true` | 是否预留底部安全区 |
| `disabled` | `boolean` | `false` | 禁用 |
| `zIndex` | `number` | `2000` | z-index |

### TabBarItem

| 字段 | 类型 | 说明 |
|------|------|------|
| `value` | `string \| number` | 唯一值 |
| `label` | `string` | 文案 |
| `iconClass` | `string` | 图标 class |
| `badge` | `string \| number` | badge |
| `disabled` | `boolean` | 禁用 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(value)` | v-model 更新 |
| `change` | `(value)` | 值变化 |
