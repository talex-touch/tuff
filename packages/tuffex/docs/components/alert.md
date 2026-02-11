# Alert

A contextual banner for delivering important messages. Alerts draw the user's attention to information that is relevant to their current context — confirmations, warnings, errors, or general informational notes.

Use alerts sparingly. Reserve them for messages that the user truly needs to see and act upon.

<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(true)
</script>

## Basic Usage

Set `type` to control the visual tone. The four semantic types — `info`, `success`, `warning`, and `error` — each carry distinct color and icon treatments.

<DemoBlock title="Alert Types">
<template #preview>
<div style="display: flex; flex-direction: column; gap: 12px; max-width: 520px;">
  <TxAlert type="info" title="Information" message="Your account settings have been updated." />
  <TxAlert type="success" title="Success" message="The file was uploaded successfully." />
  <TxAlert type="warning" title="Warning" message="Your subscription expires in 3 days." />
  <TxAlert type="error" title="Error" message="Failed to save changes. Please try again." />
</div>
</template>

<template #code>

```vue
<template>
  <TxAlert type="info" title="Information" message="Settings updated." />
  <TxAlert type="success" title="Success" message="File uploaded." />
  <TxAlert type="warning" title="Warning" message="Subscription expiring." />
  <TxAlert type="error" title="Error" message="Save failed." />
</template>
```

</template>
</DemoBlock>

## Closable

Alerts are closable by default. Set `closable` to `false` for persistent messages that should not be dismissed.

<DemoBlock title="Closable">
<template #preview>
<div style="max-width: 520px;">
  <TxAlert v-if="visible" type="info" title="Dismissable" message="Click the close button to dismiss this alert." @close="visible = false" />
  <TxButton v-else size="sm" @click="visible = true">Show Alert</TxButton>
</div>
</template>

<template #code>

```vue
<template>
  <TxAlert type="info" closable title="Notice" message="This can be dismissed." @close="onClose" />
  <TxAlert type="warning" :closable="false" title="Persistent" message="This cannot be dismissed." />
</template>
```

</template>
</DemoBlock>

## Without Icon

Set `show-icon` to `false` to render a text-only alert.

<DemoBlock title="No Icon">
<template #preview>
<div style="max-width: 520px;">
  <TxAlert type="info" :show-icon="false" message="A simple text-only informational alert." />
</div>
</template>

<template #code>

```vue
<template>
  <TxAlert type="info" :show-icon="false" message="Text-only alert." />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Use `title` for a bold headline and `message` for the descriptive body. You can omit `title` for simpler, single-line alerts.
- The `default` slot can be used instead of the `message` prop for rich content (links, formatted text).
- Alerts should appear near the content they relate to — not stacked at the top of the page unless they are truly global.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'type', description: 'The semantic type that determines color and icon.', type: '\"info\" | \"success\" | \"warning\" | \"error\"', default: '\"info\"' },
  { name: 'title', description: 'Bold headline text.', type: 'string' },
  { name: 'message', description: 'Descriptive body text.', type: 'string' },
  { name: 'closable', description: 'Whether the alert can be dismissed by the user.', type: 'boolean', default: 'true' },
  { name: 'showIcon', description: 'Whether to display the type icon.', type: 'boolean', default: 'true' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'close', description: 'Fires when the user dismisses the alert.' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'Custom message content. Replaces the message prop.' },
]" />
