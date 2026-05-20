# Textarea 文本域

多行文本输入组件，适合备注、描述、消息草稿等需要较长文本的表单场景。

<script setup lang="ts">
import { ref } from 'vue'

const value = ref('TuffEx provides calm, focused form controls.')
const limitedValue = ref('Keep this short.')
const disabledValue = ref('Disabled content')
const textareaApiRows1 = [
  { name: 'modelValue / v-model', description: '绑定值。', type: 'string', default: '\'\'' },
  { name: 'placeholder', description: '占位文本。', type: 'string', default: '\'\'' },
  { name: 'rows', description: '文本域行数。', type: 'number', default: '4' },
  { name: 'disabled', description: '是否禁用。', type: 'boolean', default: 'false' },
  { name: 'readonly', description: '是否只读。', type: 'boolean', default: 'false' },
  { name: 'maxLength', description: '最大输入长度。', type: 'number', default: 'undefined' },
  { name: 'showCount', description: '是否显示字数统计。', type: 'boolean', default: 'false' },
  { name: 'resize', description: '调整尺寸方向。', type: '\'none\' | \'vertical\' | \'horizontal\' | \'both\'', default: '\'vertical\'' },
  { name: 'status', description: '视觉状态。', type: '\'default\' | \'success\' | \'error\'', default: '\'default\'' },
]

const textareaApiRows2 = [
  { name: 'update:modelValue', description: '输入内容更新时触发。', type: '(value: string) => void' },
  { name: 'input', description: '输入时触发。', type: '(value: string) => void' },
  { name: 'focus', description: '聚焦时触发。', type: '(event: FocusEvent) => void' },
  { name: 'blur', description: '失焦时触发。', type: '(event: FocusEvent) => void' },
]

const textareaApiRows3 = [
  { name: 'focus', description: '聚焦原生 textarea。', type: '() => void' },
  { name: 'blur', description: '让原生 textarea 失焦。', type: '() => void' },
  { name: 'textareaRef', description: '原生 textarea 引用。', type: 'HTMLTextAreaElement | null' },
]
</script>

## 基础用法

<DemoBlock title="Textarea Basic">
<template #preview>
<div style="display: grid; gap: 16px; max-width: 520px;">
  <TxTextarea v-model="value" placeholder="Write a note" />
  <TxTextarea v-model="limitedValue" :max-length="40" show-count resize="none" status="success" />
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const value = ref('')
</script>

<template>
  <TxTextarea v-model="value" placeholder="Write a note" />
</template>
```

</template>
</DemoBlock>

## 状态

<DemoBlock title="Textarea States">
<template #preview>
<div style="display: grid; gap: 16px; max-width: 520px;">
  <TxTextarea model-value="Readonly value" readonly />
  <TxTextarea v-model="disabledValue" disabled />
  <TxTextarea model-value="Validation failed" status="error" />
</div>
</template>

<template #code>

```vue
<template>
  <TxTextarea model-value="Readonly value" readonly />
  <TxTextarea model-value="Disabled content" disabled />
  <TxTextarea model-value="Validation failed" status="error" />
</template>
```

</template>
</DemoBlock>

## API

### Props

<ApiSpecTable :rows="textareaApiRows1" />

### Events

<ApiSpecTable title="Events" :rows="textareaApiRows2" />

### Exposes

<ApiSpecTable title="Exposes" :rows="textareaApiRows3" />
