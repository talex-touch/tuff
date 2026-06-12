# MarkdownEditor Markdown 编辑器

用于在表单、文档配置与插件编辑场景中编辑 Markdown。组件默认提供可见即可得编辑、源码编辑与预览三种模式，支持按需导入与独立样式入口。

<script setup lang="ts">
import { ref } from 'vue'

const value = ref([
  '# Release note',
  '',
  'This editor supports **rich editing**, source editing and preview.',
  '',
  '- Fast note taking',
  '- Markdown output',
  '',
  '> Designed for local-first authoring surfaces.',
].join('\n'))
</script>

## 基础用法

<DemoBlock title="MarkdownEditor">
<template #preview>
<div style="width: min(720px, 100%);">
  <TxMarkdownEditor v-model="value" placeholder="Write Markdown..." />
</div>
</template>

<template #code>
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TxMarkdownEditor } from '@talex-touch/tuffex/markdown-editor'
import '@talex-touch/tuffex/markdown-editor/style.css'

const value = ref('# Release note')
</script>

<template>
  <TxMarkdownEditor v-model="value" placeholder="Write Markdown..." />
</template>
```
</template>
</DemoBlock>

## 源码模式

<DemoBlock title="Source mode">
<template #preview>
<div style="width: min(720px, 100%);">
  <TxMarkdownEditor v-model="value" default-mode="source" :min-height="180" />
</div>
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `string` | `''` | Markdown 内容 |
| `placeholder` | `string` | `''` | 空内容提示 |
| `mode` | `'wysiwyg' \| 'source' \| 'preview'` | - | 受控模式 |
| `defaultMode` | `'wysiwyg' \| 'source' \| 'preview'` | `'wysiwyg'` | 非受控默认模式 |
| `disabled` | `boolean` | `false` | 禁用 |
| `readonly` | `boolean` | `false` | 只读 |
| `sanitize` | `boolean` | `true` | 渲染 HTML 时是否 sanitize |
| `theme` | `'auto' \| 'light' \| 'dark'` | `'auto'` | 主题 |
| `toolbar` | `boolean` | `true` | 是否显示工具条 |
| `toolbarActions` | `MarkdownEditorToolbarActionKey[]` | 内置常用动作 | 工具按钮列表 |
| `minHeight` | `string \| number` | `220` | 编辑区最小高度 |
| `maxHeight` | `string \| number` | - | 编辑区最大高度 |
| `linkPrompt` | `(selectedText: string) => string \| Promise<string>` | - | 链接按钮的 URL 获取函数；未提供时链接按钮不弹窗 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(value: string)` | v-model 更新 |
| `change` | `(value: string)` | 内容变化 |
| `update:mode` | `(mode)` | 模式更新 |
| `mode-change` | `(mode)` | 模式变化 |
| `focus` | `()` | 聚焦 |
| `blur` | `()` | 失焦 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `focus()` | `() => void` | 聚焦当前编辑面板 |
| `blur()` | `() => void` | 失焦 |
| `setMode(mode)` | `(mode: MarkdownEditorMode) => void` | 切换模式 |
| `getMode()` | `() => MarkdownEditorMode` | 获取当前模式 |
| `getValue()` | `() => string` | 获取 Markdown |
| `setValue(value)` | `(value: string) => Promise<void>` | 设置 Markdown |
