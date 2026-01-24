---
title: Switch 开关
description: 轻触反馈与状态切换
category: Form
status: beta
since: 1.0.0
tags: [switch, toggle, state]
---

# Switch 开关

> 轻触反馈 + 明确状态色，适合密集设置页。  
> **状态**：Beta

## 基础用法
```vue
<template>
  <TuffSwitch v-model="enabled" />
  <TuffSwitch v-model="enabled" size="small" />
</template>
```

## Demo
<TuffDemo
  title="Toggle State"
  description="移动与颜色同步变化。"
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TuffSwitch :model-value=\\"false\\" /&gt;", "  &lt;TuffSwitch :model-value=\\"true\\" /&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <div class="tuff-demo-row">
      <TuffSwitch :model-value="false" />
      <TuffSwitch :model-value="true" />
    </div>
  </template>
</TuffDemo>

## 状态
- `disabled`：禁用态  
- `loading`：加载态  
- `size`：`small` / `medium` / `large`

## API（简版）
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `boolean` | `false` | 开关值 |
| `size` | `'small' | 'medium' | 'large'` | `'medium'` | 尺寸 |
| `disabled` | `boolean` | `false` | 禁用状态 |

## Design Notes
- 开关位移与颜色变化必须同步。  
- 小尺寸用于列表，大尺寸用于设置页。
