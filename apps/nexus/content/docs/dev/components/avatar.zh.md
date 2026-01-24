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

## Demo
<TuffDemo
  title="Size System"
  description="小尺寸适合列表，大尺寸用于详情页。"
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TxAvatar name=\\"TA\\" /&gt;", "  &lt;TxAvatar name=\\"UX\\" /&gt;", "  &lt;TxAvatar name=\\"PM\\" /&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <div class="tuff-demo-row">
      <TxAvatar name="TA" />
      <TxAvatar name="UX" />
      <TxAvatar name="PM" />
    </div>
  </template>
</TuffDemo>

## 基础用法
```vue
<template>
  <TxAvatar name="Talex" />
  <TxAvatar size="lg" name="Tuff" />
</template>
```

## API（简版）
<TuffPropsTable :rows="[
  { name: 'name', type: 'string', default: '-', description: '显示名称' },
  { name: 'src', type: 'string', default: '-', description: '头像图片地址' },
  { name: 'size', type: \"'sm' | 'md' | 'lg'\", default: 'md', description: '尺寸' },
]" />

## Design Notes
- 文字头像默认大写，避免混乱。  
- 头像与用户名间距保持一致，提升识别速度。
