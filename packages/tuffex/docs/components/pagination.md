# Pagination

A page navigation control for browsing through paged data. Pagination shows the current page number, total pages, and provides controls to move between pages.

<script setup lang="ts">
import { ref } from 'vue'

const page = ref(1)
</script>

## Basic Usage

Bind `current-page` with `v-model` and set `total` to the number of items. Pagination calculates the page count automatically from `total` and `page-size`.

<DemoBlock title="Basic Pagination">
<template #preview>
<TxPagination v-model:current-page="page" :total="100" :page-size="10" />
<p style="margin-top: 8px; font-size: 13px; color: var(--vp-c-text-2);">Current page: {{ page }}</p>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const page = ref(1)
</script>

<template>
  <TxPagination v-model:current-page="page" :total="100" :page-size="10" />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Pagination is best placed below or above the data it controls, with consistent positioning across views.
- Use `show-info` to display a summary like "Page 3 of 10".
- Set `show-first-last` to add first/last page jump buttons for datasets with many pages.
- Boundary controls are disabled at the first or last page, and the active page uses `aria-current="page"`.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'currentPage / v-model:current-page', description: 'The active page number.', type: 'number', default: '1' },
  { name: 'pageSize', description: 'Items per page, used to calculate total pages.', type: 'number', default: '10' },
  { name: 'total', description: 'Total number of items.', type: 'number' },
  { name: 'totalPages', description: 'Explicit total page count. Overrides total/pageSize calculation.', type: 'number' },
  { name: 'prevIcon', description: 'Icon name for the previous page button.', type: 'string', default: 'chevron-left' },
  { name: 'nextIcon', description: 'Icon name for the next page button.', type: 'string', default: 'chevron-right' },
  { name: 'showInfo', description: 'Whether to display page info text.', type: 'boolean', default: 'false' },
  { name: 'showFirstLast', description: 'Whether to show first/last page buttons.', type: 'boolean', default: 'false' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'update:currentPage', description: 'Fires for v-model current page updates.', type: '(page: number) => void' },
  { name: 'pageChange', description: 'Fires when the user navigates to a different page.', type: '(page: number) => void' },
]" />

### Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'info', description: 'Custom page info display.', type: '{ currentPage: number, totalPages: number, total?: number }' },
]" />
