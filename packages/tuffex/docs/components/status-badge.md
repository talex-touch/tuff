# StatusBadge 状态徽标

带有预定义色调和可自定义外观的状态指示器徽标。

## 基础用法

<div class="demo-container">
  <div class="demo-container__row">
    <TxStatusBadge text="成功" status="success" />
    <TxStatusBadge text="警告" status="warning" />
    <TxStatusBadge text="危险" status="danger" />
    <TxStatusBadge text="信息" status="info" />
    <TxStatusBadge text="静默" status="muted" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxStatusBadge text="成功" status="success" />
  <TxStatusBadge text="警告" status="warning" />
  <TxStatusBadge text="危险" status="danger" />
  <TxStatusBadge text="信息" status="info" />
  <TxStatusBadge text="静默" status="muted" />
</template>
```
:::

## 平台标识

在状态徽标前面加上操作系统标识（例如 `macos only`）。

<div class="demo-container">
  <div class="demo-container__row">
    <TxStatusBadge text="macOS only" status="info" os="macos" />
    <TxStatusBadge text="Windows only" status="info" os="windows" />
    <TxStatusBadge text="Linux only" status="info" os="linux" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxStatusBadge text="macOS only" status="info" os="macos" />
  <TxStatusBadge text="Windows only" status="info" os="windows" />
  <TxStatusBadge text="Linux only" status="info" os="linux" />
</template>
```
:::

### 仅显示平台图标

<div class="demo-container">
  <div class="demo-container__row">
    <TxStatusBadge text="macOS" os="macos" os-only status="muted" />
    <TxStatusBadge text="Windows" os="windows" os-only status="muted" />
    <TxStatusBadge text="Linux" os="linux" os-only status="muted" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxStatusBadge text="macOS" os="macos" os-only status="muted" />
  <TxStatusBadge text="Windows" os="windows" os-only status="muted" />
  <TxStatusBadge text="Linux" os="linux" os-only status="muted" />
</template>
```
:::

## 状态键

使用预定义的状态键，自动映射到视觉色调。

<div class="demo-container">
  <div class="demo-container__row">
    <TxStatusBadge text="已授权" statusKey="granted" />
    <TxStatusBadge text="已拒绝" statusKey="denied" />
    <TxStatusBadge text="待确定" statusKey="notDetermined" />
    <TxStatusBadge text="不支持" statusKey="unsupported" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxStatusBadge text="已授权" statusKey="granted" />
  <TxStatusBadge text="已拒绝" statusKey="denied" />
  <TxStatusBadge text="待确定" statusKey="notDetermined" />
  <TxStatusBadge text="不支持" statusKey="unsupported" />
</template>
```
:::

### 状态键映射

| 状态键 | 色调 | 颜色 |
|------------|------|-------|
| `granted` | success | 绿色 |
| `denied` | danger | 红色 |
| `notDetermined` | warning | 橙色 |
| `unsupported` | muted | 灰色 |
| 其他 | info | 蓝色 |

## 尺寸

<div class="demo-container">
  <div class="demo-container__row">
    <TxStatusBadge text="小尺寸" status="success" size="sm" />
    <TxStatusBadge text="中尺寸" status="success" size="md" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxStatusBadge text="小尺寸" status="success" size="sm" />
  <TxStatusBadge text="中尺寸" status="success" size="md" />
</template>
```
:::

## 自定义图标

使用自定义图标覆盖默认图标。

<div class="demo-container">
  <div class="demo-container__row">
    <TxStatusBadge text="自定义图标" status="success" icon="i-carbon-star-filled" />
    <TxStatusBadge text="闪电图标" status="warning" icon="i-carbon-flash" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxStatusBadge text="自定义图标" status="success" icon="i-carbon-star-filled" />
</template>
```
:::

## 权限状态示例

显示权限状态的实际示例。

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
    <div style="display: flex; justify-content: space-between; width: 200px;">
      <span>相机</span>
      <TxStatusBadge text="已允许" statusKey="granted" />
    </div>
    <div style="display: flex; justify-content: space-between; width: 200px;">
      <span>麦克风</span>
      <TxStatusBadge text="已阻止" statusKey="denied" />
    </div>
    <div style="display: flex; justify-content: space-between; width: 200px;">
      <span>位置</span>
      <TxStatusBadge text="待询问" statusKey="notDetermined" />
    </div>
  </div>
</div>

::: details 查看代码
```vue
<template>
  <div class="permission-list">
    <div v-for="permission in permissions" :key="permission.name" class="permission-item">
      <span>{{ permission.name }}</span>
      <TxStatusBadge 
        :text="permission.statusText" 
        :statusKey="permission.status" 
      />
    </div>
  </div>
</template>
```
:::

## API

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `text` | `string` | *必填* | 显示的文本内容 |
| `icon` | `string` | `''` | 自定义图标类名 |
| `status` | `StatusTone` | `undefined` | 视觉状态色调 |
| `statusKey` | `StatusKey` | `''` | 预定义状态键 |
| `size` | `'sm' \| 'md'` | `'md'` | 徽标尺寸 |
| `os` | `'macos' \| 'windows' \| 'linux'` | - | 平台标识图标 |
| `osOnly` | `boolean` | `false` | 仅显示平台图标（隐藏状态图标） |

### 类型

```typescript
type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'
type StatusKey = 'granted' | 'denied' | 'notDetermined' | 'unsupported' | string
```

### 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `click` | `event: MouseEvent` | 点击徽标时触发 |
