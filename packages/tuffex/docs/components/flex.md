# Flex

A lightweight layout container that maps directly to CSS Flexbox. Flex provides a declarative, prop-driven interface for the most common flex layout patterns — direction, gap, alignment, and wrapping — without writing any CSS.

Use Flex for one-dimensional layouts where items flow in a single direction. For two-dimensional layouts, see [Grid](/components/grid).

<script setup lang="ts">
import FlexBasicDemo from '../.vitepress/theme/components/demos/FlexBasicDemo.vue'
import FlexBasicDemoSource from '../.vitepress/theme/components/demos/FlexBasicDemo.vue?raw'
</script>

## Basic Usage

Flex defaults to a horizontal row with 12px spacing. Drop any child elements inside and they will be arranged automatically.

<DemoBlock title="Flex" :code="FlexBasicDemoSource">
  <template #preview>
    <FlexBasicDemo />
  </template>
</DemoBlock>

## Direction

Set `direction` to control how children flow. The four standard flex directions are supported.

<DemoBlock title="Column Direction">
<template #preview>
<TxFlex direction="column" :gap="8" style="max-width: 200px;">
  <div style="padding: 8px 12px; background: var(--vp-c-default-soft); border-radius: 6px;">First</div>
  <div style="padding: 8px 12px; background: var(--vp-c-default-soft); border-radius: 6px;">Second</div>
  <div style="padding: 8px 12px; background: var(--vp-c-default-soft); border-radius: 6px;">Third</div>
</TxFlex>
</template>

<template #code>

```vue
<template>
  <TxFlex direction="column" :gap="8">
    <div>First</div>
    <div>Second</div>
    <div>Third</div>
  </TxFlex>
</template>
```

</template>
</DemoBlock>

## Gap and Alignment

Use `gap` for spacing, `align` for cross-axis alignment, and `justify` for main-axis distribution.

<DemoBlock title="Center Aligned">
<template #preview>
<TxFlex align="center" justify="center" :gap="16" style="height: 80px; border: 1px dashed var(--vp-c-divider); border-radius: 8px;">
  <TxButton size="sm">Action</TxButton>
  <TxButton size="sm" variant="ghost">Cancel</TxButton>
</TxFlex>
</template>

<template #code>

```vue
<template>
  <TxFlex align="center" justify="center" :gap="16">
    <TxButton>Action</TxButton>
    <TxButton variant="ghost">Cancel</TxButton>
  </TxFlex>
</template>
```

</template>
</DemoBlock>

## Wrapping

Set `wrap="wrap"` to allow children to flow onto multiple lines when they exceed the container width.

<DemoBlock title="Wrapping">
<template #preview>
<TxFlex wrap="wrap" :gap="8">
  <TxTag v-for="i in 12" :key="i">Tag {{ i }}</TxTag>
</TxFlex>
</template>

<template #code>

```vue
<template>
  <TxFlex wrap="wrap" :gap="8">
    <TxTag v-for="i in 12" :key="i">Tag {{ i }}</TxTag>
  </TxFlex>
</template>
```

</template>
</DemoBlock>

## Design Notes

- Flex is a convenience wrapper — it renders a single `<div>` with flex styles applied. There is no runtime overhead beyond a standard element.
- For vertical stacking with semantic naming, consider [Stack](/components/stack) which defaults to `direction="column"`.
- When `inline` is true, the container uses `display: inline-flex` instead of `flex`, allowing it to sit alongside inline content.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'direction', description: 'The flex-direction of the container.', type: '\"row\" | \"row-reverse\" | \"column\" | \"column-reverse\"', default: '\"row\"' },
  { name: 'gap', description: 'Spacing between children. Accepts a number (px) or CSS string.', type: 'number | string', default: '12' },
  { name: 'align', description: 'Cross-axis alignment (maps to align-items).', type: 'string', default: '\"stretch\"' },
  { name: 'justify', description: 'Main-axis distribution (maps to justify-content).', type: 'string', default: '\"flex-start\"' },
  { name: 'wrap', description: 'Controls whether children wrap onto multiple lines.', type: '\"nowrap\" | \"wrap\" | \"wrap-reverse\"', default: '\"nowrap\"' },
  { name: 'inline', description: 'When true, uses inline-flex instead of flex.', type: 'boolean', default: 'false' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'The content to arrange within the flex container.' },
]" />
