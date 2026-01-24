---
title: Tag
description: Categories and labels
category: Basic
status: beta
since: 1.0.0
tags: [tag, label, badge]
---

# Tag

> Small labels for categories, status, and context.  
> **Status**: Beta

## Demo
<TuffDemo
  title="Tags"
  description="Color and size variations"
  code-lang="vue"
  :code-lines='["&lt;template&gt;", "  &lt;TxTag label=\\"Default\\" /&gt;", "  &lt;TxTag label=\\"Success\\" color=\\"var(--tx-color-success)\\" /&gt;", "  &lt;TxTag label=\\"Warning\\" color=\\"var(--tx-color-warning)\\" /&gt;", "  &lt;TxTag label=\\"Danger\\" color=\\"var(--tx-color-danger)\\" /&gt;", "&lt;/template&gt;"]'
>
  <template #preview>
    <div class="tuff-demo-row">
      <TxTag label="Default" />
      <TxTag label="Success" color="var(--tx-color-success)" />
      <TxTag label="Warning" color="var(--tx-color-warning)" />
      <TxTag label="Danger" color="var(--tx-color-danger)" />
    </div>
  </template>
</TuffDemo>

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'label', type: 'string', default: '-', description: 'Label text' },
  { name: 'color', type: 'string', default: '-', description: 'Background color' },
  { name: 'size', type: \"'sm' | 'md'\", default: 'md', description: 'Size' },
]" />
