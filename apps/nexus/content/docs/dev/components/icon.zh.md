---
title: Icon 图标
description: 统一图标体系与密度控制
category: Basic
status: beta
since: 1.0.0
tags: [icon, glyph, visual]
---

# Icon 图标

> 统一图标体系，控制密度与对齐，保证视觉节奏一致。  
> **状态**：Beta

## 基础用法
```vue
<template>
  <TuffIcon name="i-ri-home-line" />
  <TuffIcon name="chevron-down" />
</template>
```

## Demo
<TuffDemo
  title="Icon Density"
  description="保持线性与留白一致。"
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TuffIcon name=\\\"i-ri-home-line\\\" /&gt;", "  &lt;TuffIcon name=\\\"i-ri-search-line\\\" /&gt;", "  &lt;TuffIcon name=\\\"i-ri-settings-3-line\\\" /&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <div class="tuff-demo-row">
      <TuffIcon name="i-ri-home-line" />
      <TuffIcon name="i-ri-search-line" />
      <TuffIcon name="i-ri-settings-3-line" />
    </div>
  </template>
</TuffDemo>

## 类型与来源
- `class`：使用图标类名（推荐）。
- `emoji`：用于轻量强调。
- `file` / `url`：本地或远程图标。
- `builtin`：内置常用图标。

## API（简版）
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | `-` | 图标名称或类名 |
| `size` | `number` | `16` | 图标尺寸 |
| `colorful` | `boolean` | `false` | 是否保留原色 |

## Design Notes
- 与文本对齐时建议保持 `size` 为 16/18/20。  
- 建议在密集列表中使用线性图标，减少视觉噪音。
