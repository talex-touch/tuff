---
title: Button 按钮
description: 触感按钮与扁平按钮的核心交互
category: Basic
status: beta
since: 1.0.0
tags: [action, tactile, primary]
---

# Button 按钮

> 触感与阻尼并存的按钮体系，强调“按下去”的真实反馈。  
> **状态**：Beta

<div class="tuff-doc-canvas">
  <TuffComponentCanvas name="Button">
    <TxButton variant="primary" size="lg">
      Action Label
    </TxButton>
  </TuffComponentCanvas>
</div>

## Usage

按钮用于触发明确的动作，建议在界面里保持主次层级清晰：

- 同一界面只保留一个主按钮，避免权重冲突
- 通过 `variant` 与 `size` 传递动作层级
- 异步操作必须展示 `loading`，避免重复触发

## Variants

### Appearance

基础外观与主次层级组合。

:::TuffDemo{title="Primary / Flat" description="触感与扁平并置，用于不同层级场景。" code-lang="vue"}
---
code: |
  <template>
    <TxButton>Primary</TxButton>
    <TuffFlatButton>Flat</TuffFlatButton>
    <TxButton variant="ghost">Ghost</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-button>Primary</tx-button>
  <tuff-flat-button>Flat</tuff-flat-button>
  <tx-button variant="ghost">Ghost</tx-button>
</div>
:::

### States

加载与禁用场景的状态表达。

:::TuffDemo{title="Loading / Disabled" description="异步操作与不可用状态。" code-lang="vue"}
---
code: |
  <template>
    <TxButton variant="primary" loading>加载中</TxButton>
    <TxButton variant="ghost" disabled>不可用</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-button variant="primary" :loading="loading" @click="handleClick">
    {{ loading ? '加载中' : '点击加载' }}
  </tx-button>
  <tx-button variant="ghost" disabled>不可用</tx-button>
</div>
:::

### Sizes

尺寸决定触感和视觉层级的密度。

:::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton size="lg">Large</TxButton>
    <TxButton size="md">Medium</TxButton>
    <TxButton size="sm">Small</TxButton>
  </template>
---
:::

### Block

在卡片或表单中使用块级按钮。

:::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton block variant="primary">Block Button</TxButton>
  </template>
---
:::

### Shapes

通过 `plain` / `round` / `circle` / `dashed` 调整形态。

:::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton dashed>Dashed</TxButton>
    <TxButton plain variant="primary">Plain</TxButton>
    <TxButton round variant="primary">Round</TxButton>
    <TxButton circle icon="i-carbon-edit" />
  </template>
---
:::

### Haptics

移动端触觉反馈强化按下感。

:::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton variant="primary" vibrate-type="light">轻微震动</TxButton>
    <TxButton variant="primary" vibrate-type="medium">中等震动</TxButton>
    <TxButton variant="primary" vibrate-type="heavy">重度震动</TxButton>
    <TxButton variant="danger" vibrate-type="error">错误震动</TxButton>
    <TxButton variant="secondary" :vibrate="false">无震动</TxButton>
  </template>
---
:::

## API Specifications

### Button Attributes

:::TuffPropsTable
---
rows:
  - name: variant
    type: "'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info' | 'flat' | 'bare'"
    default: '-'
    description: '视觉风格变体'
  - name: type
    type: "'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'"
    default: '-'
    description: '快捷语义类型（兼容旧用法）'
  - name: size
    type: "'sm' | 'md' | 'lg' | 'large' | 'small' | 'mini'"
    default: "'md'"
    description: '按钮尺寸'
  - name: block
    type: 'boolean'
    default: 'false'
    description: '是否块级（撑满容器）'
  - name: plain
    type: 'boolean'
    default: 'false'
    description: '是否朴素按钮'
  - name: dashed
    type: 'boolean'
    default: 'false'
    description: '是否虚线按钮'
  - name: round
    type: 'boolean'
    default: 'false'
    description: '是否圆角按钮'
  - name: circle
    type: 'boolean'
    default: 'false'
    description: '是否圆形按钮'
  - name: loading
    type: 'boolean'
    default: 'false'
    description: '是否加载中状态'
  - name: disabled
    type: 'boolean'
    default: 'false'
    description: '是否禁用状态'
  - name: icon
    type: 'string'
    default: '-'
    description: '图标类名'
  - name: autofocus
    type: 'boolean'
    default: 'false'
    description: '是否默认聚焦'
  - name: native-type
    type: "'button' | 'submit' | 'reset'"
    default: "'button'"
    description: '原生 type 属性'
  - name: vibrate
    type: 'boolean'
    default: 'true'
    description: '是否启用震动反馈'
  - name: vibrate-type
    type: "'light' | 'medium' | 'heavy' | 'bit' | 'success' | 'warning' | 'error'"
    default: "'light'"
    description: '震动类型'
---
:::

### Button Events

:::TuffPropsTable
---
rows:
  - name: click
    type: '(event: MouseEvent) => void'
    default: '-'
    description: '点击时触发'
---
:::

### 类型
::TuffCodeBlock{lang="ts"}
---
code: |
  import type { TxButtonProps } from '@talex-touch/tuffex'

  export interface ButtonProps extends TxButtonProps {}
---
::

## Composition Notes

### Primary + Ghost

主动作 + 次动作组合时使用 `primary + ghost` 保持层级清晰。

:::TuffDemo{title="组合动作" description="主要动作与幽灵按钮组合使用。" code-lang="vue"}
---
code: |
  <template>
    <TxButton icon="i-ri-add-line">创建项目</TxButton>
    <TxButton variant="ghost">次要操作</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-button icon="i-ri-add-line">创建项目</tx-button>
  <tx-button variant="ghost">次要操作</tx-button>
</div>
:::

## Design Principles

- 强调按压反馈与弹性回弹
- 透明材质与阴影层次需要配合背景使用
- Icon 与文字间距保持一致，避免视觉偏移

## Source

<TuffDocSourceLink />

<script setup>
import { ref } from 'vue'

const loading = ref(false)

async function handleClick() {
  loading.value = true

  setTimeout(() => {
    loading.value = false
  }, 3000)
}
</script>

<style scoped>
.tuff-doc-canvas {
  margin: 18px 0 32px;
}
</style>
