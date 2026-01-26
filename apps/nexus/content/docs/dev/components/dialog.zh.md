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

**Since**: {{ $doc.since }}

## 基础用法
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton @click="dialogOpen = true">Open Dialog</TxButton>
    <TxModal v-model="dialogOpen" title="删除项目">
      <p>这项操作不可撤销，确定继续吗？</p>
    </TxModal>
  </template>
---
::

## Demo
::TuffDemo{title="Critical Confirm" description="关键操作保持收束与聚焦。" code-lang="vue"}
---
code: |
  <template>
    <TxButton @click="dialogOpen = true">Open Dialog</TxButton>
    <TxModal v-model="dialogOpen" title="删除项目">
      <p>这项操作不可撤销，确定继续吗？</p>
      <template #footer>
        <TxButton variant="ghost">取消</TxButton>
        <TxButton>确认</TxButton>
      </template>
    </TxModal>
  </template>
---
#preview
<tuff-dialog-demo
  trigger-label="打开弹窗"
  title="删除项目"
  content="这项操作不可撤销，确定继续吗？"
  cancel-label="取消"
  confirm-label="确认"
/>
::

## 交互要点
- 打开时锁定背景滚动。  
- 关闭需要明确的主按钮行为。  
- 保留 ESC 与遮罩关闭策略（可配置）。

## API（简版）
::TuffPropsTable
---
rows:
  - name: modelValue
    type: 'boolean'
    default: 'false'
    description: '弹窗显示'
  - name: title
    type: 'string'
    default: "''"
    description: '标题'
  - name: width
    type: 'string'
    default: "'480px'"
    description: '宽度'
---
::

## Design Notes
- 优先控制层级与可读性，避免过度装饰。  
- 动效保持短促、有收束感。

## 组合示例
::TuffDemo{title="危险确认" description="弹窗配合明确的危险语义。" code-lang="vue"}
---
code: |
  <template>
    <TxButton variant="danger">删除</TxButton>
    <TxModal v-model="open" title="删除项目">
      <TxTag>不可撤销</TxTag>
    </TxModal>
  </template>
---
#preview
<tuff-dialog-demo
  trigger-label="删除"
  title="删除项目"
  content="这项操作不可撤销。"
  cancel-label="取消"
  confirm-label="删除"
/>
::
