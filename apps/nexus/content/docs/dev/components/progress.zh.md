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

**Since**: {{ $doc.since }}

## Demo
::TuffDemo{title="Progress States" description="基础进度 + 状态色" code-lang="vue"}
---
code: |
  <template>
    <TuffProgress :percentage="40" />
    <TuffProgress :percentage="72" status="warning" />
    <TuffProgress :percentage="100" status="success" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-progress :percentage="40" />
  <tuff-progress :percentage="72" status="warning" />
  <tuff-progress :percentage="100" status="success" />
</div>
::

## 基础用法
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TuffProgress :percentage="60" />
    <TuffProgress :percentage="60" :show-text="false" />
  </template>
---
::

## API（简版）
::TuffPropsTable
---
rows:
  - name: percentage
    type: 'number'
    default: '0'
    description: '进度百分比'
  - name: status
    type: "'success' | 'warning' | 'error'"
    default: '-'
    description: '状态色'
  - name: indeterminate
    type: 'boolean'
    default: 'false'
    description: '不确定进度'
---
::

## 组合示例
::TuffDemo{title="进度行" description="进度条配合状态提示使用。" code-lang="vue"}
---
code: |
  <template>
    <TuffProgress :percentage="60" />
    <TxStatusBadge text="进行中" status="warning" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-progress :percentage="60" />
  <tx-status-badge text="进行中" status="warning" />
</div>
::
