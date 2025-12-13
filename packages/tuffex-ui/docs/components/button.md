# Button 按钮

按钮用于触发一个操作，如提交表单。TouchX UI 的按钮采用现代化的镂空透明设计，底部带有 2px 粗边框，提供优雅的视觉效果。

## 基础用法

基础的按钮用法，采用透明背景 + 底部粗边框的设计风格。

<div class="group">
  <TxButton>默认按钮</TxButton>
  <TxButton type="primary">主要按钮</TxButton>
  <TxButton type="success">成功按钮</TxButton>
  <TxButton type="info">信息按钮</TxButton>
  <TxButton type="warning">警告按钮</TxButton>
  <TxButton type="danger">危险按钮</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton>默认按钮</TxButton>
    <TxButton type="primary">主要按钮</TxButton>
    <TxButton type="success">成功按钮</TxButton>
    <TxButton type="info">信息按钮</TxButton>
    <TxButton type="warning">警告按钮</TxButton>
    <TxButton type="danger">危险按钮</TxButton>
  </div>
</template>
```

:::

## 禁用状态

按钮不可用状态。

<div class="group">
  <TxButton disabled>默认按钮</TxButton>
  <TxButton type="primary" disabled>主要按钮</TxButton>
  <TxButton type="success" disabled>成功按钮</TxButton>
  <TxButton type="info" disabled>信息按钮</TxButton>
  <TxButton type="warning" disabled>警告按钮</TxButton>
  <TxButton type="danger" disabled>危险按钮</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton disabled>默认按钮</TxButton>
    <TxButton type="primary" disabled>主要按钮</TxButton>
    <TxButton type="success" disabled>成功按钮</TxButton>
    <TxButton type="info" disabled>信息按钮</TxButton>
    <TxButton type="warning" disabled>警告按钮</TxButton>
    <TxButton type="danger" disabled>危险按钮</TxButton>
  </div>
</template>
```

:::

## 文字按钮

没有边框和背景色的按钮。

<div class="group">
  <TxButton type="text">文字按钮</TxButton>
  <TxButton type="text" disabled>文字按钮</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton type="text">文字按钮</TxButton>
    <TxButton type="text" disabled>文字按钮</TxButton>
  </div>
</template>
```

:::

## 朴素按钮

朴素按钮同样设置了不同的 `type` 属性对应的样式（可与 `plain` 属性组合使用），按钮颜色更轻量。

<div class="group">
  <TxButton plain>朴素按钮</TxButton>
  <TxButton type="primary" plain>主要按钮</TxButton>
  <TxButton type="success" plain>成功按钮</TxButton>
  <TxButton type="info" plain>信息按钮</TxButton>
  <TxButton type="warning" plain>警告按钮</TxButton>
  <TxButton type="danger" plain>危险按钮</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton plain>朴素按钮</TxButton>
    <TxButton type="primary" plain>主要按钮</TxButton>
    <TxButton type="success" plain>成功按钮</TxButton>
    <TxButton type="info" plain>信息按钮</TxButton>
    <TxButton type="warning" plain>警告按钮</TxButton>
    <TxButton type="danger" plain>危险按钮</TxButton>
  </div>
</template>
```

:::

## 圆角按钮

通过 `round` 属性来设置圆角按钮。

<div class="group">
  <TxButton round>圆角按钮</TxButton>
  <TxButton type="primary" round>主要按钮</TxButton>
  <TxButton type="success" round>成功按钮</TxButton>
  <TxButton type="info" round>信息按钮</TxButton>
  <TxButton type="warning" round>警告按钮</TxButton>
  <TxButton type="danger" round>危险按钮</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton round>圆角按钮</TxButton>
    <TxButton type="primary" round>主要按钮</TxButton>
    <TxButton type="success" round>成功按钮</TxButton>
    <TxButton type="info" round>信息按钮</TxButton>
    <TxButton type="warning" round>警告按钮</TxButton>
    <TxButton type="danger" round>危险按钮</TxButton>
  </div>
