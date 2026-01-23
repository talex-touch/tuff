---
title: LayoutSkeleton 布局骨架
description: 布局级骨架占位
category: Layout
status: beta
since: 1.0.0
tags: [skeleton, layout, loading]
---

# LayoutSkeleton 布局骨架

> 用于页面/面板级别的布局占位。  
> **状态**：Beta

## Demo
<TuffDemo
  title="Layout Placeholder"
  description="容器决定骨架尺寸。"
  code-lang="vue"
  :code='`<template>
  <div style="height: 240px;">
    <TxLayoutSkeleton />
  </div>
</template>`'
>
  <template #preview>
    <div class="tuff-demo-row" style="width: 100%;">
      <div style="width: 100%; height: 240px;">
        <TxLayoutSkeleton />
      </div>
    </div>
  </template>
</TuffDemo>

## 基础用法
```vue
<template>
  <div style="height: 240px;">
    <TxLayoutSkeleton />
  </div>
</template>
```

## 使用建议
- 外层容器决定骨架尺寸与布局比例。
- 适合页面级加载，占位期间保持节奏感。

## API（简版）
<TuffPropsTable :rows="[
  { name: '—', type: '-', default: '-', description: '无额外 props，尺寸由容器决定' },
]" />
