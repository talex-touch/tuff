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
<TuffDemo
  title="Side Drawer"
  description="Right drawer for forms and settings"
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TxButton @click=\\\"drawerOpen = true\\\"&gt;Open Drawer&lt;/TxButton&gt;", "  &lt;TxDrawer v-model:visible=\\\"drawerOpen\\\" title=\\\"Settings\\\" width=\\\"420px\\\"&gt;", "    &lt;p&gt;Place your form or settings here.&lt;/p&gt;", "  &lt;/TxDrawer&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <TuffDrawerDemo
      trigger-label="Open Drawer"
      title="Settings"
      content="Place your form or settings here."
      close-label="Close"
      width="420px"
    />
  </template>
</TuffDemo>

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'visible', type: 'boolean', default: 'false', description: 'Drawer visibility' },
  { name: 'title', type: 'string', default: 'Drawer', description: 'Title' },
  { name: 'width', type: 'string', default: '360px', description: 'Width' },
]" />
