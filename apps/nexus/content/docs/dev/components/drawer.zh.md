---
title: Drawer 抽屉
description: 侧滑面板与表单承载
category: Feedback
status: beta
since: 1.0.0
tags: [drawer, panel, overlay]
---

# Drawer 抽屉

> 用于侧滑承载表单与复杂内容。  
> **状态**：Beta

**Since**: {{ $doc.since }}

## Demo
::TuffDemo{title="Side Drawer" description="右侧抽屉用于表单与设置面板" code-lang="vue"}
---
code: |
  <template>
    <TxButton @click="drawerOpen = true">Open Drawer</TxButton>
    <TxDrawer v-model:visible="drawerOpen" title="设置" width="420px">
      <p>这里放表单或设置项。</p>
    </TxDrawer>
  </template>
---
#preview
<tuff-drawer-demo
  trigger-label="打开抽屉"
  title="设置"
  content="这里放表单或设置项。"
  close-label="关闭"
  width="420px"
/>
::

## API（简版）
::TuffPropsTable
---
rows:
  - name: visible
    type: 'boolean'
    default: 'false'
    description: '抽屉显示'
  - name: title
    type: 'string'
    default: 'Drawer'
    description: '标题'
  - name: width
    type: 'string'
    default: '360px'
    description: '宽度'
---
::

## 组合示例
::TuffDemo{title="设置面板" description="抽屉配合快捷设置项。" code-lang="vue"}
---
code: |
  <template>
    <TxButton>打开设置</TxButton>
    <TxDrawer v-model:visible="open" title="设置">
      <TxSwitch />
    </TxDrawer>
  </template>
---
#preview
<tuff-drawer-demo
  trigger-label="打开设置"
  title="设置"
  content="这里放快捷开关。"
  close-label="关闭"
  width="420px"
/>
::
