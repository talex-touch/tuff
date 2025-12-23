# Dialog 对话框

用于显示重要信息和获取用户确认的对话框组件。

<script setup lang="ts">
import { ref } from 'vue'

const bottomOpen = ref(false)
const blowOpen = ref(false)
const popperOpen = ref(false)
const tipOpen = ref(false)
</script>

## BottomDialog 底部对话框

底部定位的对话框，带有可自定义的按钮和动画效果。

### 基础用法

<DemoBlock title="BottomDialog">
<template #preview>
<TxButton @click="bottomOpen = true">显示对话框</TxButton>

<TxBottomDialog
  v-if="bottomOpen"
  title="确认操作"
  message="您确定要继续吗？"
  :btns="[
    { content: '取消', type: 'info', onClick: () => true },
    { content: '确认', type: 'success', onClick: async () => true },
  ]"
  :close="() => (bottomOpen = false)"
/>
</template>

<template #code>
```vue
<template>
  <TxButton @click="bottomOpen = true">显示对话框</TxButton>
  <TxBottomDialog
    v-if="bottomOpen"
    title="确认操作"
    message="您确定要继续吗？"
    :btns="[
      { content: '取消', type: 'info', onClick: () => true },
      { content: '确认', type: 'success', onClick: async () => true },
    ]"
    :close="() => (bottomOpen = false)"
  />
</template>
```
</template>
</DemoBlock>

### 按钮类型

```ts
const btns = [
  { content: '信息', type: 'info', onClick: () => true },
  { content: '警告', type: 'warning', onClick: () => true },
  { content: '错误', type: 'error', onClick: () => true },
  { content: '成功', type: 'success', onClick: () => true },
]
```

### 自动点击计时器

按钮可以设置自动倒计时点击。

```ts
const btns = [
  {
    content: '自动确认',
    type: 'success',
    time: 5,
    onClick: () => true,
  },
]
```

### 加载状态

处理异步操作时显示加载状态。

```ts
const btns = [
  {
    content: '提交',
    type: 'success',
    onClick: async () => {
      await saveData()
      return true
    },
  },
]
```

---

## BlowDialog 爆炸对话框

带有戏剧性"爆炸"动画效果的居中对话框。

### 基础用法

<DemoBlock title="BlowDialog">
<template #preview>
<TxButton @click="blowOpen = true">显示爆炸对话框</TxButton>

<TxBlowDialog
  v-if="blowOpen"
  title="欢迎"
  message="<strong>你好！</strong> 欢迎使用我们的应用。"
  :close="() => (blowOpen = false)"
/>
</template>

<template #code>
```vue
<template>
  <TxButton @click="blowOpen = true">显示爆炸对话框</TxButton>
  <TxBlowDialog
    v-if="blowOpen"
    title="欢迎"
    message="<strong>你好！</strong> 欢迎使用我们的应用。"
    :close="() => (blowOpen = false)"
  />
</template>
```
</template>
</DemoBlock>

---

## PopperDialog 弹出对话框

<DemoBlock title="PopperDialog">
<template #preview>
<TxButton @click="popperOpen = true">显示弹出对话框</TxButton>

<TxPopperDialog
  v-if="popperOpen"
  title="Tip"
  message="这是一段提示内容。"
  :close="() => (popperOpen = false)"
/>
</template>

<template #code>
```vue
<template>
  <TxButton @click="popperOpen = true">显示弹出对话框</TxButton>
  <TxPopperDialog
    v-if="popperOpen"
    title="Tip"
    message="这是一段提示内容。"
    :close="() => (popperOpen = false)"
  />
</template>
```
</template>
</DemoBlock>

---

## TouchTip 触控提示

<DemoBlock title="TouchTip">
<template #preview>
<TxButton @click="tipOpen = true">显示 TouchTip</TxButton>

<TxTouchTip
  v-if="tipOpen"
  title="提示"
  message="请选择一个操作。"
  :buttons="[
    { content: '取消', type: 'info', onClick: () => true },
    { content: '确定', type: 'success', onClick: async () => true },
  ]"
  :close="() => (tipOpen = false)"
/>
</template>

<template #code>
```vue
<template>
  <TxButton @click="tipOpen = true">显示 TouchTip</TxButton>
  <TxTouchTip
    v-if="tipOpen"
    title="提示"
    message="请选择一个操作。"
    :buttons="[
      { content: '取消', type: 'info', onClick: () => true },
      { content: '确定', type: 'success', onClick: async () => true },
    ]"
    :close="() => (tipOpen = false)"
  />
</template>
```
</template>
</DemoBlock>

### 自定义组件

在对话框内渲染自定义组件。

```ts
import CustomContent from './CustomContent.vue'

function showCustomDialog() {
  return h(TxBlowDialog, {
    comp: CustomContent,
    close: () => {},
  })
}
```

### 渲染函数

使用渲染函数创建动态内容。

```ts
function showRenderDialog() {
  return h(TxBlowDialog, {
    render: () => h('div', [
      h('h2', '动态内容'),
      h('p', '使用渲染函数创建'),
    ]),
    close: () => {},
  })
}
```

---

## API

### TxBottomDialog 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `title` | `string` | `''` | 对话框标题 |
| `message` | `string` | `''` | 对话框消息 |
| `stay` | `number` | `0` | 自动关闭时长 (毫秒) |
| `close` | `() => void` | *必填* | 关闭回调 |
| `btns` | `DialogButton[]` | `[]` | 按钮配置 |
| `icon` | `string` | `''` | 图标类名 |
| `index` | `number` | `0` | z-index 偏移量 |

### DialogButton 接口

```typescript
interface DialogButton {
  content: string                         // 按钮文本
  type?: 'info' | 'warning' | 'error' | 'success'
  time?: number                           // 自动点击倒计时 (秒)
  onClick: () => Promise<boolean> | boolean  // 返回 true 关闭对话框
  loading?: (done: () => void) => void    // 加载回调
}
```

### TxBlowDialog 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `title` | `string` | `''` | 对话框标题 |
| `message` | `string` | `''` | 消息内容 (支持 HTML) |
| `close` | `() => void` | *必填* | 关闭回调 |
| `comp` | `Component` | `undefined` | 自定义组件 |
| `render` | `() => VNode` | `undefined` | 渲染函数 |

### TxPopperDialog 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `title` | `string` | `''` | 对话框标题 |
| `message` | `string` | `''` | 消息内容 (支持 HTML) |
| `close` | `() => void` | *必填* | 关闭回调 |
| `comp` | `Component` | `undefined` | 自定义组件 |
| `render` | `() => VNode` | `undefined` | 渲染函数 |

### TxTouchTip 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `title` | `string` | `''` | 标题 |
| `message` | `string` | `''` | 文本内容 |
| `buttons` | `TouchTipButton[]` | `[]` | 按钮配置 |
| `close` | `() => void` | *必填* | 关闭回调 |

### 无障碍支持

这些对话框组件都支持：
- **ESC 键** 关闭
- 对话框内 **焦点捕获**
- 关闭时 **焦点恢复**
- 正确的 **ARIA 属性** 支持屏幕阅读器
