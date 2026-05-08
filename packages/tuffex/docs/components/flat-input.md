# FlatInput 扁平输入

`FlatInput` 是轻量紧凑输入框，支持文本、密码和 textarea 模式。组件保持原生输入控件作为唯一键盘焦点目标。

## 基础用法

<DemoBlock title="FlatInput">
<template #preview>
<div style="display: grid; gap: 12px; width: 320px;">
  <FlatInput placeholder="请输入内容" icon="i-ri-search-line" />
  <FlatInput placeholder="密码" password />
  <FlatInput placeholder="多行内容" area />
</div>
</template>

<template #code>

```vue
<template>
  <FlatInput v-model="text" placeholder="请输入内容" icon="i-ri-search-line" />
  <FlatInput v-model="secret" placeholder="密码" password />
  <FlatInput v-model="body" placeholder="多行内容" area />
</template>
```

</template>
</DemoBlock>

## 交互契约

- `modelValue` 可省略，默认空字符串；输入时只触发 `update:modelValue`。
- `icon` 会在没有 prefix slot 时渲染为前缀图标；传入默认 slot 时由 slot 完全替换前缀内容。
- 根容器不产生额外 tab stop，键盘焦点停留在原生 `input` 或 `textarea` 上。
- `password=true` 会使用原生 password input，并仅在密码模式下显示 Caps Lock 提示。
- `area=true` 渲染 `textarea`；`nonWin=true` 移除 Windows 风格 class。

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `string` | `''` | 输入值 |
| `placeholder` | `string` | `''` | 占位提示 |
| `icon` | `string` | `''` | 前缀图标 class |
| `password` | `boolean` | `false` | 密码输入模式 |
| `nonWin` | `boolean` | `false` | 关闭 Windows 风格 class |
| `area` | `boolean` | `false` | textarea 模式 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `string` | 输入值变化 |

### Slots

| 插槽名 | 说明 |
|------|------|
| `default` | 前缀内容；存在时替换 `icon` |
