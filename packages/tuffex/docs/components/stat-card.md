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
- Provide an `insight` object to display a change indicator; the label moves to the top and the insight line appears at the bottom.
- Use `variant="progress"` with `progress` to render a radial progress badge (icon color drives the ring).
- Keep labels short — one to three words. If you need more context, place it in a tooltip or surrounding layout.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'value', description: 'The primary metric to display.', type: 'number | string' },
  { name: 'label', description: 'Descriptive text below the value.', type: 'string' },
  { name: 'iconClass', description: 'Icon class (UnoCSS Icones) shown beside the label.', type: 'string', default: '\"\"' },
  { name: 'clickable', description: 'Enables hover and press interaction states.', type: 'boolean', default: 'false' },
  { name: 'insight', description: 'Optional change indicator ({ from, to, type, color, iconClass, suffix, precision }).', type: 'StatCardInsight' },
  { name: 'variant', description: 'Layout variant (`default` | `progress`).', type: 'StatCardVariant', default: '\"default\"' },
  { name: 'progress', description: 'Progress percent (0-100) for progress variant.', type: 'number' },
  { name: 'meta', description: 'Optional bottom line for progress variant.', type: 'string' },
]" />

### StatCardInsight

<ApiSpecTable :rows="[
  { name: 'from', description: 'Baseline value.', type: 'number' },
  { name: 'to', description: 'Current value.', type: 'number' },
  { name: 'type', description: 'Percent or absolute delta.', type: '`percent` | `delta`', default: '`percent`' },
  { name: 'color', description: 'Override indicator color.', type: '`success` | `danger` | `warning` | `info` | string' },
  { name: 'iconClass', description: 'Custom indicator icon.', type: 'string' },
  { name: 'suffix', description: 'Custom suffix (default `%` for percent).', type: 'string' },
  { name: 'precision', description: 'Decimal precision.', type: 'number' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'value', description: 'Custom rendering for the value area.' },
  { name: 'label', description: 'Custom rendering for the label area.' },
  { name: 'meta', description: 'Bottom meta line for progress variant.' },
]" />
