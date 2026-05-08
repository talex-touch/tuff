# Breadcrumb

A navigation aid that shows the user's current location within a hierarchy. Breadcrumbs reduce the number of actions needed to return to a higher-level page.

## Basic Usage

Pass an `items` array where each item has a `label` and an optional `href` for navigation.

<DemoBlock title="Breadcrumb">
<template #preview>
<TxBreadcrumb :items="[
  { label: 'Home', href: '/' },
  { label: 'Components', href: '/components/' },
  { label: 'Breadcrumb' },
]" />
</template>

<template #code>

```vue
<template>
  <TxBreadcrumb :items="[
    { label: 'Home', href: '/' },
    { label: 'Components', href: '/components/' },
    { label: 'Breadcrumb' },
  ]" />
</template>
```

</template>
</DemoBlock>

## Design Notes

- The last item in the breadcrumb represents the current page, renders without a link, and exposes `aria-current="page"` even if the item has `href`.
- Non-current items with `href` render as anchor links. Non-current items without `href` emit a `click` event, useful for SPA navigation with `router.push()`.
- Disabled items render without links, expose `aria-disabled="true"`, and do not emit click events.
- Keep breadcrumbs short — ideally 3–5 levels. If you need more, consider simplifying your navigation hierarchy.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'items', description: 'Array of breadcrumb items.', type: 'Array<{ label: string, icon?: string, href?: string, disabled?: boolean }>' },
  { name: 'separatorIcon', description: 'Icon class for the separator between items.', type: 'string', default: '\"chevron-right\"' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'click', description: 'Fires when a non-current, non-disabled item without href is clicked.', type: '(item: BreadcrumbItem, index: number) => void' },
]" />
