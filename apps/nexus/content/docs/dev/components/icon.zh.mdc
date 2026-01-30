---
title: Icon 图标
description: 统一图标体系与密度控制
category: Basic
status: beta
since: 1.0.0
tags: [icon, glyph, visual]
---

# Icon 图标

> 统一图标体系，控制密度与对齐，保证视觉节奏一致。  
> **状态**：Beta


## 基础用法
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TuffIcon name="i-ri-home-line" />
    <TuffIcon name="chevron-down" />
  </template>
---
::

## Demo
::TuffDemo{title="Icon Density" description="保持线性与留白一致。" code-lang="vue"}
---
code: |
  <template>
    <TuffIcon name="i-ri-home-line" />
    <TuffIcon name="i-ri-search-line" />
    <TuffIcon name="i-ri-settings-3-line" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tuff-icon name="i-ri-home-line" />
  <tuff-icon name="i-ri-search-line" />
  <tuff-icon name="i-ri-settings-3-line" />
</div>
::

## 类型与来源
- `class`：使用图标类名（推荐）。
- `emoji`：用于轻量强调。
- `file` / `url`：本地或远程图标。
- `builtin`：内置常用图标。

## API（简版）
::TuffPropsTable
---
rows:
  - name: name
    type: 'string'
    default: '-'
    description: '图标名称或类名'
  - name: size
    type: 'number'
    default: '16'
    description: '图标尺寸'
  - name: colorful
    type: 'boolean'
    default: 'false'
    description: '是否保留原色'
---
::

## Design Notes
- 与文本对齐时建议保持 `size` 为 16/18/20。  
- 建议在密集列表中使用线性图标，减少视觉噪音。

## 组合示例
::TuffDemo{title="图标按钮" description="图标与按钮组合用于快捷操作。" code-lang="vue"}
---
code: |
  <template>
    <TxButton icon="i-ri-add-line">创建</TxButton>
    <TxButton variant="ghost" icon="i-ri-more-2-line">更多</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-button icon="i-ri-add-line">创建</tx-button>
  <tx-button variant="ghost" icon="i-ri-more-2-line">更多</tx-button>
</div>
::
