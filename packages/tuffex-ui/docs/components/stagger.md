# Stagger 依次进入

用于列表/节点依次进入（enter/leave）动画。

<script setup lang="ts">
import { ref } from 'vue'

const items = ref([
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
  { id: 'd', text: 'Delta' },
])

function add() {
  items.value.unshift({ id: `${Date.now()}`, text: `New ${items.value.length + 1}` })
}

function remove() {
  items.value.shift()
}
</script>

## 基础用法

<DemoBlock title="Stagger">
<template #preview>
<div style="display: grid; gap: 12px; width: 420px;">
  <div style="display: flex; gap: 8px;">
    <TxButton @click="add">Add</TxButton>
    <TxButton @click="remove">Remove</TxButton>
  </div>

  <TxStagger tag="div" :delay-step="30" :duration="180">
    <div
      v-for="item in items"
      :key="item.id"
      style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);"
    >
      {{ item.text }}
    </div>
  </TxStagger>
</div>
</template>

<template #code>
```vue
<template>
  <TxStagger tag="div" :delay-step="30" :duration="180">
    <div v-for="item in items" :key="item.id">{{ item.text }}</div>
  </TxStagger>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `tag` | `string` | `'div'` | 容器 tag |
| `appear` | `boolean` | `true` | 是否首屏也执行 enter |
| `name` | `string` | `'tx-stagger'` | TransitionGroup name |
| `duration` | `number` | `180` | 动画时长（ms） |
| `delayStep` | `number` | `24` | 相邻元素延迟（ms） |
| `delayBase` | `number` | `0` | 基础延迟（ms） |
| `easing` | `'ease'\|'ease-in'\|'ease-out'\|'ease-in-out'\|'linear'` | `'ease-out'` | 缓动 |
