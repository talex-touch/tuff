# NumberInput 数字输入

数字输入组件用于数量、阈值、比例等数值表单场景，内置步进控制和最小/最大值约束。

<script setup lang="ts">
import { ref } from 'vue'

const quantity = ref(3)
const percent = ref(45)
const numberInputApiRows1 = [
  { name: 'modelValue / v-model', description: '绑定值。', type: 'number | null', default: 'null' },
  { name: 'min', description: '最小值。', type: 'number', default: 'undefined' },
  { name: 'max', description: '最大值。', type: 'number', default: 'undefined' },
  { name: 'step', description: '步进值。', type: 'number', default: '1' },
  { name: 'precision', description: '小数精度。', type: 'number', default: 'undefined' },
  { name: 'placeholder', description: '占位文本。', type: 'string', default: '\'\'' },
  { name: 'disabled', description: '是否禁用。', type: 'boolean', default: 'false' },
  { name: 'readonly', description: '是否只读。', type: 'boolean', default: 'false' },
  { name: 'controls', description: '是否显示加减控制。', type: 'boolean', default: 'true' },
]

const numberInputApiRows2 = [
  { name: 'update:modelValue', description: '数值更新时触发。', type: '(value: number | null) => void' },
  { name: 'change', description: '数值提交变化时触发。', type: '(value: number | null) => void' },
  { name: 'focus', description: '聚焦时触发。', type: '(event: FocusEvent) => void' },
  { name: 'blur', description: '失焦时触发。', type: '(event: FocusEvent) => void' },
]
</script>

## 基础用法

<DemoBlock title="NumberInput Basic">
<template #preview>
<div style="display: grid; gap: 16px; max-width: 360px;">
  <TxNumberInput v-model="quantity" :min="0" :max="10" />
  <TxNumberInput v-model="percent" :min="0" :max="100" :step="5" />
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const quantity = ref(3)
</script>

<template>
  <TxNumberInput v-model="quantity" :min="0" :max="10" />
</template>
```

</template>
</DemoBlock>

## 状态

<DemoBlock title="NumberInput States">
<template #preview>
<div style="display: grid; gap: 16px; max-width: 360px;">
  <TxNumberInput :model-value="12.5" :precision="1" readonly />
  <TxNumberInput :model-value="8" disabled />
  <TxNumberInput :model-value="24" :controls="false" placeholder="No controls" />
</div>
</template>

<template #code>

```vue
<template>
  <TxNumberInput :model-value="12.5" :precision="1" readonly />
  <TxNumberInput :model-value="8" disabled />
  <TxNumberInput :model-value="24" :controls="false" />
</template>
```

</template>
</DemoBlock>

## API

### Props

<ApiSpecTable :rows="numberInputApiRows1" />

### Events

<ApiSpecTable title="Events" :rows="numberInputApiRows2" />
