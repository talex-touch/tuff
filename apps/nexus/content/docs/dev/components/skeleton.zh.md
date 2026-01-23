---
title: Skeleton 骨架屏
description: 加载占位与结构提示
category: Feedback
status: beta
since: 1.0.0
tags: [skeleton, loading, placeholder]
---

# Skeleton 骨架屏

> 加载中结构提示，避免内容跳动。  
> **状态**：Beta

## Demo
<TuffDemo
  title="Skeleton"
  description="文本与头像混合占位"
  code-lang="vue"
  :code='`<template>
  <TxSkeleton :loading="true" :lines="3" />
  <TxSkeleton variant="circle" :width="40" :height="40" />
</template>`'
>
  <template #preview>
    <div class="tuff-demo-row">
      <TxSkeleton :loading="true" :lines="3" />
      <TxSkeleton variant="circle" :width="40" :height="40" />
    </div>
  </template>
</TuffDemo>

## API（简版）
<TuffPropsTable :rows="[
  { name: 'loading', type: 'boolean', default: 'true', description: '是否显示骨架' },
  { name: 'lines', type: 'number', default: '3', description: '文本行数' },
  { name: 'variant', type: \"'line' | 'circle'\", default: 'line', description: '形状' },
]" />
