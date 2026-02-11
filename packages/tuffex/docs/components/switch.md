# Switch

A toggle control that switches between two mutually exclusive states. The switch animates smoothly between on and off positions with spring-physics feedback, providing a tactile, responsive feel.

Use a switch when the user needs to toggle a single setting with an immediate effect — such as enabling a feature, activating a mode, or turning a preference on or off.

<script setup lang="ts">
import { ref } from 'vue'

const basic = ref(false)
const disabledOn = ref(true)
const disabledOff = ref(false)
const small = ref(true)
const medium = ref(true)
const large = ref(true)
</script>

## Basic Usage

Bind a boolean value with `v-model`. Clicking or tapping the switch toggles the state.

<DemoBlock title="Basic Switch">
<template #preview>
<div style="display: flex; gap: 16px; align-items: center;">
  <TxSwitch v-model="basic" />
  <span style="font-size: 13px; color: var(--vp-c-text-2);">{{ basic ? 'On' : 'Off' }}</span>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const enabled = ref(false)
</script>

<template>
  <TxSwitch v-model="enabled" />
</template>
```

</template>
</DemoBlock>

## Disabled

Set `disabled` to prevent interaction. The switch renders in a muted state to visually communicate that it is not actionable.

<DemoBlock title="Disabled">
<template #preview>
<div style="display: flex; gap: 16px; align-items: center;">
  <TxSwitch v-model="disabledOn" disabled />
  <TxSwitch v-model="disabledOff" disabled />
</div>
</template>

<template #code>

```vue
<template>
  <TxSwitch v-model="value" disabled />
</template>
```

</template>
</DemoBlock>

## Sizes

Three sizes are available to fit different contexts: `small` for compact layouts, the default for standard forms, and `large` for prominent, touch-friendly surfaces.

<DemoBlock title="Sizes">
<template #preview>
<div style="display: flex; gap: 16px; align-items: center;">
  <TxSwitch v-model="small" size="small" />
  <TxSwitch v-model="medium" />
  <TxSwitch v-model="large" size="large" />
</div>
</template>

<template #code>

```vue
<template>
  <TxSwitch v-model="value" size="small" />
  <TxSwitch v-model="value" />
  <TxSwitch v-model="value" size="large" />
</template>
```

</template>
</DemoBlock>

## Design Notes

- The switch uses a spring-based animation curve for the thumb movement, creating a natural, physical feel when toggling.
- On press, the thumb gently stretches along the travel axis — a subtle cue inspired by iOS that confirms the user's touch.
- When disabled, opacity is reduced and pointer events are removed. No additional styling is needed.
- Color transitions between the on/off track states are eased to avoid abrupt visual changes.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'The bound boolean state of the switch.', type: 'boolean', default: 'false' },
  { name: 'disabled', description: 'When true, the switch cannot be toggled and appears visually muted.', type: 'boolean', default: 'false' },
  { name: 'size', description: 'Controls the physical dimensions of the switch.', type: '\"small\" | \"default\" | \"large\"', default: '\"default\"' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'change', description: 'Fires after the switch state changes. Useful for side effects like API calls.', type: '(value: boolean) => void' },
  { name: 'update:modelValue', description: 'Fires when the internal value updates. Used by v-model.', type: '(value: boolean) => void' },
]" />
