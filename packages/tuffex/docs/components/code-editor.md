# CodeEditor 代码编辑器

基于 CodeMirror 6 的代码编辑器，支持 JSON/YAML 的格式化、校验、补全、折叠与搜索。

<script setup lang="ts">
import { ref } from 'vue'

const jsonValue = ref('{"name":"TuffEx","version":1,"features":["lint","format","search"]}')
const yamlValue = ref('name: TuffEx\nversion: 1\nfeatures:\n  - lint\n  - format\n  - search\n')

const toolbarActions = [
  { key: 'format', label: 'Format' },
  { key: 'search', label: 'Search', shortcut: 'Cmd/Ctrl+F' },
  { key: 'foldAll', label: 'Fold' },
  { key: 'unfoldAll', label: 'Unfold' },
  { key: 'copy', label: 'Copy' },
]

function handleToolbarAction(
  key: 'format' | 'search' | 'foldAll' | 'unfoldAll' | 'copy',
  handlers: {
    format: () => boolean
    openSearch: () => boolean
    foldAll: () => boolean
    unfoldAll: () => boolean
    copy: () => Promise<boolean>
  },
) {
  if (key === 'format')
    handlers.format()
  if (key === 'search')
    handlers.openSearch()
  if (key === 'foldAll')
    handlers.foldAll()
  if (key === 'unfoldAll')
    handlers.unfoldAll()
  if (key === 'copy')
    handlers.copy()
}
</script>

## 基础用法

<DemoBlock title="CodeEditor">
<template #preview>
<div style="display: grid; gap: 16px;">
  <TxCodeEditor v-model="jsonValue" language="json" />
  <TxCodeEditor v-model="yamlValue" language="yaml" />
</div>
</template>

<template #code>
```vue
<template>
  <TxCodeEditor v-model="jsonValue" language="json" />
  <TxCodeEditor v-model="yamlValue" language="yaml" />
</template>
```
</template>
</DemoBlock>

## 格式化

通过 `formatOnBlur` 或调用实例方法 `format()` 触发格式化。

## 主题风格

常用主题风格通过 `theme` 选择（`auto` 会跟随外部主题 data-theme/class）。

<DemoBlock title="Themes">
<template #preview>
<div style="display: grid; gap: 16px;">
  <TxCodeEditor v-model="jsonValue" language="json" theme="github" />
  <TxCodeEditor v-model="jsonValue" language="json" theme="dracula" />
</div>
</template>
</DemoBlock>

## Toolbar

Toolbar 通过 `toolbar` slot 选择性接入，推荐配合 `TxCodeEditorToolbar` 使用。

<DemoBlock title="Toolbar">
<template #preview>
<TxCodeEditor v-model="jsonValue" language="json">
  <template #toolbar="{ format, openSearch, foldAll, unfoldAll, copy }">
    <TxCodeEditorToolbar
      :actions="toolbarActions"
      @action="(key) => handleToolbarAction(key, { format, openSearch, foldAll, unfoldAll, copy })"
    />
  </template>
</TxCodeEditor>
</template>
</DemoBlock>

## API

### TxCodeEditor Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `string` | `''` | 内容（v-model） |
| `language` | `'json' \| 'yaml' \| 'toml' \| 'ini' \| 'javascript' \| 'js'` | `'json'` | 语言模式 |
| `theme` | `'auto' \| 'light' \| 'dark' \| 'github' \| 'dracula' \| 'monokai'` | `'auto'` | 主题风格 |
| `readOnly` | `boolean` | `false` | 只读模式 |
| `lineNumbers` | `boolean` | `true` | 行号 |
| `lineWrapping` | `boolean` | `false` | 自动换行 |
| `placeholder` | `string` | `''` | 占位文本 |
| `tabSize` | `number` | `2` | Tab 缩进空格数 |
| `formatOnBlur` | `boolean` | `false` | 失焦时格式化 |
| `formatOnInit` | `boolean` | `false` | 初始化时格式化 |
| `lint` | `boolean` | `true` | 语法校验 |
| `search` | `boolean` | `true` | 搜索面板（Cmd/Ctrl+F） |
| `completion` | `boolean` | `true` | 自动补全 |
| `extensions` | `Extension[]` | `[]` | 自定义 CodeMirror 扩展 |

> 说明：格式化与校验目前对 `json` / `yaml` 生效，其余语言仅提供高亮与基础编辑能力（可通过 `extensions` 自行扩展）。

### Slots

| 名称 | 参数 | 说明 |
|------|------|------|
| `toolbar` | `{ format, openSearch, foldAll, unfoldAll, copy, getValue }` | 自定义工具条 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(v: string)` | v-model 更新 |
| `change` | `(v: string)` | 文本变更 |
| `focus` | `()` | 聚焦 |
| `blur` | `()` | 失焦 |
| `format` | `({ value, language })` | 格式化成功 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `focus()` | `() => void` | 聚焦 |
| `blur()` | `() => void` | 失焦 |
| `format()` | `() => boolean` | 执行格式化 |
| `openSearch()` | `() => boolean` | 打开搜索面板 |
| `foldAll()` | `() => boolean` | 折叠全部 |
| `unfoldAll()` | `() => boolean` | 展开全部 |
| `copy()` | `() => Promise<boolean>` | 复制内容 |
| `getValue()` | `() => string` | 获取内容 |
| `getView()` | `() => EditorView \| null` | 获取编辑器实例 |

### TxCodeEditorToolbar Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `actions` | `CodeEditorToolbarAction[]` | 内置默认 | 工具按钮列表 |
| `compact` | `boolean` | `false` | 紧凑样式 |

### TxCodeEditorToolbar Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `action` | `(key)` | 点击工具按钮 |
