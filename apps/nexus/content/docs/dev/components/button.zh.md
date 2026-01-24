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

## 基础用法
```vue
<template>
  <TxButton>Primary</TxButton>
  <TuffFlatButton>Flat</TuffFlatButton>
</template>
```

## 状态与变体
- `loading`：加载中状态  
- `disabled`：禁用状态  
- `size`：`sm` / `md` / `lg`（视觉与触感同步缩放）

## 组合示例
```vue
<template>
  <TxButton icon="i-ri-add-line">Create</TxButton>
  <TxButton variant="ghost">Ghost</TxButton>
</template>
```

## Demo
<TuffDemo
  title="Primary / Flat"
  description="触感与扁平并置，用于不同层级场景。"
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TxButton&gt;Primary&lt;/TxButton&gt;", "  &lt;TuffFlatButton&gt;Flat&lt;/TuffFlatButton&gt;", "  &lt;TxButton variant=\\\"ghost\\\"&gt;Ghost&lt;/TxButton&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <div class="tuff-demo-row">
      <TxButton>Primary</TxButton>
      <TuffFlatButton>Flat</TuffFlatButton>
      <TxButton variant="ghost">Ghost</TxButton>
    </div>
  </template>
</TuffDemo>

## Demo 约定
- 交互 Demo 使用 `client-only` 包裹。  
- 示例需可复制运行，避免截图占位。

## API（简版）
<TuffPropsTable :rows="[
  { name: 'variant', type: \"'primary' | 'secondary' | 'ghost' | 'danger'\", default: 'primary', description: '按钮视觉类型' },
  { name: 'size', type: \"'sm' | 'md' | 'lg'\", default: 'md', description: '尺寸' },
  { name: 'loading', type: 'boolean', default: 'false', description: '加载状态' },
  { name: 'disabled', type: 'boolean', default: 'false', description: '禁用状态' },
]" />

## Design Notes
- 强调按压反馈与弹性回弹。  
- 透明材质与阴影层次需要配合背景使用。  
- Icon 与文字间距保持一致，避免视觉偏移。