</template>
```

:::

## 图标按钮

带图标的按钮可增强辨识度（有文字）或节省空间（无文字）。

<div class="group">
  <TxButton type="primary" icon="edit" circle></TxButton>
  <TxButton type="primary" icon="share" circle></TxButton>
  <TxButton type="primary" icon="delete" circle></TxButton>
  <TxButton type="primary" icon="search">搜索</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton type="primary" icon="edit" circle></TxButton>
    <TxButton type="primary" icon="share" circle></TxButton>
    <TxButton type="primary" icon="delete" circle></TxButton>
    <TxButton type="primary" icon="search">搜索</TxButton>
  </div>
</template>
```

:::

## 加载中

点击按钮后进行数据加载操作，在按钮上显示加载状态。

<div class="group">
  <TxButton type="primary" loading>加载中</TxButton>
  <TxButton type="primary" loading></TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton type="primary" loading>加载中</TxButton>
    <TxButton type="primary" loading></TxButton>
  </div>
</template>
```

:::

## 不同尺寸

Button 组件提供除了默认值以外的三种尺寸，可以在不同场景下选择合适的按钮尺寸。

<div class="group">
  <TxButton size="large">大型按钮</TxButton>
  <TxButton>默认按钮</TxButton>
  <TxButton size="small">小型按钮</TxButton>
  <TxButton size="mini">超小按钮</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton size="large">大型按钮</TxButton>
    <TxButton>默认按钮</TxButton>
    <TxButton size="small">小型按钮</TxButton>
    <TxButton size="mini">超小按钮</TxButton>
  </div>
</template>
```

:::

## 震动反馈

按钮支持震动反馈功能，在移动设备上提供触觉反馈。

<div class="group">
  <TxButton type="primary" vibrate-type="light">轻微震动</TxButton>
  <TxButton type="primary" vibrate-type="medium">中等震动</TxButton>
  <TxButton type="primary" vibrate-type="heavy">重度震动</TxButton>
  <TxButton type="success" vibrate-type="success">成功震动</TxButton>
  <TxButton type="warning" vibrate-type="warning">警告震动</TxButton>
  <TxButton type="danger" vibrate-type="error">错误震动</TxButton>
  <TxButton type="info" :vibrate="false">无震动</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton type="primary" vibrate-type="light">轻微震动</TxButton>
    <TxButton type="primary" vibrate-type="medium">中等震动</TxButton>
    <TxButton type="primary" vibrate-type="heavy">重度震动</TxButton>
    <TxButton type="success" vibrate-type="success">成功震动</TxButton>
    <TxButton type="warning" vibrate-type="warning">警告震动</TxButton>
    <TxButton type="danger" vibrate-type="error">错误震动</TxButton>
    <TxButton type="info" :vibrate="false">无震动</TxButton>
  </div>
</template>
```

:::

## API

### Button Attributes

| 参数 | 说明 | 类型 | 可选值 | 默认值 |
|------|------|------|--------|--------|
| size | 尺寸 | string | large / small / mini | — |
| type | 类型 | string | primary / success / warning / danger / info / text | — |
| plain | 是否朴素按钮 | boolean | — | false |
| round | 是否圆角按钮 | boolean | — | false |
| circle | 是否圆形按钮 | boolean | — | false |
| loading | 是否加载中状态 | boolean | — | false |
| disabled | 是否禁用状态 | boolean | — | false |
| icon | 图标类名 | string | — | — |
| autofocus | 是否默认聚焦 | boolean | — | false |
| native-type | 原生 type 属性 | string | button / submit / reset | button |
| vibrate | 是否启用震动反馈 | boolean | — | true |
| vibrate-type | 震动类型 | string | light / medium / heavy / bit / success / warning / error | light |

### Button Events

| 事件名称 | 说明 | 回调参数 |
|----------|------|----------|
| click | 点击时触发 | event |
