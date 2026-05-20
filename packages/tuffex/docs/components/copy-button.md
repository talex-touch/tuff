# CopyButton 复制按钮

CopyButton 封装轻量复制操作，适合复制命令、ID、链接和代码片段。

<script setup lang="ts">
const copyButtonApiRows1 = [
  { name: 'text', description: '需要复制的文本。', type: 'string', default: '\'\'' },
  { name: 'copyLabel', description: '默认按钮文案。', type: 'string', default: '\'Copy\'' },
  { name: 'copiedLabel', description: '复制成功文案。', type: 'string', default: '\'Copied\'' },
  { name: 'disabled', description: '是否禁用。', type: 'boolean', default: 'false' },
  { name: 'timeout', description: '成功状态保持时间，单位 ms。', type: 'number', default: '1400' },
  { name: 'size', description: '尺寸。', type: '\'sm\' | \'md\'', default: '\'sm\'' },
]

const copyButtonApiRows2 = [
  { name: 'copy', description: '复制成功时触发。', type: '(text: string) => void' },
  { name: 'error', description: '复制失败时触发。', type: '(error: unknown) => void' },
]

const copyButtonApiRows3 = [
  { name: 'default', description: '自定义按钮内容。', type: '{ copied: boolean, copying: boolean }' },
]
</script>

## 基础用法

<DemoBlock title="CopyButton Basic">
<template #preview>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
  <code>pnpm add @talex-touch/tuffex</code>
  <TxCopyButton text="pnpm add @talex-touch/tuffex" />
  <TxCopyButton text="https://tuff.dev" size="md" copy-label="Copy link" copied-label="Link copied" />
</div>
</template>

<template #code>

```vue
<template>
  <code>pnpm add @talex-touch/tuffex</code>
  <TxCopyButton text="pnpm add @talex-touch/tuffex" />
  <TxCopyButton
    text="https://tuff.dev"
    size="md"
    copy-label="Copy link"
    copied-label="Link copied"
  />
</template>
```

</template>
</DemoBlock>

## 状态

<DemoBlock title="CopyButton States">
<template #preview>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
  <TxCopyButton text="readonly-id-42" disabled />
  <TxCopyButton text="token-preview">
    <template #default="{ copied }">
      {{ copied ? 'Done' : 'Copy token' }}
    </template>
  </TxCopyButton>
</div>
</template>

<template #code>

```vue
<template>
  <TxCopyButton text="readonly-id-42" disabled />
  <TxCopyButton text="token-preview">
    <template #default="{ copied }">
      {{ copied ? 'Done' : 'Copy token' }}
    </template>
  </TxCopyButton>
</template>
```

</template>
</DemoBlock>

## API

### Props

<ApiSpecTable :rows="copyButtonApiRows1" />

### Events

<ApiSpecTable title="Events" :rows="copyButtonApiRows2" />

### Slots

<ApiSpecTable title="Slots" :rows="copyButtonApiRows3" />
