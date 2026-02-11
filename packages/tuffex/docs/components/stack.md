# Stack

A semantic layout container for vertical or horizontal stacking. Stack is a convenience wrapper around Flexbox that provides direction-first API design — you think in terms of "vertical stack" or "horizontal stack" rather than `flex-direction`.

For more granular flex control (row-reverse, wrap-reverse, etc.), see [Flex](/components/flex).

<script setup lang="ts">
import StackBasicDemo from '../.vitepress/theme/components/demos/StackBasicDemo.vue'
import StackBasicDemoSource from '../.vitepress/theme/components/demos/StackBasicDemo.vue?raw'
</script>

## Basic Usage

Stack defaults to vertical direction with 12px spacing.

<DemoBlock title="Vertical Stack" :code="StackBasicDemoSource">
  <template #preview>
    <StackBasicDemo />
  </template>
</DemoBlock>

## Horizontal

Set `direction="horizontal"` to arrange children in a row.

<DemoBlock title="Horizontal Stack">
<template #preview>
<TxStack direction="horizontal" :gap="8">
  <TxButton>Save</TxButton>
  <TxButton variant="ghost">Cancel</TxButton>
</TxStack>
</template>

<template #code>

```vue
<template>
  <TxStack direction="horizontal" :gap="8">
    <TxButton>Save</TxButton>
    <TxButton variant="ghost">Cancel</TxButton>
  </TxStack>
</template>
```

</template>
</DemoBlock>

## With Alignment

Combine `align` and `justify` to position children within the stack.

<DemoBlock title="Centered Stack">
<template #preview>
<TxStack align="center" :gap="12" style="min-height: 120px; border: 1px dashed var(--vp-c-divider); border-radius: 8px; padding: 16px;">
  <span style="font-weight: 600;">Centered Content</span>
  <span style="font-size: 13px; color: var(--vp-c-text-2);">Items are aligned to the center of the cross axis.</span>
</TxStack>
</template>

<template #code>

```vue
<template>
  <TxStack align="center" :gap="12">
    <span>Centered Content</span>
    <span>Items are aligned to the center of the cross axis.</span>
  </TxStack>
</template>
```

</template>
</DemoBlock>

## Design Notes

- Stack is intentionally simpler than Flex. It maps `direction` to human-readable values (`"vertical"` / `"horizontal"`) instead of CSS flex-direction values.
- Use Stack for form layouts, card content sections, button groups, and any place where you need evenly spaced items in a single direction.
- The `wrap` prop only applies when `direction="horizontal"`.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'direction', description: 'The stacking direction.', type: '\"vertical\" | \"horizontal\"', default: '\"vertical\"' },
  { name: 'gap', description: 'Spacing between children. Accepts a number (px) or CSS string.', type: 'number | string', default: '12' },
  { name: 'align', description: 'Cross-axis alignment (maps to align-items).', type: 'string', default: '\"stretch\"' },
  { name: 'justify', description: 'Main-axis distribution (maps to justify-content).', type: 'string', default: '\"flex-start\"' },
  { name: 'wrap', description: 'When true, allows children to wrap to the next line.', type: 'boolean', default: 'false' },
  { name: 'inline', description: 'When true, uses inline-flex instead of flex.', type: 'boolean', default: 'false' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'The content to arrange within the stack.' },
]" />
