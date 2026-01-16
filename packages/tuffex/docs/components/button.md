# Button 按钮

按钮用于触发一个操作，如提交表单。该组件风格参考 core-app 的 **TuffButton(TButton)**：圆角 pill 形态，支持 `variant` / `type` / `size` / `block` / `loading` / `disabled`，并提供 `plain` / `round` / `circle` / `dashed` 等外观。

## 基础用法

基础的按钮用法。

<div class="group">
  <TxButton>默认按钮</TxButton>
  <TxButton variant="primary">Primary</TxButton>
  <TxButton variant="secondary">Secondary</TxButton>
  <TxButton variant="ghost">Ghost</TxButton>
  <TxButton variant="danger">Danger</TxButton>
  <TxButton variant="success">Success</TxButton>
  <TxButton variant="warning">Warning</TxButton>
  <TxButton variant="info">Info</TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton>默认按钮</TxButton>
    <TxButton variant="primary">
      Primary
    </TxButton>
    <TxButton variant="secondary">
      Secondary
    </TxButton>
    <TxButton variant="ghost">
      Ghost
    </TxButton>
    <TxButton variant="danger">
      Danger
    </TxButton>
    <TxButton variant="success">
      Success
    </TxButton>
    <TxButton variant="warning">
      Warning
    </TxButton>
    <TxButton variant="info">
      Info
    </TxButton>
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
    <TxButton disabled>
      默认按钮
    </TxButton>
    <TxButton variant="primary" disabled>
      Primary
    </TxButton>
    <TxButton variant="secondary" disabled>
      Secondary
    </TxButton>
    <TxButton variant="ghost" disabled>
      Ghost
    </TxButton>
    <TxButton variant="danger" disabled>
      Danger
    </TxButton>
  </div>
</template>
```

:::

## 加载中

点击按钮后进行数据加载操作，在按钮上显示加载状态。

<script setup>
import { ref } from 'vue'

const loading = ref(false)
const splitLoading = ref(false)

async function handleClick() {
  loading.value = true

  setTimeout(() => {
    loading.value = false
  }, 3000)
}

async function handleRun() {
  if (splitLoading.value) return
  splitLoading.value = true
  setTimeout(() => {
    splitLoading.value = false
  }, 1200)
}
</script>

<div class="group">
  <TxButton variant="primary" :loading="loading" @click="handleClick">
    {{ loading.value ? '加载中' : '点击加载' }}
  </TxButton>
  <TxButton variant="secondary" :loading="loading" @click="handleClick">
    {{ loading.value ? '加载中' : '点击加载' }}
  </TxButton>
  <TxButton circle icon="i-carbon-edit" :loading="loading" @click="handleClick">
  </TxButton>
</div>

::: details Show Code

```vue
<template>
  <div class="group">
    <TxButton variant="primary" loading>
      加载中
    </TxButton>
    <TxButton variant="secondary" loading>
      加载中
    </TxButton>
  </div>
</template>
```

:::

## Split Button

用于“主操作 + 更多操作”的组合按钮（例如 RUN + …）。

<div class="group">
  <TxSplitButton
    variant="primary"
    size="sm"
    icon="i-ri-play-fill"
    :loading="splitLoading"
    @click="handleRun"
  >
    RUN
    <template #menu="{ close }">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <TxButton size="sm" plain block icon="i-ri-settings-3-line" @click="close()">
          Settings
        </TxButton>
        <TxButton size="sm" plain block icon="i-ri-folder-open-line" @click="close()">
          Open Folder
        </TxButton>
      </div>
    </template>
  </TxSplitButton>
</div>

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
    <TxButton size="lg">
      Large
    </TxButton>
    <TxButton size="md">
      Medium
    </TxButton>
    <TxButton size="sm">
      Small
    </TxButton>
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
  <TxButton block variant="primary">
    Block Button
  </TxButton>
</template>
```
:::

## 其他外观

<div class="group">
  <TxButton dashed>Dashed</TxButton>
  <TxButton plain variant="primary">Plain</TxButton>
  <TxButton round variant="primary">Round</TxButton>
  <TxButton circle icon="i-carbon-edit" />
</div>

::: details Show Code
```vue
<template>
  <TxButton dashed>
    Dashed
  </TxButton>
  <TxButton plain variant="primary">
    Plain
  </TxButton>
  <TxButton round variant="primary">
    Round
  </TxButton>
  <TxButton circle icon="i-carbon-edit" />
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
    <TxButton variant="primary" vibrate-type="light">
      轻微震动
    </TxButton>
    <TxButton variant="primary" vibrate-type="medium">
      中等震动
    </TxButton>
    <TxButton variant="primary" vibrate-type="heavy">
      重度震动
    </TxButton>
    <TxButton variant="danger" vibrate-type="error">
      错误震动
    </TxButton>
    <TxButton variant="secondary" :vibrate="false">
      无震动
    </TxButton>
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
