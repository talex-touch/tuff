# Steps

A step indicator for multi-step processes. Steps provides a clear visual representation of where the user is in a workflow — what has been completed, what is current, and what remains.

<script setup lang="ts">
import { ref } from 'vue'

const active = ref(1)
</script>

## Basic Usage

Set `active` to the current step index (0-based). Each `TxStep` defines a step with a `title` and optional `description`.

<DemoBlock title="Basic Steps">
<template #preview>
<div style="max-width: 560px;">
  <TxSteps :active="active">
    <TxStep title="Account" description="Create your account" />
    <TxStep title="Profile" description="Set up your profile" />
    <TxStep title="Complete" description="Start using the app" />
  </TxSteps>
  <div style="margin-top: 16px; display: flex; gap: 8px;">
    <TxButton size="sm" variant="ghost" :disabled="active <= 0" @click="active--">Previous</TxButton>
    <TxButton size="sm" :disabled="active >= 2" @click="active++">Next</TxButton>
  </div>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const active = ref(1)
</script>

<template>
  <TxSteps :active="active">
    <TxStep title="Account" description="Create your account" />
    <TxStep title="Profile" description="Set up your profile" />
    <TxStep title="Complete" description="Start using the app" />
  </TxSteps>
</template>
```

</template>
</DemoBlock>

## Design Notes

- Steps automatically marks completed items (those before the active index) with a check icon.
- Use `direction="vertical"` for sidebar-style step navigation in forms or wizards.
- Each step can be individually `disabled` to prevent skipping ahead.
- For historical event sequences without active state, use [Timeline](/components/timeline) instead.

## API

### TxSteps Props

<ApiSpecTable :rows="[
  { name: 'active', description: 'The current step index (0-based).', type: 'number | string', default: '0' },
  { name: 'direction', description: 'Layout orientation of the steps.', type: '\"horizontal\" | \"vertical\"', default: '\"horizontal\"' },
  { name: 'size', description: 'Step indicator size.', type: '\"small\" | \"medium\" | \"large\"', default: '\"medium\"' },
]" />

### TxStep Props

<ApiSpecTable :rows="[
  { name: 'title', description: 'Step title text.', type: 'string' },
  { name: 'description', description: 'Step description or subtitle.', type: 'string' },
  { name: 'icon', description: 'Custom icon class for the step circle.', type: 'string' },
  { name: 'status', description: 'Override the automatic status.', type: '\"wait\" | \"completed\"', default: '\"wait\"' },
  { name: 'clickable', description: 'Whether the step can be clicked to navigate.', type: 'boolean', default: 'true' },
  { name: 'disabled', description: 'Prevents interaction with this step.', type: 'boolean', default: 'false' },
]" />
