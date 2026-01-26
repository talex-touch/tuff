---
title: Avatar 头像
description: 识别度与尺寸体系
category: Basic
status: beta
since: 1.0.0
tags: [avatar, identity, profile]
---

# Avatar 头像

> 头像是身份的最小单元，需要稳定的尺寸体系与清晰的层级。  
> **状态**：Beta

**Since**: {{ $doc.since }}

## Demo
::TuffDemo{title="Size System" description="小尺寸适合列表，大尺寸用于详情页。" code-lang="vue"}
---
code: |
  <template>
    <TxAvatar name="TA" />
    <TxAvatar name="UX" />
    <TxAvatar name="PM" />
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-avatar name="TA" />
  <tx-avatar name="UX" />
  <tx-avatar name="PM" />
</div>
::

## 基础用法
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxAvatar name="Talex" />
    <TxAvatar size="lg" name="Tuff" />
  </template>
---
::

## API（简版）
::TuffPropsTable
---
rows:
  - name: name
    type: 'string'
    default: '-'
    description: '显示名称'
  - name: src
    type: 'string'
    default: '-'
    description: '头像图片地址'
  - name: size
    type: "'sm' | 'md' | 'lg'"
    default: 'md'
    description: '尺寸'
---
::

## Design Notes
- 文字头像默认大写，避免混乱。  
- 头像与用户名间距保持一致，提升识别速度。

## 组合示例
::TuffDemo{title="身份行" description="头像配合状态与操作按钮。" code-lang="vue"}
---
code: |
  <template>
    <TxAvatar name="TA" />
    <TxStatusBadge text="在线" status="success" />
    <TxButton size="sm">发送消息</TxButton>
  </template>
---
#preview
<div class="tuff-demo-row">
  <tx-avatar name="TA" />
  <tx-status-badge text="在线" status="success" />
  <tx-button size="sm">发送消息</tx-button>
</div>
::
