# ContextMenu 右键菜单

基于 Floating UI 的右键菜单（跟随鼠标坐标）。

## 基础用法

<DemoBlock title="ContextMenu">
<template #preview>
<TxContextMenu>
  <template #trigger>
    <div style="width: 100%; padding: 24px; border: 1px dashed var(--tx-border-color); border-radius: 12px; user-select: none;">
      Right click here
    </div>
  </template>

  <template #menu>
    <TxDropdownItem @select="() => {}">Copy</TxDropdownItem>
    <TxDropdownItem @select="() => {}">Paste</TxDropdownItem>
    <TxDropdownItem danger @select="() => {}">Delete</TxDropdownItem>
  </template>
</TxContextMenu>
</template>

<template #code>
```vue
<template>
  <TxContextMenu>
    <template #trigger>
      <div>Right click here</div>
    </template>
    <template #menu>
      <TxDropdownItem>Copy</TxDropdownItem>
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
