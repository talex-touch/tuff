# StatCard

A compact metric display that pairs a prominent value with a descriptive label. StatCard is designed for dashboards and overview screens where key numbers need to stand out at a glance.

<script setup lang="ts">
import StatCardBasicDemo from '../.vitepress/theme/components/demos/StatCardBasicDemo.vue'
import StatCardBasicDemoSource from '../.vitepress/theme/components/demos/StatCardBasicDemo.vue?raw'
</script>

## Basic Usage

Pass `value` and `label` to display a metric. Optionally add an `iconClass` for visual context.

<DemoBlock title="StatCard" :code="StatCardBasicDemoSource">
  <template #preview>
    <StatCardBasicDemo />
  </template>
</DemoBlock>

## Design Notes

- Values are rendered with `NumberFlow` for smooth animated transitions when data updates.
- Use `clickable` to turn the card into an interactive element — it gains hover and press states.
- Use the `#value` slot when you need custom formatting (e.g., currency symbols, units, or sparklines).
- Keep labels short — one to three words. If you need more context, place it in a tooltip or surrounding layout.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'value', description: 'The primary metric to display.', type: 'number | string' },
  { name: 'label', description: 'Descriptive text below the value.', type: 'string' },
  { name: 'iconClass', description: 'Icon class (UnoCSS Icones) shown beside the label.', type: 'string', default: '\"\"' },
  { name: 'clickable', description: 'Enables hover and press interaction states.', type: 'boolean', default: 'false' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'value', description: 'Custom rendering for the value area.' },
  { name: 'label', description: 'Custom rendering for the label area.' },
]" />
