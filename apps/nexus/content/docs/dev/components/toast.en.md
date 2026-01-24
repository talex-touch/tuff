---
title: Toast
description: Quick feedback and transient states
category: Feedback
status: beta
since: 1.0.0
tags: [toast, feedback, status]
---

# Toast

> Short-lived status hints that keep the flow uninterrupted.  
> **Status**: Beta

## Demo
<TuffDemo
  title="Status Toasts"
  description="Success, warning, and error states."
  code-lang="ts"
  :code-lines='["toast({ title: \\\"Saved\\\", description: \\\"Changes stored\\\" })", "toast({ title: \\\"Network unstable\\\", description: \\\"Retry later\\\", variant: \\\"warning\\\" })", "toast({ title: \\\"Save failed\\\", description: \\\"Check permissions\\\", variant: \\\"danger\\\" })"]'
>
  <template #preview>
    <TuffToastDemo
      success-label="Success"
      warning-label="Warning"
      error-label="Error"
      success-title="Saved"
      success-description="Changes stored"
      warning-title="Network unstable"
      warning-description="Retry later"
      error-title="Save failed"
      error-description="Check permissions"
    />
  </template>
</TuffDemo>

## Basic Usage
```ts
toast.success('Saved')
toast.warning('Unstable network')
toast.error('Save failed')
```

## API (Lite)
<TuffPropsTable :rows="[
  { name: 'message', type: 'string', default: '-', description: 'Message text' },
  { name: 'duration', type: 'number', default: '2000', description: 'Duration in ms' },
  { name: 'level', type: \"'success' | 'warning' | 'error'\", default: 'success', description: 'Status level' },
]" />

## Design Notes
- Auto-dismiss in ~2s to avoid stacking.  
- Keep contrast readable in dark mode.
