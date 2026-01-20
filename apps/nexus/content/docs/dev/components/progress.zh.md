---
title: Progress 进度
description: 线性进度与状态反馈
category: Feedback
status: beta
since: 1.0.0
tags: [progress, status, loading]
---

# Progress 进度

> 线性进度用于呈现任务阶段与节奏变化。  
> **状态**：Beta

## Demo
<TuffDemo title="Progress States" description="基础进度 + 状态色">
  <template #preview>
    <div class="tuff-demo-row">
      <TuffProgress :percentage="40" />
      <TuffProgress :percentage="72" status="warning" />
      <TuffProgress :percentage="100" status="success" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TuffProgress :percentage="40" />
  <TuffProgress :percentage="72" status="warning" />
  <TuffProgress :percentage="100" status="success" />
</template>`" />
  </template>
</TuffDemo>

## 基础用法
```vue
<template>
  <TuffProgress :percentage="60" />
  <TuffProgress :percentage="60" :show-text="false" />
</template>
```

## API（简版）
<TuffPropsTable :rows="[
  { name: 'percentage', type: 'number', default: '0', description: '进度百分比' },
  { name: 'status', type: \"'success' | 'warning' | 'error'\", default: '-', description: '状态色' },
  { name: 'indeterminate', type: 'boolean', default: 'false', description: '不确定进度' },
]" />
