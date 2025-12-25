# SearchInput 搜索输入框

基于输入框的搜索组件，内置搜索图标，并在 Enter 时触发 `search` 事件。

如果你需要“像 Select 一样展开结果面板”的搜索框，推荐使用 `SearchSelect`。

<script setup lang="ts">
import SearchInputBasicDemo from '../.vitepress/theme/components/demos/SearchInputBasicDemo.vue'
import SearchInputBasicDemoSource from '../.vitepress/theme/components/demos/SearchInputBasicDemo.vue?raw'

import SearchInputRemoteDemo from '../.vitepress/theme/components/demos/SearchInputRemoteDemo.vue'
import SearchInputRemoteDemoSource from '../.vitepress/theme/components/demos/SearchInputRemoteDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="SearchInput" :code="SearchInputBasicDemoSource">
  <template #preview>
    <SearchInputBasicDemo />
  </template>
</DemoBlock>

## 远程搜索

<DemoBlock title="SearchInput (remote)" :code="SearchInputRemoteDemoSource">
  <template #preview>
    <SearchInputRemoteDemo />
  </template>
</DemoBlock>

## API

### TxSearchInput Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `string` | `''` | 输入值（v-model） |
| `placeholder` | `string` | `'Search'` | 占位 |
| `disabled` | `boolean` | `false` | 禁用 |
| `clearable` | `boolean` | `true` | 可清空 |
| `remote` | `boolean` | `false` | 是否远程搜索（输入时触发 `search`） |
| `searchDebounce` | `number` | `200` | 远程搜索防抖（ms） |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(v: string)` | v-model 更新 |
| `input` | `(v: string)` | 输入 |
| `focus` | `(e: FocusEvent)` | 聚焦 |
| `blur` | `(e: FocusEvent)` | 失焦 |
| `clear` | - | 清空 |
| `search` | `(v: string)` | Enter 或 remote 输入触发 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `focus()` | `() => void` | 聚焦 |
| `blur()` | `() => void` | 失焦 |
| `clear()` | `() => void` | 清空 |
| `setValue(v)` | `(v: string) => void` | 设置值 |
| `getValue()` | `() => string` | 获取值 |
