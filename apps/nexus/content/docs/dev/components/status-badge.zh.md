---
title: StatusBadge 状态徽标
description: 状态标识与系统反馈
category: Feedback
status: beta
since: 1.0.0
tags: [badge, status, signal]
---

# StatusBadge 状态徽标

> 用于状态指示与系统反馈的轻量徽标。  
> **状态**：Beta

## Demo
<TuffDemo title="Status Signals" description="成功/警告/错误/信息">
  <template #preview>
    <div class="tuff-demo-row">
      <TxStatusBadge text="成功" status="success" />
      <TxStatusBadge text="警告" status="warning" />
      <TxStatusBadge text="错误" status="danger" />
      <TxStatusBadge text="信息" status="info" />
    </div>
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code='`<template>
  <TxStatusBadge text="成功" status="success" />
  <TxStatusBadge text="警告" status="warning" />
  <TxStatusBadge text="错误" status="danger" />
  <TxStatusBadge text="信息" status="info" />
</template>`' />
  </template>
</TuffDemo>

## API（简版）
<TuffPropsTable :rows="[
  { name: 'text', type: 'string', default: '-', description: '显示文字' },
  { name: 'status', type: \"'success' | 'warning' | 'danger' | 'info' | 'muted'\", default: 'info', description: '状态类型' },
  { name: 'size', type: \"'sm' | 'md'\", default: 'md', description: '尺寸' },
]" />
