# FlatButton 扁平按钮

`TuffFlatButton` 是低强调按钮，用于次要动作、抽屉/弹层内的辅助操作和轻量工具按钮。组件根节点是原生 `<button type="button">`。

## 基础用法

<DemoBlock title="FlatButton">
<template #preview>
<div style="display: flex; gap: 12px; flex-wrap: wrap;">
  <TuffFlatButton>默认</TuffFlatButton>
  <TuffFlatButton primary>主色</TuffFlatButton>
  <TuffFlatButton mini>小尺寸</TuffFlatButton>
  <TuffFlatButton loading>加载中</TuffFlatButton>
</div>
</template>

<template #code>

```vue
<template>
  <TuffFlatButton>默认</TuffFlatButton>
  <TuffFlatButton primary>主色</TuffFlatButton>
  <TuffFlatButton mini>小尺寸</TuffFlatButton>
  <TuffFlatButton loading>加载中</TuffFlatButton>
</template>
```

</template>
</DemoBlock>

## 交互契约

- 根节点是原生 `<button type="button">`，默认不会提交外层表单。
- `disabled` 与 `loading` 都会设置原生 `disabled` 属性，并阻断 `click` 事件。
- `loading` 会渲染 spinner，同时保留按钮内容。
- `primary` 只切换主色视觉；非 primary 默认带 `fake-background` hover 背景。
- `mini` 切换紧凑尺寸，不改变按钮语义。

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `primary` | `boolean` | `false` | 主色视觉 |
| `mini` | `boolean` | `false` | 紧凑尺寸 |
| `disabled` | `boolean` | `false` | 禁用按钮 |
| `loading` | `boolean` | `false` | 加载状态，同时禁用按钮 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `click` | `MouseEvent` | 启用状态下点击按钮时触发 |

### Slots

| 插槽名 | 说明 |
|------|------|
| `default` | 按钮内容 |
