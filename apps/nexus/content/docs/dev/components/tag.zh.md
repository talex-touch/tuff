---
title: Tag 标签
description: 分类与标记
category: Basic
status: beta
since: 1.0.0
tags: [tag, label, badge]
---

# Tag 标签

> 用于分类、标记与状态提示的小型标签。  
> **状态**：Beta


## Demo
::TuffDemo{title="Tags" description="颜色与尺寸组合" code-lang="vue"}
---
code: |
  <template>
    <TxTag label="默认" />
    <TxTag label="成功" color="var(--tx-color-success)" />
    <TxTag label="警告" color="var(--tx-color-warning)" />
    <TxTag label="危险" color="var(--tx-color-danger)" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-tag label="默认" />
  <tx-tag label="成功" color="var(--tx-color-success)" />
  <tx-tag label="警告" color="var(--tx-color-warning)" />
  <tx-tag label="危险" color="var(--tx-color-danger)" />
</div>
::

## API（简版）
::TuffPropsTable
---
rows:
  - name: label
    type: 'string'
    default: '-'
    description: '文本内容'
  - name: color
    type: 'string'
    default: '-'
    description: '背景色'
  - name: size
    type: "'sm' | 'md'"
    default: 'md'
    description: '尺寸'
---
::

## 组合示例
::TuffDemo{title="标签 + 按钮" description="标签配合按钮突出操作。 " code-lang="vue"}
---
code: |
  <template>
    <TxTag label="Beta" />
    <TxButton size="sm">升级</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-tag label="Beta" />
  <tx-button size="sm">升级</tx-button>
</div>
::
