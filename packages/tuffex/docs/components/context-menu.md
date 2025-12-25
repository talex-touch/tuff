# ContextMenu 右键菜单

基于 Floating UI 的右键菜单（跟随鼠标坐标）。

## 基础用法

<DemoBlock title="ContextMenu">
<template #preview>
<div style="width: 520px;">
  <TxContextMenu>
    <template #trigger>
      <div style="width: 100%; padding: 24px; border: 1px dashed var(--tx-border-color); border-radius: 12px; user-select: none;">
        Right click here
      </div>
    </template>

    <template #menu>
      <TxContextMenuItem @select="() => {}">Copy</TxContextMenuItem>
      <TxContextMenuItem @select="() => {}">Paste</TxContextMenuItem>
      <TxContextMenuItem danger @select="() => {}">Delete</TxContextMenuItem>
    </template>
  </TxContextMenu>
</div>
</template>

<template #code>
```vue
<template>
  <TxContextMenu>
    <template #trigger>
      <div>Right click here</div>
    </template>
    <template #menu>
      <TxContextMenuItem>Copy</TxContextMenuItem>
    </template>
  </TxContextMenu>
</template>
```
</template>
</DemoBlock>

## API

### TxContextMenu Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean` | `false` | 是否打开（v-model） |
| `x` | `number` | `0` | 打开坐标 X（可选） |
| `y` | `number` | `0` | 打开坐标 Y（可选） |
| `width` | `number` | `220` | 菜单宽度 |
| `closeOnEsc` | `boolean` | `true` | ESC 关闭 |
| `closeOnClickOutside` | `boolean` | `true` | 点击外部关闭 |

### TxContextMenuItem Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `disabled` | `boolean` | `false` | 是否禁用 |
| `danger` | `boolean` | `false` | 危险操作样式 |

### TxContextMenuItem Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `select` | - | 选中条目（点击后自动关闭菜单） |
