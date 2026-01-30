---
title: ProgressBar 进度条
description: 多状态进度条与加载反馈
category: Feedback
status: beta
since: 1.0.0
tags: [progress, bar, loading]
---

# ProgressBar 进度条

> 更细颗粒的进度反馈，支持 loading / success / error。  
> **状态**：Beta


## Demo
::TuffDemo{title="Stateful Progress" description="加载、警告、成功态一屏展示。" code-lang="vue"}
---
code: |
  <template>
    <TxProgressBar :percentage="32" show-text />
    <TxProgressBar :percentage="68" status="warning" show-text />
    <TxProgressBar success message="完成" />
    <TxProgressBar loading message="同步中" />
  </template>
---
#preview
<div class="tuff-demo-row" style="flex-direction: column; align-items: stretch; width: 100%;">
  <tx-progress-bar :percentage="32" show-text />
  <tx-progress-bar :percentage="68" status="warning" show-text />
  <tx-progress-bar success message="完成" />
  <tx-progress-bar loading message="同步中" />
</div>
::

## 基础用法
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxProgressBar :percentage="45" show-text />
    <TxProgressBar loading />
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
  - name: loading
    type: 'boolean'
    default: 'false'
    description: '不确定加载态'
  - name: status
    type: "'success' | 'error' | 'warning'"
    default: '-'
    description: '状态色'
  - name: message
    type: 'string'
    default: '-'
    description: '自定义文本'
  - name: showText
    type: 'boolean'
    default: 'false'
    description: '显示百分比'
  - name: maskVariant
    type: "'solid' | 'dashed' | 'plain'"
    default: 'solid'
    description: '底部轨道样式'
  - name: flowEffect
    type: "'none' | 'shimmer' | 'wave' | 'particles'"
    default: 'none'
    description: '流动效果'
---
::

## 组合示例
::TuffDemo{title="状态面板" description="进度条配合状态提示使用。" code-lang="vue"}
---
code: |
  <template>
    <TxProgressBar :percentage="80" show-text message="上传中" />
    <TxStatusBadge text="进行中" status="warning" />
  </template>
---
#preview
<div class="tuff-demo-row" style="flex-direction: column; align-items: stretch; width: 100%;">
  <tx-progress-bar :percentage="80" show-text message="上传中" />
  <tx-status-badge text="进行中" status="warning" />
</div>
::
