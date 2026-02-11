# DataTable

A lightweight data table with built-in sorting, row selection, and custom cell rendering. DataTable is designed for small-to-medium datasets that don't require virtualization.

<script setup lang="ts">
import { ref } from 'vue'

const columns = [
  { key: 'name', title: 'Name' },
  { key: 'role', title: 'Role' },
  { key: 'score', title: 'Score', sortable: true },
]

const data = [
  { id: 1, name: 'Ava', role: 'Designer', score: 92 },
  { id: 2, name: 'Noah', role: 'Engineer', score: 88 },
  { id: 3, name: 'Mia', role: 'PM', score: 95 },
]

const selectedKeys = ref<number[]>([])
</script>

## Basic Usage

Define `columns` for the header and pass `data` as the row source. Enable `striped` and `bordered` for visual clarity.

<DemoBlock title="DataTable">
<template #preview>
<TxDataTable :columns="columns" :data="data" striped bordered />
</template>

<template #code>

```vue
<script setup>
const columns = [
  { key: 'name', title: 'Name' },
  { key: 'role', title: 'Role' },
  { key: 'score', title: 'Score', sortable: true },
]

const data = [
  { id: 1, name: 'Ava', role: 'Designer', score: 92 },
  { id: 2, name: 'Noah', role: 'Engineer', score: 88 },
  { id: 3, name: 'Mia', role: 'PM', score: 95 },
]
</script>

<template>
  <TxDataTable :columns="columns" :data="data" striped bordered />
</template>
```

</template>
</DemoBlock>

## Row Selection

Enable `selectable` and bind `v-model:selected-keys` to track which rows are checked. Each row needs a unique `row-key`.

<DemoBlock title="Selectable">
<template #preview>
<div>
  <TxDataTable
    v-model:selected-keys="selectedKeys"
    :columns="columns"
    :data="data"
    row-key="id"
    selectable
  />
  <p style="margin-top: 8px; font-size: 13px; color: var(--vp-c-text-2);">Selected: {{ selectedKeys }}</p>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const selectedKeys = ref([])
</script>

<template>
  <TxDataTable
    v-model:selected-keys="selectedKeys"
    :columns="columns"
    :data="data"
    row-key="id"
    selectable
  />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Click a sortable column header to cycle through ascending, descending, and unsorted states.
- Use the `#cell-<columnKey>` slot to render custom content (buttons, badges, avatars) in any column.
- For large datasets (1000+ rows), consider using [VirtualList](/components/virtual-list) with a custom row template instead.
- Set `sortOnClient` to `false` when sorting is handled server-side — the table will emit `sortChange` without reordering data.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'columns', description: 'Column definitions.', type: 'DataTableColumn[]', default: '[]' },
  { name: 'data', description: 'Row data source.', type: 'any[]', default: '[]' },
  { name: 'rowKey', description: 'Unique key field or function for each row.', type: 'string | ((row, index) => string | number)', default: '\"index\"' },
  { name: 'loading', description: 'Show loading overlay.', type: 'boolean', default: 'false' },
  { name: 'emptyText', description: 'Text shown when data is empty.', type: 'string', default: '\"No data\"' },
  { name: 'striped', description: 'Alternate row background.', type: 'boolean', default: 'false' },
  { name: 'bordered', description: 'Show table borders.', type: 'boolean', default: 'false' },
  { name: 'hover', description: 'Highlight row on hover.', type: 'boolean', default: 'true' },
  { name: 'selectable', description: 'Enable row checkboxes.', type: 'boolean', default: 'false' },
  { name: 'selectedKeys', description: 'Array of selected row keys.', type: 'Array<string | number>', default: '[]' },
  { name: 'defaultSort', description: 'Initial sort state.', type: '{ key: string, order: \"asc\" | \"desc\" | null }', default: 'null' },
  { name: 'sortOnClient', description: 'Whether to sort data client-side.', type: 'boolean', default: 'true' },
]" />

### DataTableColumn

<ApiSpecTable title="DataTableColumn" :rows="[
  { name: 'key', description: 'Column identifier.', type: 'string' },
  { name: 'title', description: 'Header text.', type: 'string' },
  { name: 'dataIndex', description: 'Data field name (defaults to key).', type: 'string' },
  { name: 'width', description: 'Column width.', type: 'string | number' },
  { name: 'align', description: 'Text alignment.', type: '\"left\" | \"center\" | \"right\"' },
  { name: 'sortable', description: 'Enable sorting for this column.', type: 'boolean' },
  { name: 'sorter', description: 'Custom sort comparator.', type: '(a, b) => number' },
  { name: 'format', description: 'Format cell value as text.', type: '(value, row, index) => string' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'selectionChange', description: 'Fires when selected rows change.', type: '(keys: Array<string | number>) => void' },
  { name: 'sortChange', description: 'Fires when sort state changes.', type: '(sort: { key: string, order: string }) => void' },
  { name: 'rowClick', description: 'Fires when a row is clicked.', type: '(payload: { row: any, index: number }) => void' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'header-{columnKey}', description: 'Custom header content for a specific column.' },
  { name: 'cell-{columnKey}', description: 'Custom cell content for a specific column.', type: '{ row: any, value: any, index: number }' },
  { name: 'empty', description: 'Custom empty state content.' },
]" />
