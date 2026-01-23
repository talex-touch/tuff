---
title: Dialog 弹窗
description: 交互闭环与确认场景
category: Feedback
status: beta
since: 1.0.0
tags: [dialog, modal, confirm]
---

# Dialog 弹窗

> 用于关键确认与安全关闭，强调焦点控制与信息层级。  
> **状态**：Beta

## 基础用法
```vue
<template>
  <TxButton @click="dialogOpen = true">Open Dialog</TxButton>
  <TxModal v-model="dialogOpen" title="删除项目">
    <p>这项操作不可撤销，确定继续吗？</p>
  </TxModal>
</template>
```

## Demo
<TuffDemo
  title="Critical Confirm"
  description="关键操作保持收束与聚焦。"
  code-lang="vue"
  :code='`<template>
  <TxButton @click="dialogOpen = true">Open Dialog</TxButton>
  <TxModal v-model="dialogOpen" title="删除项目">
    <p>这项操作不可撤销，确定继续吗？</p>
    <template #footer>
      <TxButton variant="ghost">取消</TxButton>
      <TxButton>确认</TxButton>
    </template>
  </TxModal>
</template>`'
>
  <template #preview>
    <TuffDialogDemo
      trigger-label="打开弹窗"
      title="删除项目"
      content="这项操作不可撤销，确定继续吗？"
      cancel-label="取消"
      confirm-label="确认"
    />
  </template>
</TuffDemo>

## 交互要点
- 打开时锁定背景滚动。  
- 关闭需要明确的主按钮行为。  
- 保留 ESC 与遮罩关闭策略（可配置）。

## API（简版）
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `boolean` | `false` | 弹窗显示 |
| `title` | `string` | `''` | 标题 |
| `width` | `string` | `'480px'` | 宽度 |

## Design Notes
- 优先控制层级与可读性，避免过度装饰。  
- 动效保持短促、有收束感。
