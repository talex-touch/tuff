# LayoutSkeleton

A full-page skeleton placeholder that mimics a common application layout during initial load. LayoutSkeleton renders a shimmer-animated wireframe with sidebar, header, and content regions — giving users an immediate sense of the page structure before real content appears.

Use LayoutSkeleton as a loading state for pages that take a moment to hydrate or fetch initial data. It reduces perceived load time by providing visual continuity.

## Basic Usage

Drop LayoutSkeleton into a container. It fills the available height and width automatically.

<DemoBlock title="LayoutSkeleton">
<template #preview>
<div style="height: 280px; border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden;">
  <TxLayoutSkeleton />
</div>
</template>

<template #code>

```vue
<template>
  <TxLayoutSkeleton />
</template>
```

</template>
</DemoBlock>

## Common Pattern

Use LayoutSkeleton as a `v-if` / `v-else` pair with your actual page content. Once your data is ready, swap the skeleton for the real layout.

<DemoBlock title="Loading Pattern">
<template #code>

```vue
<template>
  <TxLayoutSkeleton v-if="loading" />
  <AppLayout v-else>
    <!-- real content -->
  </AppLayout>
</template>
```

</template>
</DemoBlock>

## Design Notes

- LayoutSkeleton renders a fixed layout shape — it is not configurable. If you need skeleton placeholders for individual sections (cards, lists, text), use `TxSkeleton`, `TxCardSkeleton`, or `TxListItemSkeleton` instead.
- The shimmer animation uses CSS `@keyframes` and `background-position` for zero-JavaScript overhead.
- Place LayoutSkeleton in a container with a defined height. It uses `height: 100%` to fill its parent.

## API

LayoutSkeleton has no props, events, or slots. It renders a self-contained layout wireframe.

### Related Components

| Component | Use Case |
|-----------|----------|
| [`TxSkeleton`](/components/skeleton) | Generic skeleton shapes (text, circle, rectangle) |
| [`TxCardSkeleton`](/components/skeleton) | Card-shaped skeleton placeholder |
| [`TxListItemSkeleton`](/components/skeleton) | List row skeleton placeholder |
| [`TxLoadingState`](/components/loading-state) | Empty state with loading indicator |
| [`TxSpinner`](/components/spinner) | Simple loading spinner |
