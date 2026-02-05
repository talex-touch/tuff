# Button 按钮

按钮用于触发一个操作，如提交表单。该组件风格参考 core-app 的 **TuffButton(TButton)**：圆角 pill 形态，支持 `variant` / `type` / `size` / `block` / `loading` / `disabled`，并提供 `plain` / `round` / `circle` / `dashed` 等外观。

## Usage

按钮是最常用的触发器，建议用于触发明确的主操作或状态切换：

- 保持每个视图只有一个主按钮，避免主次权重混乱
- 使用 `variant` 和 `size` 建立动作层级

## Variants

### Appearance

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

### Disabled

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

### Loading

点击按钮后进行数据加载操作，在按钮上显示加载状态。

<script setup>
import { ref } from 'vue'

const loading = ref(false)
const splitLoading = ref(false)

const buttonProps = [
  {
    name: 'variant',
    description: '视觉风格变体',
    type: "'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info' | 'flat' | 'bare'",
    default: '-',
  },
  {
    name: 'type',
    description: '快捷语义类型（兼容旧用法）',
    type: "'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'",
    default: '-',
  },
  {
    name: 'size',
    description: '按钮尺寸',
    type: "'sm' | 'md' | 'lg' | 'large' | 'small' | 'mini'",
    default: "'md'",
  },
  {
    name: 'block',
    description: '是否块级（撑满容器）',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'plain',
    description: '是否朴素按钮',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'dashed',
    description: '是否虚线按钮',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'round',
    description: '是否圆角按钮',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'circle',
    description: '是否圆形按钮',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'loading',
    description: '是否加载中状态',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'loading-variant',
    description: '加载样式变体',
    type: "'spinner' | 'bar'",
    default: "'spinner'",
  },
  {
    name: 'disabled',
    description: '是否禁用状态',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'border',
    description: '是否显示边框',
    type: 'boolean',
    default: 'true',
  },
  {
    name: 'icon',
    description: '图标类名',
    type: 'string',
    default: '-',
  },
  {
    name: 'autofocus',
    description: '是否默认聚焦',
    type: 'boolean',
    default: 'false',
  },
  {
    name: 'native-type',
    description: '原生 type 属性',
    type: "'button' | 'submit' | 'reset'",
    default: "'button'",
  },
  {
    name: 'vibrate',
    description: '是否启用震动反馈',
    type: 'boolean',
    default: 'true',
  },
  {
    name: 'vibrate-type',
    description: '震动类型',
    type: "'light' | 'medium' | 'heavy' | 'bit' | 'success' | 'warning' | 'error'",
    default: "'light'",
  },
]

const buttonEvents = [
  {
    name: 'click',
    description: '点击时触发',
    type: '(event: MouseEvent) => void',
    default: '-',
  },
]

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
<div class="group" style="width: 260px;">
  <TxButton block variant="primary" loading loading-variant="bar">
    处理中
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
  <div class="group" style="width: 260px;">
    <TxButton block variant="primary" loading loading-variant="bar">
      处理中
    </TxButton>
  </div>
</template>
```

:::

### Sizes

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

### Block

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

### Shapes

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

### Haptics

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

## API Specifications

<ApiSpecTable title="Button Attributes" :rows="buttonProps" />

<ApiSpecTable title="Button Events" :rows="buttonEvents" />

## Composition Notes

### Split Button

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

### Primary + Ghost

主动作 + 次动作组合时，建议使用 `primary + ghost` 保持层级清晰。

<div class="group">
  <TxButton variant="primary">
    Confirm
  </TxButton>
  <TxButton variant="ghost">
    Learn More
  </TxButton>
</div>

## Design Principles

- 主按钮始终只有一个，避免操作权重冲突
- 同类操作保持 `variant` 一致，方便用户形成记忆
- 异步操作必须搭配 `loading`，避免重复触发
- 移动端优先使用 `vibrate` 增强触感反馈

## Source

<DocSourceLink />
