---
title: Toast 提示
description: 快速反馈与短暂状态
category: Feedback
status: beta
since: 1.0.0
tags: [toast, feedback, status]
---

# Toast 提示

> 短暂可感知的状态提醒，避免打断操作路径。  
> **状态**：Beta

## Demo
<TuffDemo title="Status Toasts" description="成功、警告、失败三类状态。">
  <template #preview>
    <TuffToastDemo
      success-label="成功"
      warning-label="警告"
      error-label="失败"
      success-title="保存成功"
      success-description="已写入本地"
      warning-title="网络不稳定"
      warning-description="请稍后重试"
      error-title="保存失败"
      error-description="请检查权限"
    />
  </template>
  <template #code>
    <TuffCodeBlock lang="ts" :code='`toast({ title: "保存成功", description: "已写入本地" })
toast({ title: "网络不稳定", description: "请稍后重试", variant: "warning" })
toast({ title: "保存失败", description: "请检查权限", variant: "danger" })`' />
  </template>
</TuffDemo>

## 基础用法
```ts
toast.success('保存成功')
toast.warning('网络不稳定')
toast.error('保存失败')
```

## API（简版）
<TuffPropsTable :rows="[
  { name: 'message', type: 'string', default: '-', description: '提示文案' },
  { name: 'duration', type: 'number', default: '2000', description: '展示时长（ms）' },
  { name: 'level', type: \"'success' | 'warning' | 'error'\", default: 'success', description: '类型' },
]" />

## Design Notes
- 默认 2 秒自动关闭，避免堆叠。  
- 阴影与背景对比需兼顾暗色模式。
