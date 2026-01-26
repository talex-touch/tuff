---
title: Dialog
description: Confirmation flows and critical decisions
category: Feedback
status: beta
since: 1.0.0
tags: [dialog, modal, confirm]
---

# Dialog

> For critical confirmations, with strict focus control and hierarchy.  
> **Status**: Beta

**Since**: {{ $doc.since }}

## Basic Usage
::TuffCodeBlock{lang="vue"}
---
code: |
  <template>
    <TxButton @click="dialogOpen = true">Open Dialog</TxButton>
    <TxModal v-model="dialogOpen" title="Delete project">
      <p>This action cannot be undone. Continue?</p>
    </TxModal>
  </template>
---
::

## Demo
::TuffDemo{title="Critical Confirm" description="Keep focus and a decisive hierarchy." code-lang="vue"}
---
code: |
  <template>
    <TxButton @click="dialogOpen = true">Open Dialog</TxButton>
    <TxModal v-model="dialogOpen" title="Delete project">
      <p>This action cannot be undone. Continue?</p>
      <template #footer>
        <TxButton variant="ghost">Cancel</TxButton>
        <TxButton>Confirm</TxButton>
      </template>
    </TxModal>
  </template>
---
#preview
<tuff-dialog-demo
  trigger-label="Open Dialog"
  title="Delete project"
  content="This action cannot be undone. Continue?"
  cancel-label="Cancel"
  confirm-label="Confirm"
/>
::

## Interaction Notes
- Lock background scroll on open.  
- Primary action must be explicit.  
- ESC and overlay close should be configurable.

## API (Lite)
::TuffPropsTable
---
rows:
  - name: modelValue
    type: 'boolean'
    default: 'false'
    description: 'Dialog visibility'
  - name: title
    type: 'string'
    default: "''"
    description: 'Title'
  - name: width
    type: 'string'
    default: "'480px'"
    description: 'Width'
---
::

## Design Notes
- Prioritize hierarchy and readability over decoration.  
- Keep motion short and decisive.

## Composite Patterns
::TuffDemo{title="Destructive Flow" description="Dialog paired with clear visual warnings." code-lang="vue"}
---
code: |
  <template>
    <TxButton variant="danger">Delete</TxButton>
    <TxModal v-model="open" title="Delete project">
      <TxTag>Irreversible</TxTag>
    </TxModal>
  </template>
---
#preview
<tuff-dialog-demo
  trigger-label="Delete"
  title="Delete project"
  content="This action cannot be undone."
  cancel-label="Cancel"
  confirm-label="Delete"
/>
::
