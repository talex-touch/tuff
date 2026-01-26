---
title: Input 输入
description: 轻量输入框与搜索态
category: Form
status: beta
since: 1.0.0
tags: [input, field, search]
---

# Input 输入

> 更轻的输入框，更克制的边界，强调可读性与聚焦态。  
> **状态**：Beta

**Since**: {{ $doc.since }}

## 基础用法
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TuffInput v-model="value" placeholder="输入内容..." />
    <TxSearchInput v-model="keyword" placeholder="搜索..." />
  </template>
---
::

## Demo
::TuffDemo{title="Focus State" description="聚焦态更轻，避免夺目。" code-lang="vue"}
---
code: |
  <template>
    <TuffInput model-value="" placeholder="输入内容..." />
    <TxSearchInput model-value="" placeholder="搜索..." />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-input model-value="" placeholder="输入内容..." />
  <tx-search-input model-value="" placeholder="搜索..." />
</div>
::

## 状态
::TuffPropsTable
---
rows:
  - name: disabled
    description: '禁用态'
  - name: error
    description: '错误态'
  - name: loading
    description: '加载态'
---
::

## API（简版）
::TuffPropsTable
---
rows:
  - name: modelValue
    type: 'string'
    default: "''"
    description: '输入值'
  - name: placeholder
    type: 'string'
    default: "''"
    description: '占位文案'
  - name: disabled
    type: 'boolean'
    default: 'false'
    description: '禁用状态'
---
::

## Design Notes
- 聚焦态优先通过边框与阴影的细微变化体现。  
- 搜索态更轻，适合工具栏与列表筛选。

## 组合示例
::TuffDemo{title="搜索行" description="输入框配合按钮完成快速检索。" code-lang="vue"}
---
code: |
  <template>
    <TuffInput placeholder="搜索..." />
    <TxButton size="sm">搜索</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-input placeholder="搜索..." />
  <tx-button size="sm">搜索</tx-button>
</div>
::
