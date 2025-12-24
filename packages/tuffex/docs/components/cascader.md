# Cascader 级联选择

用于选择具有层级关系的数据，支持搜索、单选/多选与异步加载子节点。

<script setup lang="ts">
import CascaderBasicDemo from '../.vitepress/theme/components/demos/CascaderBasicDemo.vue'
import CascaderBasicDemoSource from '../.vitepress/theme/components/demos/CascaderBasicDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="Cascader" :code="CascaderBasicDemoSource">
  <template #preview>
    <CascaderBasicDemo />
  </template>
</DemoBlock>

## API

### TxCascader Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `CascaderValue` | - | 当前值（v-model） |
| `options` | `CascaderNode[]` | `[]` | 数据源 |
| `multiple` | `boolean` | `false` | 是否多选 |
| `disabled` | `boolean` | `false` | 禁用 |
| `placeholder` | `string` | `'请选择'` | 占位 |
| `searchable` | `boolean` | `true` | 是否可搜索 |
| `clearable` | `boolean` | `true` | 是否可清空 |
| `placement` | `PopoverPlacement` | `'bottom-start'` | 浮层位置 |
| `dropdownOffset` | `number` | `6` | 浮层偏移 |
| `dropdownWidth` | `number` | `0` | 浮层宽度（0 表示跟随触发器） |
| `dropdownMaxWidth` | `number` | `520` | 浮层最大宽度 |
| `dropdownMaxHeight` | `number` | `340` | 浮层最大高度 |
| `load` | `(node, level) => Promise<CascaderNode[]>` | - | 异步加载子节点（仅对未提供 children 的节点生效） |

### CascaderNode

| 字段 | 类型 | 说明 |
|------|------|------|
| `value` | `string \| number` | 唯一标识 |
| `label` | `string` | 展示文本 |
| `disabled` | `boolean` | 是否禁用 |
| `leaf` | `boolean` | 是否叶子节点 |
| `children` | `CascaderNode[]` | 子节点（可选） |

### CascaderValue

- 单选：`CascaderPath`（`Array<string | number>`）
- 多选：`CascaderPath[]`

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `(v)` | v-model 更新 |
| `change` | `(v)` | 值变化 |
| `open` | - | 打开浮层 |
| `close` | - | 关闭浮层 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `open()` | `() => void` | 打开 |
| `close()` | `() => void` | 关闭 |
| `toggle()` | `() => void` | 切换 |
| `focus()` | `() => void` | 聚焦触发器 |
| `blur()` | `() => void` | 失焦触发器 |
| `clear()` | `() => void` | 清空 |
| `setValue(v)` | `(v) => void` | 设置值 |
| `getValue()` | `() => any` | 获取当前值 |
