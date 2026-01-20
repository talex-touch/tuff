---
title: Drawer
description: Side panels and form surfaces
category: Feedback
status: beta
since: 1.0.0
tags: [drawer, panel, overlay]
---

# Drawer

> Side panels for forms and settings.  
> **Status**: Beta

## Demo
<TuffDemo title="Side Drawer" description="Right drawer for forms and settings">
  <template #preview>
    <TuffDrawerDemo
      trigger-label="Open Drawer"
      title="Settings"
      content="Place your form or settings here."
      close-label="Close"
      width="420px"
    />
  </template>
  <template #code>
    <TuffCodeBlock lang="vue" :code="`<template>
  <TxButton @click="drawerOpen = true">Open Drawer</TxButton>
  <TxDrawer v-model:visible="drawerOpen" title="Settings" width="420px">
    <p>Place your form or settings here.</p>
  </TxDrawer>
</template>`" />
  </template>
</TuffDemo>

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'visible', type: 'boolean', default: 'false', description: 'Drawer visibility' },
  { name: 'title', type: 'string', default: 'Drawer', description: 'Title' },
  { name: 'width', type: 'string', default: '360px', description: 'Width' },
]" />
