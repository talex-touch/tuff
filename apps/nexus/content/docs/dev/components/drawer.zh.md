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

## Demo
<TuffDemo title="Side Drawer" description="右侧抽屉用于表单与设置面板">
  <template #preview>
    <TuffDrawerDemo
      trigger-label="打开抽屉"
      title="设置"
      content="这里放表单或设置项。"
      close-label="关闭"
      width="420px"
    />
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TxButton @click="drawerOpen = true">Open Drawer</TxButton>
  <TxDrawer v-model:visible="drawerOpen" title="设置" width="420px">
    <p>这里放表单或设置项。</p>
  </TxDrawer>
</template>`" />
  </template>
</TuffDemo>

## API（简版）
<TuffPropsTable :rows="[
  { name: 'visible', type: 'boolean', default: 'false', description: '抽屉显示' },
  { name: 'title', type: 'string', default: 'Drawer', description: '标题' },
  { name: 'width', type: 'string', default: '360px', description: '宽度' },
]" />
