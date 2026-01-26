---
title: Tooltip 提示
description: 轻量提示与信息层级
category: Feedback
status: beta
since: 1.0.0
tags: [tooltip, hint, overlay]
---

# Tooltip 提示

> 小而轻的提示，不打断流程但能提供必要信息。  
> **状态**：Beta

**Since**: {{ $doc.since }}

## Demo
::TuffDemo{title="Hover Hint" description="短文本提示，保持低侵入感。" code-lang="vue"}
---
code: |
  <template>
    <TxTooltip content="提示信息">
      <TxButton variant="ghost">Hover me</TxButton>
    </TxTooltip>
    <TxTooltip content="信息">
      <TxButton variant="ghost">Info</TxButton>
    </TxTooltip>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-tooltip content="提示信息">
    <tx-button variant="ghost">Hover me</tx-button>
  </tx-tooltip>
  <tx-tooltip content="信息">
    <tx-button variant="ghost">Info</tx-button>
  </tx-tooltip>
</div>
:::

## 基础用法
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxTooltip content="复制成功">
      <TxButton variant="ghost">Copy</TxButton>
    </TxTooltip>
  </template>
---
:::

## API（简版）
::TuffPropsTable
---
rows:
  - name: content
    type: 'string'
    default: '-'
    description: '提示内容'
  - name: placement
    type: 'string'
    default: 'top'
    description: '显示位置'
  - name: open-delay
    type: 'number'
    default: '120'
    description: '延迟显示（ms）'
  - name: close-delay
    type: 'number'
    default: '80'
    description: '延迟关闭（ms）'
---
:::

## Design Notes
- 文案尽量短，避免多行提示。  
- 与触发元素的间距保持轻盈。

## 组合示例
::TuffDemo{title="提示按钮" description="图标按钮搭配提示信息。" code-lang="vue"}
---
code: |
  <template>
    <TxTooltip content="分享">
      <TxButton icon="i-ri-share-line" circle />
    </TxTooltip>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-tooltip content="分享">
    <tx-button icon="i-ri-share-line" circle />
  </tx-tooltip>
</div>
:::
