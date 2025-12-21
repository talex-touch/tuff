# Button 按钮

按钮用于触发一个操作，如提交表单。该组件风格参考 core-app 的 **TuffButton(TButton)**：圆角 pill 形态，支持 `variant` / `size` / `block` / `loading` / `disabled`。

## 基础用法

基础的按钮用法。

<div class="group">
  <TxButton>默认按钮</TxButton>
  <TxButton variant="primary">Primary</TxButton>
  <TxButton variant="secondary">Secondary</TxButton>
  <TxButton variant="ghost">Ghost</TxButton>
  <TxButton variant="danger">Danger</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton>默认按钮</TxButton>
    <TxButton variant="primary">Primary</TxButton>
    <TxButton variant="secondary">Secondary</TxButton>
    <TxButton variant="ghost">Ghost</TxButton>
    <TxButton variant="danger">Danger</TxButton>
  </div>
</template>
```

:::

## 禁用状态

按钮不可用状态。

<div class="group">
  <TxButton disabled>默认按钮</TxButton>
  <TxButton variant="primary" disabled>Primary</TxButton>
  <TxButton variant="secondary" disabled>Secondary</TxButton>
  <TxButton variant="ghost" disabled>Ghost</TxButton>
  <TxButton variant="danger" disabled>Danger</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton disabled>默认按钮</TxButton>
    <TxButton variant="primary" disabled>Primary</TxButton>
    <TxButton variant="secondary" disabled>Secondary</TxButton>
    <TxButton variant="ghost" disabled>Ghost</TxButton>
    <TxButton variant="danger" disabled>Danger</TxButton>
  </div>
</template>
```

:::

## 加载中

点击按钮后进行数据加载操作，在按钮上显示加载状态。

<div class="group">
  <TxButton variant="primary" loading>加载中</TxButton>
  <TxButton variant="secondary" loading>加载中</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton variant="primary" loading>加载中</TxButton>
    <TxButton variant="secondary" loading>加载中</TxButton>
  </div>
</template>
```

:::

## 不同尺寸

Button 组件提供除了默认值以外的三种尺寸，可以在不同场景下选择合适的按钮尺寸。

<div class="group">
  <TxButton size="lg">Large</TxButton>
  <TxButton size="md">Medium</TxButton>
  <TxButton size="sm">Small</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton size="lg">Large</TxButton>
    <TxButton size="md">Medium</TxButton>
    <TxButton size="sm">Small</TxButton>
  </div>
</template>
```

:::

## Block

<div class="group" style="width: 260px;">
  <TxButton block variant="primary">Block Button</TxButton>
</div>

::: details Show Code
```vue
<template>
  <TxButton block variant="primary">Block Button</TxButton>
</template>
```
:::

## 震动反馈

按钮支持震动反馈功能，在移动设备上提供触觉反馈。

<div class="group">
  <TxButton variant="primary" vibrate-type="light">轻微震动</TxButton>
  <TxButton variant="primary" vibrate-type="medium">中等震动</TxButton>
  <TxButton variant="primary" vibrate-type="heavy">重度震动</TxButton>
  <TxButton variant="danger" vibrate-type="error">错误震动</TxButton>
  <TxButton variant="secondary" :vibrate="false">无震动</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton variant="primary" vibrate-type="light">轻微震动</TxButton>
    <TxButton variant="primary" vibrate-type="medium">中等震动</TxButton>
    <TxButton variant="primary" vibrate-type="heavy">重度震动</TxButton>
    <TxButton variant="danger" vibrate-type="error">错误震动</TxButton>
    <TxButton variant="secondary" :vibrate="false">无震动</TxButton>
  </div>
</template>
```

:::

## API

### Button Attributes

| 参数 | 说明 | 类型 | 可选值 | 默认值 |
|------|------|------|--------|--------|
| variant | 变体 | string | primary / secondary / ghost / danger | — |
| size | 尺寸 | string | sm / md / lg | md |
| block | 是否块级（撑满容器） | boolean | — | false |
| loading | 是否加载中状态 | boolean | — | false |
| disabled | 是否禁用状态 | boolean | — | false |
| autofocus | 是否默认聚焦 | boolean | — | false |
| native-type | 原生 type 属性 | string | button / submit / reset | button |
| vibrate | 是否启用震动反馈 | boolean | — | true |
| vibrate-type | 震动类型 | string | light / medium / heavy / bit / success / warning / error | light |

### Button Events

| 事件名称 | 说明 | 回调参数 |
|----------|------|----------|
| click | 点击时触发 | event |
