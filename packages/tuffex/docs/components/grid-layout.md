# GridLayout

A responsive auto-fit grid with an optional interactive hover spotlight effect. GridLayout uses CSS Grid to automatically distribute items into columns based on available width.

## Basic Usage

Place items directly inside `TxGridLayout`. Each item should have the `tx-grid-layout__item` class to opt into the hover spotlight effect.

<DemoBlock title="Grid Layout">
<template #preview>
<TxGridLayout>
  <div v-for="i in 6" :key="i" class="tx-grid-layout__item" style="padding: 24px; text-align: center;">
    Item {{ i }}
  </div>
</TxGridLayout>
</template>

<template #code>

```vue
<template>
  <TxGridLayout>
    <div v-for="i in 6" :key="i" class="tx-grid-layout__item" style="padding: 24px;">
      Item {{ i }}
    </div>
  </TxGridLayout>
</template>
```

</template>
</DemoBlock>

## Design Notes

- The grid uses `auto-fit` with `minmax()` — items automatically wrap to the next row when they can't fit at their minimum width.
- The `interactive` prop enables a hover spotlight that follows the cursor across grid items. Items must have the `tx-grid-layout__item` class for this to work.
- Use `maxColumns` to cap the column count on wide screens, preventing items from becoming too narrow on ultra-wide displays.
- For manual grid control, consider using [Grid](/components/grid) instead.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'minItemWidth', description: 'Minimum width per grid item (CSS value).', type: 'string', default: '\"300px\"' },
  { name: 'gap', description: 'Gap between grid items (CSS value).', type: 'string', default: '\"1.5rem\"' },
  { name: 'maxColumns', description: 'Maximum column count at ≥1400px viewport.', type: 'number', default: '4' },
  { name: 'interactive', description: 'Enable hover spotlight effect on items.', type: 'boolean', default: 'true' },
]" />
